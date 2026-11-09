const base = process.env.BASE || "http://127.0.0.1:8787";
const banned = /maverick|kurv|nexio|nuvei|disputifier/i;
const failures = [];
function fail(msg) { failures.push(msg); console.error("FAIL", msg); }
function ok(msg) { console.log("OK", msg); }

const pages = ["/", "/call-centers", "/ecommerce", "/retail", "/restaurants", "/switching", "/startups", "/declined", "/dispute-defense", "/services", "/apply", "/about", "/book", "/contact", "/privacy", "/terms", "/application-fee"];
const html = {};
for (const path of pages) {
  const res = await fetch(base + path);
  const text = await res.text();
  html[path] = text;
  if (res.status !== 200) fail(`${path} status ${res.status}`);
  const h1s = text.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) fail(`${path} has ${h1s.length} h1 tags`);
  for (const tag of ["<title>", 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:description"', 'property="og:url"']) {
    if (!text.includes(tag)) fail(`${path} missing ${tag}`);
  }
  const footer = text.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || "";
  if (!footer) fail(`${path} missing footer`);
  if (path === "/") {
    if (footer.includes("1809 E Broadway") || footer.includes("(407) 270-2502") || footer.includes("info@paycoreos.com")) {
      fail("homepage footer still shows address, phone, or email");
    }
    if (!footer.includes('href="/contact"')) fail("homepage footer missing contact link");
    if (footer.includes("sf-legal") || footer.includes("<address>")) fail("homepage footer still has the legal block");
  } else if (!text.includes("PaycoreOS, a DBA of Telecom Elite, Inc., 1809 E Broadway St, Oviedo, FL 32765, (407) 270-2502, info@paycoreos.com.")) {
    fail(`${path} missing footer identity`);
  }
  if (banned.test(text)) fail(`${path} names a supplier`);
  if (/stripe|js\.stripe|pk_live|pk_test/i.test(text)) fail(`${path} mentions Stripe`);
  const boardingPages = new Set(["/about", "/call-centers", "/ecommerce", "/retail", "/restaurants", "/switching", "/startups", "/declined"]);
  if (text.includes("98%") && !boardingPages.has(path)) fail(`${path} has 98%`);
  if (boardingPages.has(path) && path !== "/about" && !text.includes("98% boarding success across hundreds of applications since 2013")) {
    fail(`${path} has 98% without the basis`);
  }
  if (path !== "/apply" && path !== "/about" && /\d+(\.\d+)?%/.test(text.replace(/98%/g, ""))) fail(`${path} has a percent`);
}
if (!html["/about"].includes("98% boarding success across hundreds of applications since 2013")) fail("about missing 98% basis");
for (const path of ["/", "/services", "/ecommerce", "/call-centers"]) {
  if (!html[path].includes("Authorize.Net") || !html[path].includes("NMI")) fail(`${path} missing gateways`);
  if (!/gateway/i.test(html[path])) fail(`${path} missing gateway`);
}
if (/Authorize\.Net processor|NMI processor/i.test(Object.values(html).join("\n"))) fail("gateway called a processor");
if (/high-risk|offshore|nutra|quantic|0\.38|94%/i.test(Object.values(html).join("\n"))) fail("old marketing claim is still on a public page");
const ld = html["/"].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) fail("json-ld script missing");
else {
  const data = JSON.parse(ld[1]);
  if (data["@type"] !== "ProfessionalService") fail("json-ld type");
  if (!data.telephone || !data.email || !data.address) fail("json-ld contact");
  const names = JSON.stringify(data);
  if (banned.test(names)) fail("json-ld names a supplier");
  if (!names.includes("Authorize.Net gateway") || !names.includes("NMI gateway") || !names.includes("Dispute defense")) fail("json-ld services");
  if (!names.includes("Applications after a bank decline")) fail("json-ld missing bank-decline service");
  if (/aggregateRating|reviewCount|ratingValue/i.test(names)) fail("json-ld has a rating");
}
for (const path of pages) {
  const canon = path === "/" ? "https://paycoreos.com/" : `https://paycoreos.com${path}`;
  if (!html[path].includes(`rel="canonical" href="${canon}"`)) fail(`${path} canonical`);
}
if (!html["/"].includes("application/ld+json")) fail("home missing json-ld");
if (/aggregateRating|reviewCount|ratingValue/i.test(html["/"])) fail("home has a rating");
if (!html["/dispute-defense"].includes("MID") || !html["/dispute-defense"].includes("CAID")) fail("defense page missing MID/CAID");
if (html["/dispute-defense"].includes("Start a processing application")) fail("upsell is on the defense page");
if (!html["/switching"].includes("Already processing? Bring your statement.")) fail("switching h1");
if (!html["/call-centers"].includes("Card-not-present processing for call centers")) fail("call center h1");
if (!html["/declined"].includes("<h1>Declined by a big bank?</h1>")) fail("declined h1");
if (!html["/declined"].includes("PaycoreOS still submits the application. Most underwriting decisions within 24–72 business hours. That is not a promise of approval.")) fail("declined support line");
if (!html["/declined"].includes("declined=1")) fail("declined page does not link into apply");
if (!html["/declined"].includes("$39")) fail("declined page missing fee");
if (/guaranteed approval|guaranteed placement/i.test(html["/declined"])) fail("declined page promises approval");
const landing = ["/call-centers", "/ecommerce", "/retail", "/restaurants", "/switching", "/startups", "/declined", "/dispute-defense"];
for (const path of landing) {
  if (!html[path].includes("<h2>How it works</h2>")) fail(`${path} missing how it works`);
  if (!html[path].includes("Tell us how you take payments") || !html[path].includes("We review the file") || !html[path].includes("We call you")) {
    fail(`${path} missing the three steps`);
  }
  if (!html[path].includes('href="/application-fee"') && !html[path].includes("application-fee?")) fail(`${path} fee sentence missing link`);
  if ((html[path].match(/class="btn-p"/g) || []).length !== 2) fail(`${path} should have Apply at the top and again after the story`);
  if (html[path].includes("fee-box")) fail(`${path} still has the fee policy block`);
  if (/guaranteed approval|guaranteed placement|beat any quote/i.test(html[path])) fail(`${path} overclaims`);
  if (!html[path].includes("Want a read on the file first?")) fail(`${path} missing the call link`);
}
if (html["/dispute-defense"].includes("98%")) fail("defense page has 98%");
if (html["/dispute-defense"].includes("Start a processing application")) fail("upsell is on the defense page");
if (!html["/"].includes('href="/declined"') && !html["/"].includes("href=\"/declined?")) fail("home missing declined path");
if (!html["/"].includes("Merchant processing")) fail("home missing eyebrow");
if (!html["/"].includes("/assets/home/home-hero.jpg")) fail("home missing hero graphic");
if ((html["/"].match(/class="btn-p"/g) || []).length !== 1) fail("home should have one primary Apply button");
if (!html["/"].includes(">Want a read on the file first?</a>")) fail("home missing call link");
if (!html["/"].includes('href="/book"') && !html["/"].includes('href="/book?')) fail("home call link should go to /book");
const homeFooter = html["/"].match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || "";
if (/1809 E Broadway|\(407\) 270-2502|info@paycoreos.com|which company receives/i.test(homeFooter)) fail("homepage footer shows contact identity");
const homeVisible = html["/"].replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
if (/1809 E Broadway|\(407\) 270-2502|info@paycoreos.com|which company receives the file/i.test(homeVisible)) fail("homepage shows address, phone, email, or processor sentence");
const declinedApply = await (await fetch(base + "/apply?vertical=ecommerce&declined=1")).text();
if (!declinedApply.includes("Were you declined by a bank?")) fail("apply missing bank-decline question");
if (!declinedApply.includes('name="f_declined_by_bank" value="yes" checked')) fail("declined=1 did not select yes");
if (!declinedApply.includes("Which bank?")) fail("declined=1 missing bank name");
if (!declinedApply.includes('name="file_decline_notice"')) fail("declined=1 missing optional notice");
if (/name="file_decline_notice"[^>]*required/.test(declinedApply)) fail("decline notice is required");
if (banned.test(declinedApply)) fail("declined apply names a supplier");
const thanks = await fetch(base + "/thank-you");
const thanksHtml = await thanks.text();
if (thanks.status !== 200) fail(`thank-you status ${thanks.status}`);
if (!thanksHtml.includes("noindex")) fail("thank-you missing noindex");
if (!thanksHtml.includes("The $39 application fee is not collected here.")) fail("thank-you missing fee note");
if (thanksHtml.includes("fee_paid") || thanksHtml.includes("Page not found")) fail("thank-you looks like a missing page or a payment");
if (banned.test(thanksHtml)) fail("thank-you names a supplier");

