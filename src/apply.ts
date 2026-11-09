import type { Context } from "hono";
import { hiddenAttr, parseAttr } from "./attr";
import { createSession, hashPassword, sessionCookie, verifyPassword } from "./auth";
import { ALLOWED_FILE, answerString, defaultAnswers, fieldVisible, MAX_FILE_BYTES, rowToField, SECTION_LABELS, type Answers, type FieldDef } from "./fields";
import { layout } from "./layout";
import { merchantEmailBody, queueEmail } from "./mail";
import { pageSeo } from "./seo";
import type { Env, SessionUser } from "./types";
import { buyerLabel, categoryLabel, CATEGORIES, cleanText, esc, feeBox, FEE_CENTS, isCategory, newId, nowIso, publicRef, safeFilename } from "./util";

type AppContext = Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>;

const PREFILL_KEYS = ["legal_business_name", "dba", "contact_name", "phone", "business_address", "city", "state", "zip", "ein", "website_url", "website_url_store"];

export async function renderApply(c: AppContext): Promise<Response> {
  const url = new URL(c.req.url);
  const categoryRaw = url.searchParams.get("category") || url.searchParams.get("vertical") || "";
  const category = isCategory(categoryRaw) ? categoryRaw : "";
  const buyerRaw = url.searchParams.get("buyer") || "";
  const buyer = buyerRaw === "existing" || buyerRaw === "first" ? buyerRaw : "";
  const declined = url.searchParams.get("declined") === "1";
  const user = c.get("user");
  const upsell = url.searchParams.get("upsell") === "1" && user?.role === "merchant";
  const fields = await loadFields(c.env.DB);
  let prefill: Answers = category ? defaultAnswers(category) : {};
  if (declined) prefill.declined_by_bank = "yes";
  let parentId = "";
  if (upsell && user) {
    const parent = await findDefenseParent(c.env.DB, user.id, url.searchParams.get("parent"));
    if (parent) {
      parentId = parent.id;
      const stored = parseAnswers(parent.answers_json);
      for (const key of PREFILL_KEYS) {
        if (stored[key]) prefill[key] = stored[key];
      }
      if (!prefill.contact_name && parent.contact_name) prefill.contact_name = parent.contact_name;
      if (!prefill.legal_business_name && parent.legal_business_name) prefill.legal_business_name = parent.legal_business_name;
    }
  }
  const { attr } = parseAttr(url, c.req.header("cookie"));
  const html = layout({
    hostname: url.hostname,
    seo: applySeo(category),
    current: "/apply",
    main: applyMain({
      category,
      buyer,
      fields,
      answers: prefill,
      errors: [],
      user,
      upsell,
      parentId,
      attrHtml: hiddenAttr(attr),
      email: user?.role === "merchant" ? user.email : "",
      declined,
    }),
  });
  return c.html(html);
}

