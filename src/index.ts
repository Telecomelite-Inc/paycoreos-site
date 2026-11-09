import { Hono, type Context, type Next } from "hono";
import { destroySession, clearSessionCookie, ensureAdmin, loadUser } from "./auth";
import { syncAttrHeader } from "./attr";
import * as admin from "./admin";
import { renderApply, renderFee, submitApply } from "./apply";
import { boot } from "./db";
import { layout, simplePage } from "./layout";
import { privacyHtml, termsHtml } from "./legal";
import * as portal from "./portal";
import {
  addBlock,
  addWindow,
  bookPage,
  bookingThanks,
  bookingsAdmin,
  cancelBooking,
  deleteBlock,
  deleteWindow,
  resendBookingWebhook,
  saveBookingSettings,
  submitBooking,
} from "./booking";
import { CALL_CARD, CALL_SELLS, CALL_VOLUME, CONTACT_TOPICS, callChoice, contactMain, marketingMain, seoOrThrow } from "./publicPages";
import { llmsTxt, pageSeo, robotsTxt, sitemapXml } from "./seo";
import type { Env, SessionUser } from "./types";
import { cleanText, EMAIL, newId, nowIso } from "./util";
import { queueEmail } from "./mail";

const app = new Hono<{ Bindings: Env; Variables: { user: SessionUser | null } }>();

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === "www.paycoreos.com") {
    url.hostname = "paycoreos.com";
    return c.redirect(url.toString(), 301);
  }
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== url.host) return c.text("Bad origin", 403);
      } catch {
        return c.text("Bad origin", 403);
      }
    }
  }
  await boot(c.env);
  await ensureAdmin(c.env);
  c.set("user", await loadUser(c));
  await next();
  const attr = syncAttrHeader(c);
  if (attr) c.header("Set-Cookie", attr, { append: true });
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
  );
});

app.onError((err, c) => {
  console.error(err);
  const url = new URL(c.req.url);
  return c.html(
    simplePage({
      hostname: url.hostname,
      path: url.pathname,
      title: "Something went wrong | PaycoreOS",
      h1: "Something went wrong",
      body: "<p>The page did not finish. Call (407) 270-2502 if you were in the middle of an application.</p>",
    }),
    500,
  );
});

function asset(c: { env: Env; req: { raw: Request } }): Promise<Response> {
  return c.env.ASSETS.fetch(c.req.raw);
}

app.get("/styles.css", (c) => asset(c));
app.get("/track.js", (c) => asset(c));
app.get("/apply.js", (c) => asset(c));
app.get("/contact.js", (c) => asset(c));
app.get("/assets/*", (c) => asset(c));

app.get("/robots.txt", (c) => c.text(robotsTxt()));
app.get("/sitemap.xml", (c) => c.body(sitemapXml(), 200, { "Content-Type": "application/xml; charset=utf-8" }));
app.get("/llms.txt", (c) => c.text(llmsTxt()));

const MARKETING = ["/", "/call-centers", "/ecommerce", "/retail", "/restaurants", "/switching", "/startups", "/declined", "/dispute-defense", "/services", "/about", "/contact", "/application-fee"];

for (const path of MARKETING) {
  app.get(path, (c) => {
    const url = new URL(c.req.url);
    const main = marketingMain(path, url, path === "/contact" && url.searchParams.get("received") === "1");
    if (!main) return c.notFound();
    return c.html(layout({ hostname: url.hostname, seo: seoOrThrow(path), main, jsonLd: path === "/" }));
  });
}

app.get("/privacy", (c) => {
  const url = new URL(c.req.url);
  return c.html(layout({ hostname: url.hostname, seo: pageSeo("/privacy")!, main: privacyHtml() }));
});

app.get("/terms", (c) => {
  const url = new URL(c.req.url);
  return c.html(layout({ hostname: url.hostname, seo: pageSeo("/terms")!, main: termsHtml() }));
});