const robots = await (await fetch(base + "/robots.txt")).text();
for (const agent of ["Googlebot", "Bingbot", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot"]) {
  if (!robots.includes(`User-agent: ${agent}`)) fail(`robots missing ${agent}`);
}
for (const path of ["/thank-you", "/admin", "/portal"]) {
  if (!robots.includes(`Disallow: ${path}`)) fail(`robots missing disallow ${path}`);
}
const sitemap = await (await fetch(base + "/sitemap.xml")).text();
for (const path of pages) {
  const loc = path === "/" ? "https://paycoreos.com/" : `https://paycoreos.com${path}`;
  if (!sitemap.includes(`<loc>${loc}</loc>`)) fail(`sitemap missing ${loc}`);
}
if (/thank-you|\/admin|\/portal/.test(sitemap)) fail("sitemap lists a private url");
const llms = await (await fetch(base + "/llms.txt")).text();
if (banned.test(llms)) fail("llms names a supplier");
if (!llms.includes("info@paycoreos.com") || !llms.includes("1809 E Broadway St")) fail("llms missing contact");
if (/\d+(\.\d+)?%/.test(llms)) fail("llms has a percent");

const tracked = await fetch(base + "/restaurants?gclid=g-1&utm_source=google&fbclid=f-1&li_fat_id=l-1");
const cookie = (tracked.headers.getSetCookie?.() || []).join(";");
if (!cookie.includes("paycore_attr") || !cookie.includes("g-1")) fail("click id cookie missing");

const form = new FormData();
form.set("category", "dispute-defense");
form.set("email", "merchant-audit@example.com");
form.set("password", "portal-password-1");
form.set("password_confirm", "portal-password-1");
form.set("agree", "yes");
form.set("gclid", "g-1");
form.set("utm_source", "google");
form.set("fbclid", "f-1");
form.set("li_fat_id", "l-1");
const fields = {
  legal_business_name: "Audit Cafe LLC",
  contact_name: "Ada Audit",
  phone: "407-555-0100",
  business_address: "1 Main St",
  city: "Oviedo",
  state: "FL",
  zip: "32765",
  accepts_cards: "yes",
  merchant_processor: "Square",
  descriptor: "AUDIT CAFE",
  mid: "MID123456",
  caid: "CAID987",
  website_url: "https://audit.example",
};
for (const [key, value] of Object.entries(fields)) form.set("f_" + key, value);
form.set("f_declined_by_bank", "no");
form.append("f_defense_tools", "order_insight");
form.append("f_defense_tools", "ethoca_alerts");
const submitted = await fetch(base + "/apply", { method: "POST", body: form, redirect: "manual" });
if (submitted.status !== 303) {
  const err = await submitted.text();
  fail(`defense submit status ${submitted.status} ${err.slice(0, 500)}`);
} else {
  const loc = submitted.headers.get("location");
  const session = (submitted.headers.getSetCookie?.() || []).find((c) => c.startsWith("paycore_session="));
  if (!session) fail("no session cookie");
  if (!loc?.startsWith("/apply/fee")) fail(`fee redirect ${loc}`);
  const fee = await fetch(base + loc, { headers: { cookie: session.split(";")[0] } });
  const feeHtml = await fee.text();
  if (fee.status !== 200) fail(`fee page ${fee.status}`);
  if (!feeHtml.includes("disabled") || !/Pay \$39/.test(feeHtml)) fail("pay button missing");
  if (feeHtml.includes("fee_paid")) fail("fee page contains fee_paid");
  if (!feeHtml.includes("application_submitted")) fail("submitted event missing");
  if (!feeHtml.includes("PaycoreOS will call to go over the file.")) fail("confirmation missing callback");
  if (banned.test(feeHtml)) fail("fee page names a supplier");
  const portal = await fetch(base + "/portal", { headers: { cookie: session.split(";")[0] } });
  const portalHtml = await portal.text();
  if (portal.status !== 200) fail(`portal ${portal.status}`);
  if (banned.test(portalHtml)) fail("portal names a supplier");
  const ref = loc.split("ref=")[1];
  const appPage = await fetch(base + "/portal/app/" + ref, { headers: { cookie: session.split(";")[0] } });
  const appHtml = await appPage.text();
  if (!appHtml.includes("Start a processing application")) fail("portal missing defense upsell");
  if (!appHtml.includes("Square") || !appHtml.includes("MID123456")) fail("portal missing merchant answers");
  if (banned.test(appHtml)) fail("application page names a supplier");
  ok("defense application " + ref);

  const adminForm = new FormData();
  adminForm.set("email", "admin@paycoreos.com");
  adminForm.set("password", process.env.ADMIN_PASSWORD || "");
  const adminLogin = await fetch(base + "/admin/login", { method: "POST", body: adminForm, redirect: "manual" });
  const adminCookie = (adminLogin.headers.getSetCookie?.() || []).find((c) => c.startsWith("paycore_session="));
  if (!adminCookie || adminLogin.status !== 303) fail(`admin login ${adminLogin.status}`);
  else {
    const cookieHeader = adminCookie.split(";")[0];
    const detail = await fetch(base + "/admin/applications/" + ref, { headers: { cookie: cookieHeader } });
    const detailHtml = await detail.text();
    if (!detailHtml.includes("Callback:") || !detailHtml.includes("PaycoreOS will call to go over the file.")) fail("admin missing callback flag");
    if (!detailHtml.includes("Disputifier")) fail("admin cannot see Disputifier");
    const id = detailHtml.match(/name="processor_id"[\s\S]*?<option value="(proc_disputifier)"/)?.[1]
      || detailHtml.match(/value="(proc_disputifier)"/)?.[1];
    if (!id) fail("disputifier option missing");
    const push = new FormData();
    push.set("processor_id", id);
    push.set("push_target", "manual-defense-1");
    push.set("mark_submitted", "yes");
    const pushed = await fetch(base + "/admin/applications/" + ref + "/push", { method: "POST", body: push, headers: { cookie: cookieHeader }, redirect: "manual" });
    if (pushed.status < 300 || pushed.status > 399) fail(`push ${pushed.status}`);
    const note = new FormData();
    note.set("body", "Internal only: file is with Disputifier.");
    await fetch(base + "/admin/applications/" + ref + "/note", { method: "POST", body: note, headers: { cookie: cookieHeader }, redirect: "manual" });
    const update = new FormData();
    update.set("body", "We have the file and will write if we need a document.");
    await fetch(base + "/admin/applications/" + ref + "/update", { method: "POST", body: update, headers: { cookie: cookieHeader }, redirect: "manual" });
    const after = await fetch(base + "/portal/app/" + ref, { headers: { cookie: session.split(";")[0] } });
    const afterHtml = await after.text();
    if (banned.test(afterHtml)) fail("merchant saw a supplier after admin push");
    if (!afterHtml.includes("We have the file and will write if we need a document.")) fail("merchant missed the visible update");
    if (!afterHtml.includes("Submitted")) fail("submitted status missing on the portal");
    const field = new FormData();
    field.set("key", "audit_note");
    field.set("label", "Extra retail note");
    field.set("help_text", "Added in admin without a code change.");
    field.set("field_type", "text");
    field.set("section", "screening");
    field.set("categories", "retail");
    field.set("sort_order", "500");
    field.set("active", "yes");
    const added = await fetch(base + "/admin/fields", { method: "POST", body: field, headers: { cookie: cookieHeader }, redirect: "manual" });
    if (added.status < 300 || added.status > 399) fail(`add field ${added.status}`);
    const retail = await (await fetch(base + "/apply?vertical=retail&buyer=first")).text();
    if (!retail.includes("Extra retail note")) fail("new field did not show on the apply form");
    const fieldList = await (await fetch(base + "/admin/fields", { headers: { cookie: cookieHeader } })).text();
    const fieldId = fieldList.match(/href="\/admin\/fields\/(fld_[^"]+)"[^>]*>Extra retail note/)?.[1];
    if (!fieldId) fail("new field missing in admin");
    else await fetch(base + "/admin/fields/" + fieldId + "/delete", { method: "POST", headers: { cookie: cookieHeader } });
    if (afterHtml.includes("Internal only")) fail("internal note leaked");
    if (afterHtml.includes("manual-defense-1")) fail("push target leaked");
    const outbox = await fetch(base + "/admin/outbox", { headers: { cookie: cookieHeader } });
    const outHtml = await outbox.text();
    if (!outHtml.includes("queued") || !outHtml.includes("info@paycoreos.com")) fail("outbox missing queued mail");
    if (!outHtml.includes("Nothing is delivered") && !outHtml.includes("not being sent") && !outHtml.includes("Real email stays off")) {
      fail("outbox does not say delivery is off");
    }
    ok("admin push stayed off the portal");
  }
}