export async function submitApply(c: AppContext): Promise<Response> {
  const url = new URL(c.req.url);
  const form = await c.req.formData();
  const user = c.get("user");
  const categoryRaw = String(form.get("category") || "");
  const buyerRaw = String(form.get("buyer") || "");
  const category = isCategory(categoryRaw) ? categoryRaw : "";
  const buyer = buyerRaw === "existing" || buyerRaw === "first" ? buyerRaw : "";
  const fields = await loadFields(c.env.DB);
  const answers = readAnswers(form, fields);
  const errors: string[] = [];
  if (!category) errors.push("Choose a category.");
  if (category && category !== "dispute-defense" && !buyer) errors.push("Choose whether you already accept cards or this is your first merchant account.");
  const effectiveBuyer = category === "dispute-defense" ? null : buyer || null;
  if (category === "dispute-defense" && answerString(answers.accepts_cards) === "no") {
    errors.push("Dispute defense is for a business that already accepts cards. Apply under call centers, eCommerce, retail, or restaurants if this is a first account.");
  }
  if (category) {
    for (const field of fields) {
      if (!fieldVisible(field, category, effectiveBuyer, answers)) continue;
      if (!field.required) continue;
      if (field.field_type === "file") {
        const files = filesFor(form, field.key);
        if (files.length === 0) errors.push(`${field.label} is required.`);
        for (const file of files) validateFile(file, field.label, errors);
      } else if (field.field_type === "checkbox") {
        if (answerString(answers[field.key]) !== "yes") errors.push(`${field.label} is required.`);
      } else if (!answerString(answers[field.key])) {
        errors.push(`${field.label} is required.`);
      } else if (field.options && field.field_type !== "multiselect") {
        if (!field.options.some((opt) => opt.value === answerString(answers[field.key]))) errors.push(`${field.label} is not a valid choice.`);
      } else if (field.field_type === "multiselect" && field.options) {
        const picked = Array.isArray(answers[field.key]) ? (answers[field.key] as string[]) : [];
        if (picked.some((value) => !field.options!.some((opt) => opt.value === value))) errors.push(`${field.label} has a choice that is not on the list.`);
      }
    }
  }
  const email = (user?.role === "merchant" ? user.email : cleanText(String(form.get("email") || ""), 200)).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email for the portal.");
  const password = String(form.get("password") || "");
  const confirm = String(form.get("password_confirm") || "");
  if (user?.role !== "merchant") {
    if (password.length < 10) errors.push("Use a portal password of at least 10 characters.");
    if (password !== confirm) errors.push("The passwords do not match.");
  }
  if (form.get("agree") !== "yes") errors.push("Agree to the terms and the privacy policy to submit.");
  let parentId: string | null = null;
  const requestedParent = String(form.get("parent_application_id") || "");
  if (requestedParent) {
    if (user?.role !== "merchant") errors.push("Sign in before adding a processing application to dispute defense.");
    else {
      const parent = await c.env.DB.prepare(
        "SELECT id, category FROM applications WHERE id = ? AND merchant_user_id = ?",
      )
        .bind(requestedParent, user.id)
        .first<{ id: string; category: string }>();
      if (!parent || parent.category !== "dispute-defense") errors.push("That dispute-defense application is not on your portal.");
      else if (category === "dispute-defense") errors.push("The optional processing application uses call centers, eCommerce, retail, or restaurants.");
      else parentId = parent.id;
    }
  }
  const arrivedDeclined = String(form.get("declined") || "") === "1" || answerString(answers.declined_by_bank) === "yes";
  const { attr } = parseAttr(url, c.req.header("cookie"));
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid", "li_fat_id"] as const) {
    const posted = cleanText(String(form.get(key) || ""), 300);
    if (posted) attr[key] = posted;
  }
  if (errors.length || !category) {
    return c.html(applyErrorPage(url, category, buyer, fields, answers, errors, user, Boolean(parentId) || form.get("upsell") === "1", requestedParent, hiddenAttr(attr), email, arrivedDeclined), 400);
  }
  const existing = await c.env.DB.prepare("SELECT id, role, password_hash, name FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; role: string; password_hash: string; name: string }>();
  let userId = user?.role === "merchant" ? user.id : "";
  if (existing) {
    if (existing.role === "admin") {
      errors.push("Use a different email. That address is reserved.");
    } else if (user?.role === "merchant" && user.id !== existing.id) {
      errors.push("That email belongs to another portal login.");
    } else if (user?.role !== "merchant") {
      const ok = await verifyPassword(password, existing.password_hash);
      if (!ok) errors.push("An account with this email already exists. Sign in to the portal and start the application from there.");
      else userId = existing.id;
    }
  }
  if (errors.length) {
    return c.html(applyErrorPage(url, category, buyer, fields, answers, errors, user, Boolean(requestedParent), requestedParent, hiddenAttr(attr), email, arrivedDeclined), 400);
  }
  const visibleFiles: { field: FieldDef; file: File }[] = [];
  for (const field of fields) {
    if (field.field_type !== "file") continue;
    if (!fieldVisible(field, category, effectiveBuyer, answers)) continue;
    for (const file of filesFor(form, field.key)) {
      validateFile(file, field.label, errors);
      visibleFiles.push({ field, file });
    }
  }
  if (errors.length) {
    return c.html(applyErrorPage(url, category, buyer, fields, answers, errors, user, Boolean(requestedParent), requestedParent, hiddenAttr(attr), email, arrivedDeclined), 400);
  }
  const storedAnswers: Answers = {};
  for (const field of fields) {
    if (field.field_type === "file") continue;
    if (!fieldVisible(field, category, effectiveBuyer, answers)) continue;
    const value = answers[field.key];
    if (value === undefined) continue;
    if (Array.isArray(value)) storedAnswers[field.key] = value;
    else storedAnswers[field.key] = cleanText(value, field.field_type === "textarea" ? 4000 : 300);
  }
  const appId = newId("app");
  const ref = publicRef();
  const stamp = nowIso();
  const uploadRows: { id: string; key: string; filename: string; r2: string; type: string; size: number }[] = [];
  for (const item of visibleFiles) {
    const id = newId("upl");
    const filename = safeFilename(item.file.name);
    const r2 = `applications/${appId}/${id}-${filename}`;
    const type = safeType(item.file.type);
    await c.env.FILES.put(r2, await item.file.arrayBuffer(), { httpMetadata: { contentType: type } });
    uploadRows.push({ id, key: item.field.key, filename, r2, type, size: item.file.size });
  }
  if (!userId) {
    userId = newId("usr");
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, 'merchant', ?, ?)")
      .bind(userId, email, await hashPassword(password), cleanText(answerString(storedAnswers.contact_name), 200), stamp)
      .run();
  }
  const status = await c.env.DB.prepare("SELECT id, label FROM statuses WHERE key = 'received'").first<{ id: string; label: string }>();
  await c.env.DB.prepare(
    `INSERT INTO applications (
      id, public_ref, category, buyer_type, status_id, email, contact_name, legal_business_name, answers_json, parent_application_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, gbraid, wbraid, fbclid, li_fat_id,
      landing_path, first_vertical, first_buyer_type, declined_by_bank, declined_bank, callback_requested, fee_status, fee_amount_cents, merchant_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'not_collected', ?, ?, ?, ?)`,
  )
    .bind(
      appId,
      ref,
      category,
      effectiveBuyer,
      status?.id ?? null,
      email,
      cleanText(answerString(storedAnswers.contact_name), 200),
      cleanText(answerString(storedAnswers.legal_business_name), 200),
      JSON.stringify(storedAnswers),
      parentId,
      attr.utm_source ?? null,
      attr.utm_medium ?? null,
      attr.utm_campaign ?? null,
      attr.utm_content ?? null,
      attr.utm_term ?? null,
      attr.gclid ?? null,
      attr.gbraid ?? null,
      attr.wbraid ?? null,
      attr.fbclid ?? null,
      attr.li_fat_id ?? null,
      attr.first_landing_path ?? null,
      attr.first_vertical ?? category,
      attr.first_buyer_type ?? effectiveBuyer,
      answerString(storedAnswers.declined_by_bank) === "yes" ? 1 : 0,
      answerString(storedAnswers.declined_by_bank) === "yes" ? cleanText(answerString(storedAnswers.declined_bank), 200) : "",
      FEE_CENTS,
      userId,
      stamp,
      stamp,
    )
    .run();
  for (const row of uploadRows) {
    await c.env.DB.prepare(
      "INSERT INTO uploads (id, application_id, field_key, filename, r2_key, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(row.id, appId, row.key, row.filename, row.r2, row.type, row.size, stamp)
      .run();
  }
  const body = `Application received. PaycoreOS will call to go over the file. The $39 fee is not collected until the fee account is ready. Submitting the form does not pay the fee.`;
  await c.env.DB.prepare(
    "INSERT INTO timeline_events (id, application_id, status_id, body, merchant_visible, email_queued, created_by, created_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)",
  )
    .bind(newId("evt"), appId, status?.id ?? null, body, userId, stamp)
    .run();
  await queueEmail(c.env.DB, {
    to: email,
    subject: `PaycoreOS application ${ref}`,
    body: merchantEmailBody(ref, body),
    applicationId: appId,
  });
  const token = await createSession(c.env.DB, userId);
  const headers = new Headers({ Location: `/apply/fee?ref=${encodeURIComponent(ref)}` });
  headers.append("Set-Cookie", sessionCookie(token, url.protocol === "https:"));
  return new Response(null, { status: 303, headers });
}