app.post("/contact", async (c) => {
  const form = await c.req.formData();
  const values = {
    name: cleanText(String(form.get("name") || ""), 200),
    email: cleanText(String(form.get("email") || ""), 200),
    phone: cleanText(String(form.get("phone") || ""), 40),
    message: cleanText(String(form.get("message") || ""), 4000),
    topic: String(form.get("topic") || ""),
    sells: String(form.get("sells") || ""),
    card_status: String(form.get("card_status") || ""),
    monthly_volume: String(form.get("monthly_volume") || ""),
  };
  const url = new URL(c.req.url);
  if (values.topic === "call") {
    const sells = callChoice(CALL_SELLS, values.sells);
    const cardStatus = callChoice(CALL_CARD, values.card_status);
    const volume = callChoice(CALL_VOLUME, values.monthly_volume);
    const errors: string[] = [];
    if (!values.name) errors.push("Name is required.");
    if (values.phone.replace(/\D/g, "").length < 7) errors.push("Phone is required.");
    if (!values.email.includes("@") || !values.email.includes(".")) errors.push("Email is required.");
    if (!sells) errors.push("Choose what you sell.");
    if (!cardStatus) errors.push("Say whether you already take cards or a bank declined the file.");
    if (!volume) errors.push("Choose a rough monthly card volume.");
    if (errors.length || !sells || !cardStatus || !volume) {
      return c.html(layout({ hostname: url.hostname, seo: pageSeo("/contact")!, main: contactMain(url, { errors, values }) }), 400);
    }
    await saveCallRequest(c, values.name, values.phone, values.email, sells, cardStatus, volume, values.message);
    return c.redirect("/thank-you?for=call");
  }
  const topicLabel = callChoice(CONTACT_TOPICS, values.topic);
  if (values.topic && !topicLabel) {
    return c.html(layout({ hostname: url.hostname, seo: pageSeo("/contact")!, main: contactMain(url, { errors: ["Choose a reason."], values }) }), 400);
  }
  if (!values.name || !values.email || !values.message) {
    if (!values.topic) return c.redirect("/contact");
    const errors: string[] = [];
    if (!values.name) errors.push("Name is required.");
    if (!values.email.includes("@") || !values.email.includes(".")) errors.push("Email is required.");
    if (!values.message) errors.push("Message is required.");
    return c.html(layout({ hostname: url.hostname, seo: pageSeo("/contact")!, main: contactMain(url, { errors, values }) }), 400);
  }
  const stamp = nowIso();
  const topic = topicLabel || "A general question";
  await c.env.DB.prepare("INSERT INTO contact_messages (id, name, email, phone, message, topic, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("msg"), values.name, values.email, values.phone, values.message, topic, stamp)
    .run();
  await queueEmail(c.env.DB, {
    to: EMAIL,
    subject: `PaycoreOS contact from ${values.name}`,
    body: `${values.name}\n${values.email}\n${values.phone}\n${topic}\n\n${values.message}`,
    applicationId: null,
  });
  if (!values.topic) return c.redirect("/contact?received=1");
  return c.redirect("/thank-you?for=message");
});

app.post("/contact/call", async (c) => {
  const form = await c.req.formData();
  const values = {
    name: cleanText(String(form.get("name") || ""), 200),
    phone: cleanText(String(form.get("phone") || ""), 40),
    email: cleanText(String(form.get("email") || ""), 200),
    sells: String(form.get("sells") || ""),
    card_status: String(form.get("card_status") || ""),
    monthly_volume: String(form.get("monthly_volume") || ""),
    topic: "call",
  };
  const sells = callChoice(CALL_SELLS, values.sells);
  const cardStatus = callChoice(CALL_CARD, values.card_status);
  const volume = callChoice(CALL_VOLUME, values.monthly_volume);
  const errors: string[] = [];
  if (!values.name) errors.push("Name is required.");
  if (values.phone.replace(/\D/g, "").length < 7) errors.push("Phone is required.");
  if (!values.email.includes("@") || !values.email.includes(".")) errors.push("Email is required.");
  if (!sells) errors.push("Choose what you sell.");
  if (!cardStatus) errors.push("Say whether you already take cards or a bank declined the file.");
  if (!volume) errors.push("Choose a rough monthly card volume.");
  const url = new URL(c.req.url);
  if (errors.length || !sells || !cardStatus || !volume) {
    return c.html(layout({ hostname: url.hostname, seo: pageSeo("/contact")!, main: contactMain(url, { errors, values }) }), 400);
  }
  await saveCallRequest(c, values.name, values.phone, values.email, sells, cardStatus, volume, "");
  return c.redirect("/contact?booked=1#book");
});

app.get("/book", (c) => bookPage(c));
app.post("/book", (c) => submitBooking(c));

app.get("/apply", (c) => renderApply(c));
app.post("/apply", (c) => submitApply(c));
app.get("/apply/fee", (c) => renderFee(c));

app.get("/thank-you", async (c) => {
  const url = new URL(c.req.url);
  const kind = url.searchParams.get("for") || "";
  let h1 = "Thank you";
  let body = `<p>This page confirms a message or an appointment. It is not a payment receipt. The $39 application fee is not collected here.</p>
    <p><a href="/contact">Send a message</a> · <a href="/book">Book a time</a> · <a href="/apply">Apply</a></p>`;
  if (kind === "message") {
    h1 = "Message saved";
    body = `<p class="ok" role="status">We saved your message. Email from this site is not being sent yet. If you need an answer now, call (407) 270-2502.</p>
      <p>This page is not a payment receipt. The $39 application fee is not collected here.</p>
      <p><a href="/book">Prefer to pick a time?</a></p>`;
  } else if (kind === "call") {
    h1 = "Call requested";
    body = `<p class="ok" role="status">PaycoreOS will call. The call is about 20 minutes.</p>
      <p>This page is not a payment receipt. The $39 application fee is not collected here.</p>
      <p><a href="/book">Prefer to pick a time?</a></p>`;
  } else if (kind === "booking") {
    h1 = "Appointment saved";
    body = await bookingThanks(c.env.DB, url.searchParams.get("ref") || "");
  }
  return c.html(
    simplePage({
      hostname: url.hostname,
      path: "/thank-you",
      title: `${h1} | PaycoreOS`,
      h1,
      body,
    }),
  );
});

app.get("/portal/login", (c) => portal.loginPage(c));
app.post("/portal/login", (c) => portal.login(c));
app.post("/portal/logout", async (c) => {
  await destroySession(c);
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", clearSessionCookie(new URL(c.req.url).protocol === "https:"));
  return new Response(null, { status: 303, headers });
});

app.use("/portal", merchantOnly);
app.use("/portal/*", merchantOnly);
app.get("/portal", (c) => portal.home(c));
app.get("/portal/app/:ref", (c) => portal.applicationPage(c, c.req.param("ref")));
app.post("/portal/app/:ref/upload", (c) => portal.upload(c, c.req.param("ref")));
app.post("/portal/app/:ref/answers", (c) => portal.saveAnswers(c, c.req.param("ref")));
app.post("/portal/app/:ref/tickets", (c) => portal.openTicket(c, c.req.param("ref")));
app.post("/portal/tickets/:id/reply", (c) => portal.replyTicket(c, c.req.param("id")));
app.get("/portal/files/:id", (c) => portal.download(c, c.req.param("id")));

app.get("/admin/login", (c) => admin.loginPage(c));
app.post("/admin/login", (c) => admin.login(c));
app.post("/admin/logout", async (c) => {
  await destroySession(c);
  const headers = new Headers({ Location: "/admin/login" });
  headers.append("Set-Cookie", clearSessionCookie(new URL(c.req.url).protocol === "https:"));
  return new Response(null, { status: 303, headers });
});

app.use("/admin", adminOnly);
app.use("/admin/*", adminOnly);
app.get("/admin", (c) => admin.applications(c));
app.get("/admin/applications/:ref", (c) => admin.applicationDetail(c, c.req.param("ref")));
app.post("/admin/applications/:ref/push", (c) => admin.recordPush(c, c.req.param("ref")));
app.post("/admin/applications/:ref/status", (c) => admin.updateStatus(c, c.req.param("ref")));
app.post("/admin/applications/:ref/update", (c) => admin.merchantUpdate(c, c.req.param("ref")));
app.post("/admin/applications/:ref/note", (c) => admin.internalNote(c, c.req.param("ref")));
app.post("/admin/applications/:ref/password", (c) => admin.setPassword(c, c.req.param("ref")));
app.post("/admin/tickets/:id/reply", (c) => admin.replyTicket(c, c.req.param("id")));
app.get("/admin/processors", (c) => admin.processors(c));
app.post("/admin/processors", (c) => admin.saveProcessor(c, null));
app.get("/admin/processors/:id", (c) => admin.processorEdit(c, c.req.param("id")));
app.post("/admin/processors/:id", (c) => admin.saveProcessor(c, c.req.param("id")));
app.post("/admin/processors/:id/delete", (c) => admin.deleteProcessor(c, c.req.param("id")));
app.get("/admin/fields", (c) => admin.fields(c));
app.get("/admin/fields/new", (c) => admin.fieldFormPage(c, null));
app.post("/admin/fields", (c) => admin.saveField(c, null));
app.get("/admin/fields/:id", (c) => admin.fieldFormPage(c, c.req.param("id")));
app.post("/admin/fields/:id", (c) => admin.saveField(c, c.req.param("id")));
app.post("/admin/fields/:id/delete", (c) => admin.deleteField(c, c.req.param("id")));
app.get("/admin/statuses", (c) => admin.statuses(c));
app.post("/admin/statuses", (c) => admin.saveStatus(c, null));
app.get("/admin/statuses/:id", (c) => admin.statusEdit(c, c.req.param("id")));
app.post("/admin/statuses/:id", (c) => admin.saveStatus(c, c.req.param("id")));
app.post("/admin/statuses/:id/delete", (c) => admin.deleteStatus(c, c.req.param("id")));
app.get("/admin/ticket-types", (c) => admin.ticketTypes(c));
app.post("/admin/ticket-types", (c) => admin.saveTicketType(c, null));
app.get("/admin/ticket-types/:id", (c) => admin.ticketTypeEdit(c, c.req.param("id")));
app.post("/admin/ticket-types/:id", (c) => admin.saveTicketType(c, c.req.param("id")));
app.post("/admin/ticket-types/:id/delete", (c) => admin.deleteTicketType(c, c.req.param("id")));
app.get("/admin/messages", (c) => admin.messages(c));
app.get("/admin/bookings", (c) => bookingsAdmin(c));
app.post("/admin/bookings/settings", (c) => saveBookingSettings(c));
app.post("/admin/bookings/windows", (c) => addWindow(c));
app.post("/admin/bookings/windows/:id/delete", (c) => deleteWindow(c, c.req.param("id")));
app.post("/admin/bookings/blocks", (c) => addBlock(c));
app.post("/admin/bookings/blocks/:id/delete", (c) => deleteBlock(c, c.req.param("id")));
app.post("/admin/bookings/:id/cancel", (c) => cancelBooking(c, c.req.param("id")));
app.post("/admin/bookings/:id/webhook", (c) => resendBookingWebhook(c, c.req.param("id")));
app.get("/admin/outbox", (c) => admin.outbox(c));
app.get("/admin/files/:id", (c) => admin.download(c, c.req.param("id")));

app.notFound((c) => {
  const url = new URL(c.req.url);
  return c.html(
    simplePage({
      hostname: url.hostname,
      path: url.pathname,
      title: "Page not found | PaycoreOS",
      h1: "Page not found",
      body: `<p>That page is not on PaycoreOS. <a href="/">Go to the home page</a>.</p>`,
    }),
    404,
  );
});

async function saveCallRequest(
  c: Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>,
  name: string,
  phone: string,
  email: string,
  sells: string,
  cardStatus: string,
  volume: string,
  notes: string,
): Promise<void> {
  const stamp = nowIso();
  await c.env.DB.prepare(
    "INSERT INTO call_requests (id, name, phone, email, sells, card_status, monthly_volume, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(newId("call"), name, phone, email, sells, cardStatus, volume, notes, stamp)
    .run();
  await queueEmail(c.env.DB, {
    to: EMAIL,
    subject: `PaycoreOS call request from ${name}`,
    body: `${name}\n${phone}\n${email}\n${sells}\n${cardStatus}\n${volume}\n${notes}\n\nThis is a call request. It is not a fee payment.`,
    applicationId: null,
  });
}

async function merchantOnly(c: Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>, next: Next) {
  if (c.req.path === "/portal/login") return next();
  const user = c.get("user");
  if (!user || user.role !== "merchant") {
    const nextUrl = new URL(c.req.url).pathname + new URL(c.req.url).search;
    return c.redirect(`/portal/login?next=${encodeURIComponent(nextUrl)}`);
  }
  return next();
}

async function adminOnly(c: Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>, next: Next) {
  if (c.req.path === "/admin/login") return next();
  const user = c.get("user");
  if (!user || user.role !== "admin") return c.redirect("/admin/login");
  return next();
}

export default app;