const missing = new FormData();
missing.set("category", "call-centers");
missing.set("buyer", "existing");
missing.set("email", "callcenter-audit@example.com");
missing.set("password", "portal-password-1");
missing.set("password_confirm", "portal-password-1");
missing.set("agree", "yes");
missing.set("f_legal_business_name", "Call Co");
missing.set("f_contact_name", "Cam Caller");
missing.set("f_phone", "407-555-0199");
missing.set("f_business_address", "2 Main");
missing.set("f_city", "Oviedo");
missing.set("f_state", "FL");
missing.set("f_zip", "32765");
missing.set("f_ein", "12-3456789");
missing.append("f_how_accepted", "phone");
missing.set("f_card_or_ach", "card");
missing.append("f_phone_tools", "virtual_terminal");
missing.set("f_gateway_choice", "authorizenet");
missing.set("f_swipe_band", "under_70");
missing.set("f_website_url", "https://call.example");
missing.set("f_website_username", "owner");
missing.set("f_website_password", "site-pass");
missing.set("f_declined_by_bank", "no");
const denied = await fetch(base + "/apply", { method: "POST", body: missing });
const deniedHtml = await denied.text();
if (denied.status !== 400) fail(`call center without files status ${denied.status}`);
if (!deniedHtml.includes("Agreements") || !deniedHtml.includes("Scripts") || !deniedHtml.includes("Articles")) fail("call center did not require the three files");
if (banned.test(deniedHtml)) fail("call center form names a supplier");
if (!deniedHtml.includes("Authorize.Net gateway")) fail("call center form missing Authorize.Net");