export async function renderFee(c: AppContext): Promise<Response> {
  const url = new URL(c.req.url);
  const user = c.get("user");
  const ref = url.searchParams.get("ref") || "";
  if (!user || user.role !== "merchant") {
    return c.redirect(`/portal/login?next=${encodeURIComponent(`/apply/fee?ref=${ref}`)}`);
  }
  const app = await c.env.DB.prepare(
    `SELECT a.public_ref, a.category, a.buyer_type, a.fee_status, s.label AS status_label
     FROM applications a LEFT JOIN statuses s ON s.id = a.status_id
     WHERE a.public_ref = ? AND a.merchant_user_id = ?`,
  )
    .bind(ref, user.id)
    .first<{ public_ref: string; category: string; buyer_type: string | null; fee_status: string; status_label: string }>();
  if (!app) return c.redirect("/portal");
  const seo = {
    path: "/apply/fee",
    title: `Application ${app.public_ref} | PaycoreOS`,
    description: "The application is saved. The $39 fee is not collected until the fee account is ready.",
    h1: "Application saved",
  };
  const main = `<article class="wrap prose">
    <h1>Application saved</h1>
    <p>We have the ${esc(categoryLabel(app.category).toLowerCase())} application <strong>${esc(app.public_ref)}</strong>. ${app.buyer_type ? esc(buyerLabel(app.buyer_type)) + "." : ""} Status: ${esc(app.status_label || "Application received")}.</p>
    <p>PaycoreOS will call to go over the file. <a href="/book">Pick a time for that call</a>.</p>
    ${feeBox()}
    <p><button type="button" class="btn-p" disabled aria-disabled="true">Pay $39</button></p>
    <p>The pay button stays off until the fee account is ready. The fee is not collected until then. We do not take a card number on this page. There is no charge.</p>
    <p><a class="btn-s" href="/portal">Open your portal</a></p>
  </article>`;
  return c.html(
    layout({
      hostname: url.hostname,
      seo,
      current: "/apply",
      alsoEvent: "application_submitted",
      robots: "noindex, nofollow",
      main,
    }),
  );
}