const contact = new FormData();
contact.set("name", "Pat Contact");
contact.set("email", "pat@example.com");
contact.set("phone", "407-555-0133");
contact.set("message", "Please call me about retail.");
const sent = await fetch(base + "/contact", { method: "POST", body: contact, redirect: "manual" });
if (sent.status < 300 || sent.status > 399) fail(`contact ${sent.status}`);
const received = await (await fetch(base + "/contact?received=1")).text();
if (!received.includes("We saved your message")) fail("contact confirmation missing");
if ((html["/contact"].match(/<form\b/g) || []).length !== 1) fail("contact should have one form");
if (!html["/contact"].includes('name="topic"')) fail("contact missing reason selector");
if (!html["/contact"].includes('id="book"')) fail("contact missing booking pointer");
if (!html["/contact"].includes('href="/book"')) fail("contact missing book link");
if (!html["/contact"].includes("Already take cards") || !html["/contact"].includes("A bank declined them")) fail("contact call form missing card status");
if (!html["/contact"].includes("Rough monthly card volume")) fail("contact call form missing volume");
if (/<iframe|calendly|calendar\.google/i.test(html["/contact"])) fail("contact embeds a calendar");
if (/no calendar|booking link/i.test(html["/contact"])) fail("contact mentions a missing calendar");
const call = new FormData();
call.set("name", "Casey Caller");
call.set("phone", "407-555-0166");
call.set("email", "casey@example.com");
call.set("sells", "retail");
call.set("card_status", "declined");
call.set("monthly_volume", "10k-50k");
const called = await fetch(base + "/contact/call", { method: "POST", body: call, redirect: "manual" });
if (called.status < 300 || called.status > 399) fail(`call request ${called.status}`);
const booked = await (await fetch(base + "/contact?booked=1")).text();
if (!booked.includes("PaycoreOS will call. The call is about 20 minutes.")) fail("call confirmation missing");
if (/no calendar|booking link/i.test(booked)) fail("call page mentions a missing calendar");
if (booked.includes("fee_paid") || booked.includes('data-paycore-also="fee_paid"')) fail("call request fired fee_paid");
if (/<iframe|calendly/i.test(booked)) fail("call confirmation embeds a calendar");