function applySeo(category: string) {
  const seo = pageSeo("/apply")!;
  return category ? { ...seo, vertical: category } : seo;
}

function applyErrorPage(
  url: URL,
  category: string,
  buyer: string,
  fields: FieldDef[],
  answers: Answers,
  errors: string[],
  user: SessionUser | null,
  upsell: boolean,
  parentId: string,
  attrHtml: string,
  email: string,
  declined: boolean,
): string {
  return layout({
    hostname: url.hostname,
    seo: applySeo(category),
    current: "/apply",
    main: applyMain({ category, buyer, fields, answers, errors, user, upsell, parentId, attrHtml, email, declined }),
  });
}

function applyMain(input: {
  category: string;
  buyer: string;
  fields: FieldDef[];
  answers: Answers;
  errors: string[];
  user: SessionUser | null;
  upsell: boolean;
  parentId: string;
  attrHtml: string;
  email: string;
  declined: boolean;
}): string {
  const categories = input.upsell ? CATEGORIES.filter((item) => item.value !== "dispute-defense") : CATEGORIES;
  const options = categories
    .map((item) => `<option value="${item.value}"${item.value === input.category ? " selected" : ""}>${item.label}</option>`)
    .join("");
  const buyerField =
    input.category === "dispute-defense"
      ? `<p class="note">Dispute defense is only for a business that already accepts cards. It does not open a processing account.</p>`
      : `<label>Already accepting cards, or a first merchant account?
          <select name="buyer">
            <option value="">Choose</option>
            <option value="existing"${input.buyer === "existing" ? " selected" : ""}>I already accept cards</option>
            <option value="first"${input.buyer === "first" ? " selected" : ""}>This is my first merchant account</option>
          </select>
        </label>`;
  const chooser = `<form class="chooser" method="get" action="/apply">
    ${input.attrHtml}
    ${input.upsell ? '<input type="hidden" name="upsell" value="1">' : ""}
    ${input.declined ? '<input type="hidden" name="declined" value="1">' : ""}
    <label>Category
      <select name="category">${`<option value="">Choose a category</option>`}${options}</select>
    </label>
    ${buyerField}
    <button class="btn-s" type="submit">Load this form</button>
  </form>`;
  const errors = input.errors.length ? `<div class="errors" role="alert"><p>Fix the form before it can be saved.</p><ul>${input.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
  let form = "";
  if (input.category) {
    const buyer = input.category === "dispute-defense" ? null : input.buyer || null;
    const visible = input.fields.filter((field) => field.categories.includes(input.category) && field.active);
    form = `<form id="application-form" class="stack-form" method="post" action="/apply" enctype="multipart/form-data">
      ${input.attrHtml}
      <input type="hidden" name="category" value="${esc(input.category)}">
      ${buyer ? `<input type="hidden" name="buyer" value="${esc(buyer)}">` : ""}
      ${input.parentId ? `<input type="hidden" name="parent_application_id" value="${esc(input.parentId)}">` : ""}
      ${input.declined ? '<input type="hidden" name="declined" value="1">' : ""}
      <p class="form-promise">${promise(input.category, buyer)}</p>
      ${errors}
      ${renderFieldGroups(visible, input.category, buyer, input.answers)}
      <h2>Portal login</h2>
      ${
        input.user?.role === "merchant"
          ? `<p>This application is saved to the portal for ${esc(input.user.email)}.</p><input type="hidden" name="email" value="${esc(input.user.email)}">`
          : `<label>Email<input type="email" name="email" required autocomplete="email" value="${esc(input.email)}"></label>
             <label>Password<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
             <label>Confirm password<input type="password" name="password_confirm" required minlength="10" autocomplete="new-password"></label>
             <p class="help">At least 10 characters. You will use this email and password to open the portal.</p>`
      }
      ${feeBox()}
      <p>Submitting saves the application. It does not pay the $39 fee. The fee is not collected until the fee account is ready.</p>
      <label class="check"><input type="checkbox" name="agree" value="yes" required> I agree to the <a href="/terms">terms</a> and the <a href="/privacy">privacy policy</a>.</label>
      <button class="btn-p" type="submit">Submit application</button>
    </form>
    <script src="/apply.js" defer></script>`;
  }
  return `<article class="wrap">
    <header class="page-head">
      <h1>Apply to PaycoreOS</h1>
      <p class="lede">Choose a category. The form on this page is the one for that category. Dispute defense is its own form.</p>
      <p>Not ready to apply? <a href="/book">Book a time</a> or <a href="/contact">send a message</a>.</p>
    </header>
    ${input.category ? "" : errors}
    ${chooser}
    ${form}
  </article>`;
}

function promise(category: string, buyer: string | null): string {
  const who = buyer === "existing" ? " You already accept cards." : buyer === "first" ? " This is your first merchant account." : "";
  const lines: Record<string, string> = {
    "call-centers": `Card-not-present processing for call centers.${who} Agreements, scripts, and articles are required.`,
    ecommerce: `Gateway, checkout, and chargeback defense for online stores.${who}`,
    retail: `In-person processing and POS for retail.${who}`,
    restaurants: `Restaurant processing and handheld checkout.${who}`,
    "dispute-defense": "Dispute defense for businesses that already accept cards. This form does not open a processing account. MID and CAID are required.",
  };
  return esc(lines[category] || "");
}

function renderFieldGroups(fields: FieldDef[], category: string, buyer: string | null, answers: Answers): string {
  const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
  let html = "";
  let section = "";
  for (const field of ordered) {
    const shown = fieldVisible(field, category, buyer, answers) || Boolean(field.condition);
    if (!field.categories.includes(category) || !field.active) continue;
    if (field.buyer_types && buyer && !field.buyer_types.includes(buyer) && !field.condition) continue;
    if (field.buyer_types && !buyer) continue;
    if (!shown && !field.condition) continue;
    if (field.section !== section) {
      section = field.section;
      html += `<h2>${esc(SECTION_LABELS[section] || section)}</h2>`;
    }
    html += renderField(field, answers);
  }
  return html;
}

function renderField(field: FieldDef, answers: Answers): string {
  const value = answers[field.key];
  const required = field.required && !field.condition ? " required" : "";
  const condition = field.condition ? ` data-condition="${esc(JSON.stringify(field.condition))}"` : "";
  const help = field.help_text ? `<span class="help">${esc(field.help_text)}</span>` : "";
  const mark = field.required ? " <span class=\"req\">Required</span>" : "";
  const screening = field.screening ? `<span class="help">For PaycoreOS, not sent as a processor field.</span>` : "";
  let control = "";
  if (field.field_type === "textarea") {
    control = `<textarea name="f_${esc(field.key)}"${required}>${esc(answerString(value))}</textarea>`;
  } else if (field.field_type === "select") {
    const opts = (field.options || [])
      .map((opt) => `<option value="${esc(opt.value)}"${answerString(value) === opt.value ? " selected" : ""}>${esc(opt.label)}</option>`)
      .join("");
    control = `<select name="f_${esc(field.key)}"${required}><option value="">Choose</option>${opts}</select>`;
  } else if (field.field_type === "radio") {
    control = (field.options || [])
      .map(
        (opt) =>
          `<label class="check"><input type="radio" name="f_${esc(field.key)}" value="${esc(opt.value)}"${answerString(value) === opt.value ? " checked" : ""}${required}> ${esc(opt.label)}</label>`,
      )
      .join("");
  } else if (field.field_type === "multiselect") {
    const picked = new Set(Array.isArray(value) ? value : answerString(value) ? answerString(value).split(",") : []);
    control = `<div class="checks">${(field.options || [])
      .map(
        (opt) =>
          `<label class="check"><input type="checkbox" name="f_${esc(field.key)}" value="${esc(opt.value)}"${picked.has(opt.value) ? " checked" : ""}> ${esc(opt.label)}</label>`,
      )
      .join("")}</div>`;
  } else if (field.field_type === "checkbox") {
    control = `<label class="check"><input type="checkbox" name="f_${esc(field.key)}" value="yes"${answerString(value) === "yes" ? " checked" : ""}> ${esc(field.label)}</label>`;
  } else if (field.field_type === "file") {
    control = `<input type="file" name="file_${esc(field.key)}"${field.multiple ? " multiple" : ""}${required} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv">`;
  } else {
    const type = field.field_type === "email" || field.field_type === "tel" ? field.field_type : "text";
    const auto = field.key === "website_password" ? ` autocomplete="off"` : "";
    control = `<input type="${type}" name="f_${esc(field.key)}" value="${esc(answerString(value))}"${required}${auto}>`;
  }
  const label = field.field_type === "checkbox" ? "" : `<span>${esc(field.label)}${mark}</span>`;
  return `<div class="field"${condition}>${label ? `<label>${label}${control}</label>` : control}${help}${screening}</div>`;
}