const declinedForm = new FormData();
declinedForm.set("category", "dispute-defense");
declinedForm.set("declined", "1");
declinedForm.set("email", "declined-audit@example.com");
declinedForm.set("password", "portal-password-1");
declinedForm.set("password_confirm", "portal-password-1");
declinedForm.set("agree", "yes");
declinedForm.set("f_declined_by_bank", "yes");
declinedForm.set("f_legal_business_name", "Declined Audit LLC");
declinedForm.set("f_contact_name", "Dee Clined");
declinedForm.set("f_phone", "407-555-0144");
declinedForm.set("f_business_address", "9 Main St");
declinedForm.set("f_city", "Oviedo");
declinedForm.set("f_state", "FL");
declinedForm.set("f_zip", "32765");
declinedForm.set("f_accepts_cards", "yes");
declinedForm.set("f_merchant_processor", "Square");
declinedForm.set("f_descriptor", "DECLINED AUDIT");
declinedForm.set("f_mid", "MID555");
declinedForm.set("f_caid", "CAID555");
declinedForm.set("f_website_url", "https://declined.example");
declinedForm.append("f_defense_tools", "order_insight");
const missingBank = await fetch(base + "/apply", { method: "POST", body: declinedForm, redirect: "manual" });
const missingBankHtml = await missingBank.text();
if (missingBank.status !== 400 || !missingBankHtml.includes("Which bank?")) fail(`bank name not required ${missingBank.status}`);
declinedForm.set("f_declined_bank", "Example National Bank");
const declinedSubmit = await fetch(base + "/apply", { method: "POST", body: declinedForm, redirect: "manual" });
if (declinedSubmit.status !== 303) {
  const err = await declinedSubmit.text();
  fail(`declined submit ${declinedSubmit.status} ${err.slice(0, 400)}`);
} else {
  const loc = declinedSubmit.headers.get("location") || "";
  const ref = loc.split("ref=")[1];
  const session = (declinedSubmit.headers.getSetCookie?.() || []).find((c) => c.startsWith("paycore_session="));
  const portalHtml = await (await fetch(base + "/portal/app/" + ref, { headers: { cookie: session.split(";")[0] } })).text();
  if (!portalHtml.includes("Example National Bank")) fail("portal missing the bank the merchant named");
  if (banned.test(portalHtml)) fail("declined portal names a supplier");
  const adminForm = new FormData();
  adminForm.set("email", "admin@paycoreos.com");
  adminForm.set("password", process.env.ADMIN_PASSWORD || "");
  const adminLogin = await fetch(base + "/admin/login", { method: "POST", body: adminForm, redirect: "manual" });
  const adminCookie = (adminLogin.headers.getSetCookie?.() || []).find((c) => c.startsWith("paycore_session="));
  const detailHtml = await (await fetch(base + "/admin/applications/" + ref, { headers: { cookie: adminCookie.split(";")[0] } })).text();
  if (!detailHtml.includes("Declined by a bank:") || !detailHtml.includes(">Yes<") || !detailHtml.includes("Example National Bank")) {
    fail("admin missing declined-by-bank flag");
  }
  if (!detailHtml.includes("Callback:")) fail("declined application missing callback flag");
  const messages = await (await fetch(base + "/admin/messages", { headers: { cookie: adminCookie.split(";")[0] } })).text();
  if (!messages.includes("Casey Caller") || !messages.includes("A bank declined them") || !messages.includes("$10,000 to $50,000")) {
    fail("admin missing call request");
  }
  if (messages.includes("fee_paid")) fail("call request stored as fee_paid");
  ok("declined application " + ref);
}

const bookPage = html["/book"];
const tcpa = bookPage.match(/<input[^>]*name="tcpa_consent"[^>]*>/);
const recording = bookPage.match(/<input[^>]*name="recording_consent"[^>]*>/);
if (!tcpa) fail("book page missing TCPA checkbox");
else if (/\bchecked\b/.test(tcpa[0])) fail("TCPA checkbox is checked by default");
if (!recording) fail("book page missing recording checkbox");
else if (/\bchecked\b/.test(recording[0])) fail("recording checkbox is checked by default");
if (!bookPage.includes("Florida law requires all parties")) fail("book page missing Florida recording notice");
if (/<iframe|calendly|calendar\.google/i.test(bookPage)) fail("book page embeds a calendar");
const slot = bookPage.match(/name="starts_at" value="([^"]+)"/)?.[1];
if (!slot) fail("book page has no open slot");
else {
  const booking = new FormData();
  booking.set("name", "Riley Booker");
  booking.set("email", "riley@example.com");
  booking.set("phone", "407-555-0177");
  booking.set("business_name", "Riley Retail LLC");
  booking.set("topic", "file-read");
  booking.set("notes", "Call about a first account.");
  booking.set("starts_at", slot);
  booking.set("date", bookPage.match(/name="date" value="([^"]+)"/)?.[1] || "");
  const booked = await fetch(base + "/book", { method: "POST", body: booking, redirect: "manual" });
  const bookedLoc = booked.headers.get("location") || "";
  if (booked.status < 300 || booked.status > 399 || !bookedLoc.includes("/thank-you?for=booking")) {
    const err = await booked.text();
    fail(`booking ${booked.status} ${bookedLoc} ${err.slice(0, 400)}`);
  } else {
    const thanksBook = await (await fetch(base + bookedLoc)).text();
    if (!thanksBook.includes("Riley Booker") || !thanksBook.includes("Your time is saved.")) fail("booking confirmation missing");
    if (thanksBook.includes("fee_paid")) fail("booking confirmation fired fee_paid");
    if (!thanksBook.includes("You did not check the box")) fail("booking confirmation should record that TCPA was not checked");
    if (!thanksBook.includes("You did not agree to a recording.")) fail("booking confirmation should record that recording consent was not checked");
    const adminForm = new FormData();
    adminForm.set("email", "admin@paycoreos.com");
    adminForm.set("password", process.env.ADMIN_PASSWORD || "");
    const adminLogin = await fetch(base + "/admin/login", { method: "POST", body: adminForm, redirect: "manual" });
    const adminCookie = (adminLogin.headers.getSetCookie?.() || []).find((c) => c.startsWith("paycore_session="));
    if (!adminCookie) fail("admin login for bookings failed");
    else {
      const adminBookings = await (await fetch(base + "/admin/bookings", { headers: { cookie: adminCookie.split(";")[0] } })).text();
      if (!adminBookings.includes("Riley Booker")) fail("admin bookings missing the appointment");
      if (!adminBookings.includes(">No<")) fail("admin bookings missing a consent column");
      if (/name="webhook_enabled"[^>]*checked/.test(adminBookings)) fail("webhook is on by default");
      if (!adminBookings.includes("booking.created")) fail("admin missing webhook documentation");
      const dash = await (await fetch(base + "/admin", { headers: { cookie: adminCookie.split(";")[0] } })).text();
      if (!dash.includes("Riley Booker")) fail("admin dashboard missing the upcoming appointment");
    }
  }
}
const merged = new FormData();
merged.set("name", "Morgan Message");
merged.set("email", "morgan@example.com");
merged.set("phone", "407-555-0188");
merged.set("topic", "question");
merged.set("message", "Where do I send a statement?");
const mergedSent = await fetch(base + "/contact", { method: "POST", body: merged, redirect: "manual" });
const mergedLoc = mergedSent.headers.get("location") || "";
if (!mergedLoc.includes("/thank-you?for=message")) fail(`merged contact redirect ${mergedSent.status} ${mergedLoc}`);
else {
  const mergedThanks = await (await fetch(base + mergedLoc)).text();
  if (!mergedThanks.includes("We saved your message")) fail("merged contact confirmation missing");
}

if (failures.length) {
  console.error(`\n${failures.length} failures`);
  process.exit(1);
}
console.log("\nAll checks passed");