function readAnswers(form: FormData, fields: FieldDef[]): Answers {
  const answers: Answers = {};
  for (const field of fields) {
    if (field.field_type === "file") continue;
    if (field.field_type === "multiselect") {
      answers[field.key] = form.getAll(`f_${field.key}`).map((item) => cleanText(String(item), 80)).filter(Boolean);
    } else if (field.field_type === "checkbox") {
      answers[field.key] = form.get(`f_${field.key}`) ? "yes" : "no";
    } else {
      const raw = form.get(`f_${field.key}`);
      answers[field.key] = typeof raw === "string" ? cleanText(raw, field.field_type === "textarea" ? 4000 : 300) : "";
    }
  }
  return answers;
}

function filesFor(form: FormData, key: string): File[] {
  return form.getAll(`file_${key}`).filter((item): item is File => item instanceof File && item.size > 0);
}

function validateFile(file: File, label: string, errors: string[]): void {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_FILE.has(ext)) errors.push(`${label} must be a PDF, image, Word, text, or CSV file.`);
  if (file.size > MAX_FILE_BYTES) errors.push(`${label} must be 10 MB or smaller.`);
}

function safeType(type: string): string {
  if (!type || /html|svg|xml|javascript/i.test(type)) return "application/octet-stream";
  return type;
}

async function loadFields(db: D1Database): Promise<FieldDef[]> {
  const rows = await db.prepare("SELECT * FROM field_definitions ORDER BY sort_order, key").all<Record<string, unknown>>();
  return (rows.results || []).map((row) => rowToField(row));
}

function parseAnswers(json: string): Answers {
  try {
    const value = JSON.parse(json) as Answers;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function findDefenseParent(db: D1Database, userId: string, ref: string | null): Promise<{ id: string; answers_json: string; contact_name: string; legal_business_name: string } | null> {
  if (ref) {
    const row = await db
      .prepare("SELECT id, answers_json, contact_name, legal_business_name FROM applications WHERE public_ref = ? AND merchant_user_id = ? AND category = 'dispute-defense'")
      .bind(ref, userId)
      .first<{ id: string; answers_json: string; contact_name: string; legal_business_name: string }>();
    if (row) return row;
  }
  return db
    .prepare("SELECT id, answers_json, contact_name, legal_business_name FROM applications WHERE merchant_user_id = ? AND category = 'dispute-defense' ORDER BY created_at DESC LIMIT 1")
    .bind(userId)
    .first<{ id: string; answers_json: string; contact_name: string; legal_business_name: string }>();
}

export { loadFields, parseAnswers };
