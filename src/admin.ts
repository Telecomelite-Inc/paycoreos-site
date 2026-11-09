import type { Context } from "hono";
import { hashPassword, createSession, sessionCookie, verifyPassword } from "./auth";
import { mentionsSupplier, SUPPLIER_ERROR } from "./banned";
import { rowToField, type FieldDef, type FieldType } from "./fields";
import { appShell } from "./layout";
import { merchantEmailBody, queueEmail } from "./mail";
import type { Env, SessionUser } from "./types";
import { upcomingBookingsHtml } from "./booking";
import { categoryLabel, esc, formatWhen, newId, nowIso } from "./util";

type Ctx = Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>;

const FIELD_TYPES: FieldType[] = ["text", "email", "tel", "textarea", "select", "multiselect", "checkbox", "file", "radio"];

export function loginPage(c: Ctx, error = ""): Response {
  const body = `<article class="narrow"><h1>Admin sign in</h1>
    ${error ? `<p class="errors" role="alert">${esc(error)}</p>` : ""}
    <form class="stack-form" method="post" action="/admin/login">
      <label>Email<input type="email" name="email" required autocomplete="username"></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn-p" type="submit">Sign in</button>
    </form>
    <p class="help">The admin user is created from the ADMIN_EMAIL and ADMIN_PASSWORD secrets. No password is stored in the repo.</p>
  </article>`;
  return c.html(shell(c, "Admin sign in", "/admin/login", body), error ? 401 : 200);
}

export async function login(c: Ctx): Promise<Response> {
  const form = await c.req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const user = await c.env.DB.prepare("SELECT id, password_hash, role FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string; role: string }>();
  if (!user || user.role !== "admin" || !(await verifyPassword(password, user.password_hash))) {
    return loginPage(c, "That email and password did not match an admin.");
  }
  const token = await createSession(c.env.DB, user.id);
  const headers = new Headers({ Location: "/admin" });
  headers.append("Set-Cookie", sessionCookie(token, new URL(c.req.url).protocol === "https:"));
  return new Response(null, { status: 303, headers });
}

export async function applications(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT a.public_ref, a.category, a.legal_business_name, a.email, a.created_at, a.fee_status, a.declined_by_bank, a.callback_requested, s.label AS status_label, p.name AS processor_name
     FROM applications a
     LEFT JOIN statuses s ON s.id = a.status_id
     LEFT JOIN processors p ON p.id = a.processor_id
     ORDER BY a.created_at DESC LIMIT 200`,
  ).all<Record<string, string>>();
  const list = (rows.results || [])
    .map(
      (row) => `<tr>
        <td><a href="/admin/applications/${esc(row.public_ref)}">${esc(row.public_ref)}</a></td>
        <td>${esc(row.legal_business_name)}</td>
        <td>${esc(categoryLabel(row.category))}</td>
        <td>${esc(row.status_label || "")}</td>
        <td>${esc(row.processor_name || "Unassigned")}</td>
        <td>${Number(row.declined_by_bank) === 1 ? "Yes" : "No"}</td>
        <td>${Number(row.callback_requested) === 1 ? "Yes" : "No"}</td>
        <td>${esc(row.fee_status)}</td>
        <td>${esc(formatWhen(row.created_at))}</td>
      </tr>`,
    )
    .join("");
  const upcoming = await upcomingBookingsHtml(c.env.DB);
  const body = `<h1>Applications</h1>
    <table><thead><tr><th>Ref</th><th>Business</th><th>Category</th><th>Status</th><th>Processor</th><th>Bank decline</th><th>Callback</th><th>Fee</th><th>Created</th></tr></thead><tbody>${list || `<tr><td colspan="9">No applications yet.</td></tr>`}</tbody></table>
    ${upcoming}`;
  return c.html(shell(c, "Applications", "/admin", body));
}

export async function applicationDetail(c: Ctx, ref: string, notice = ""): Promise<Response> {
  const app = await c.env.DB.prepare(
    `SELECT a.*, s.label AS status_label, p.name AS processor_name
     FROM applications a
     LEFT JOIN statuses s ON s.id = a.status_id
     LEFT JOIN processors p ON p.id = a.processor_id
     WHERE a.public_ref = ?`,
  )
    .bind(ref)
    .first<Record<string, string | null>>();
  if (!app) return c.html(shell(c, "Not found", "/admin", "<h1>Application not found</h1>"), 404);
  const processors = await c.env.DB.prepare("SELECT id, name, active FROM processors ORDER BY name").all<{ id: string; name: string; active: number }>();
  const statuses = await c.env.DB.prepare("SELECT id, label FROM statuses WHERE active = 1 ORDER BY sort_order").all<{ id: string; label: string }>();
  const notes = await c.env.DB.prepare("SELECT body, created_at FROM internal_notes WHERE application_id = ? ORDER BY created_at DESC")
    .bind(app.id)
    .all<{ body: string; created_at: string }>();
  const events = await c.env.DB.prepare("SELECT body, merchant_visible, email_queued, created_at FROM timeline_events WHERE application_id = ? ORDER BY created_at")
    .bind(app.id)
    .all<{ body: string; merchant_visible: number; email_queued: number; created_at: string }>();
  const uploads = await c.env.DB.prepare("SELECT id, filename, field_key FROM uploads WHERE application_id = ?").bind(app.id).all<{ id: string; filename: string; field_key: string }>();
  const tickets = await c.env.DB.prepare("SELECT id, subject, status FROM tickets WHERE application_id = ?").bind(app.id).all<{ id: string; subject: string; status: string }>();
  const procOptions = (processors.results || [])
    .map((p) => `<option value="${esc(p.id)}"${p.id === app.processor_id ? " selected" : ""}>${esc(p.name)}${p.active ? "" : " (inactive)"}</option>`)
    .join("");
  const statusOptions = (statuses.results || [])
    .map((s) => `<option value="${esc(s.id)}"${s.id === app.status_id ? " selected" : ""}>${esc(s.label)}</option>`)
    .join("");
  const body = `<p class="k">${esc(app.public_ref || "")}</p><h1>${esc(app.legal_business_name || ref)}</h1>
    ${notice ? `<p class="ok" role="status">${esc(notice)}</p>` : ""}
    <p>${esc(app.email || "")} · ${esc(categoryLabel(String(app.category)))} · ${esc(app.buyer_type || "dispute defense")} · Fee ${esc(app.fee_status || "")}</p>
    <p>Processor on this file: <strong>${esc(app.processor_name || "Unassigned")}</strong>. Merchants do not see this.</p>
    <p>Declined by a bank: <strong>${Number(app.declined_by_bank) === 1 ? "Yes" : "No"}</strong>${app.declined_bank ? ` · ${esc(app.declined_bank)}` : ""}. The merchant is not shown a processor for that answer.</p>
    <p>Callback: <strong>${Number(app.callback_requested) === 1 ? "Yes" : "No"}</strong>. PaycoreOS will call to go over the file.</p>
    <h2>Record a push</h2>
    <p class="help">This stores the processor and the push target. It does not call a processor API.</p>
    <form class="stack-form" method="post" action="/admin/applications/${esc(ref)}/push">
      <label>Processor<select name="processor_id"><option value="">Choose</option>${procOptions}</select></label>
      <label>Push target<input name="push_target" value="${esc(app.push_target || "")}" required placeholder="Manual, sandbox id, or portal reference"></label>
      <label class="check"><input type="checkbox" name="mark_submitted" value="yes"> Set the merchant status to Submitted and queue the email</label>
      <button class="btn-p" type="submit">Record push</button>
    </form>
    <h2>Status</h2>
    <form class="stack-form" method="post" action="/admin/applications/${esc(ref)}/status">
      <label>Status<select name="status_id">${statusOptions}</select></label>
      <label>Merchant-visible line<textarea name="body" placeholder="Leave blank to use the status label"></textarea></label>
      <button class="btn-s" type="submit">Update status and queue email</button>
    </form>
    <h2>Merchant-visible update</h2>
    <form class="stack-form" method="post" action="/admin/applications/${esc(ref)}/update">
      <label>Update<textarea name="body" required></textarea></label>
      <button class="btn-s" type="submit">Post to timeline and queue email</button>
    </form>
    <h2>Internal note</h2>
    <p class="help">Internal notes stay off the merchant timeline and are not emailed. Processor names belong here.</p>
    <form class="stack-form" method="post" action="/admin/applications/${esc(ref)}/note">
      <label>Note<textarea name="body" required></textarea></label>
      <button class="btn-s" type="submit">Save internal note</button>
    </form>
    <ul class="plain-list">${(notes.results || []).map((n) => `<li>${esc(formatWhen(n.created_at))}: ${esc(n.body)}</li>`).join("") || "<li>No internal notes.</li>"}</ul>
    <h2>Timeline</h2>
    <ul class="plain-list">${(events.results || []).map((e) => `<li>${esc(formatWhen(e.created_at))} · ${e.merchant_visible ? "merchant" : "hidden"} · ${e.email_queued ? "email queued" : "no email"} · ${esc(e.body)}</li>`).join("")}</ul>
    <h2>Files</h2>
    <ul class="plain-list">${(uploads.results || []).map((f) => `<li><a href="/admin/files/${esc(f.id)}">${esc(f.field_key)}: ${esc(f.filename)}</a></li>`).join("") || "<li>No files.</li>"}</ul>
    <h2>Answers</h2>
    <pre class="json">${esc(pretty(app.answers_json))}</pre>
    <h2>Attribution</h2>
    <ul class="plain-list">
      ${["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid", "li_fat_id", "landing_path", "first_vertical", "first_buyer_type"]
        .map((key) => `<li>${esc(key)}: ${esc(app[key] || "")}</li>`)
        .join("")}
    </ul>
    <h2>Tickets</h2>
    ${(await ticketBlocks(c, tickets.results || [])).join("") || "<p>No tickets.</p>"}
    <h2>Portal password</h2>
    <form class="stack-form" method="post" action="/admin/applications/${esc(ref)}/password">
      <label>New merchant password<input type="text" name="password" minlength="10" required></label>
      <button class="btn-s" type="submit">Set password</button>
    </form>`;
  return c.html(shell(c, ref, "/admin", body));
}

async function ticketBlocks(c: Ctx, tickets: { id: string; subject: string; status: string }[]): Promise<string[]> {
  const blocks: string[] = [];
  for (const ticket of tickets) {
    const msgs = await c.env.DB.prepare("SELECT author_role, body, created_at, merchant_visible FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at")
      .bind(ticket.id)
      .all<{ author_role: string; body: string; created_at: string; merchant_visible: number }>();
    blocks.push(`<article class="ticket"><h3>${esc(ticket.subject)}</h3><p>${esc(ticket.status)}</p>
      ${(msgs.results || []).map((m) => `<p><strong>${esc(m.author_role)}</strong> · ${esc(formatWhen(m.created_at))}<br>${esc(m.body)}</p>`).join("")}
      <form class="stack-form" method="post" action="/admin/tickets/${esc(ticket.id)}/reply">
        <label>Reply to the merchant<textarea name="body" required></textarea></label>
        <button class="btn-s" type="submit">Send reply and queue email</button>
      </form></article>`);
  }
  return blocks;
}

export async function recordPush(c: Ctx, ref: string): Promise<Response> {
  const form = await c.req.formData();
  const processorId = String(form.get("processor_id") || "");
  const target = String(form.get("push_target") || "").trim().slice(0, 500);
  if (!processorId || !target) return applicationDetail(c, ref, "Choose a processor and enter a push target.");
  const processor = await c.env.DB.prepare("SELECT id FROM processors WHERE id = ?").bind(processorId).first();
  if (!processor) return applicationDetail(c, ref, "That processor does not exist.");
  const app = await appByRef(c, ref);
  if (!app) return c.redirect("/admin");
  const stamp = nowIso();
  await c.env.DB.prepare("UPDATE applications SET processor_id = ?, push_target = ?, pushed_at = ?, updated_at = ? WHERE id = ?")
    .bind(processorId, target, stamp, stamp, app.id)
    .run();
  if (form.get("mark_submitted") === "yes") {
    const status = await c.env.DB.prepare("SELECT id, label FROM statuses WHERE key = 'submitted'").first<{ id: string; label: string }>();
    if (status) await postMerchantUpdate(c, app, status.label, status.id);
  }
  return c.redirect(`/admin/applications/${ref}`);
}

export async function updateStatus(c: Ctx, ref: string): Promise<Response> {
  const app = await appByRef(c, ref);
  if (!app) return c.redirect("/admin");
  const form = await c.req.formData();
  const status = await c.env.DB.prepare("SELECT id, label FROM statuses WHERE id = ?").bind(String(form.get("status_id") || "")).first<{ id: string; label: string }>();
  if (!status) return applicationDetail(c, ref, "Choose a status.");
  if (mentionsSupplier(status.label)) return applicationDetail(c, ref, SUPPLIER_ERROR);
  const custom = String(form.get("body") || "").trim();
  const line = custom || status.label;
  if (mentionsSupplier(line)) return applicationDetail(c, ref, SUPPLIER_ERROR);
  await c.env.DB.prepare("UPDATE applications SET status_id = ?, updated_at = ? WHERE id = ?").bind(status.id, nowIso(), app.id).run();
  await postMerchantUpdate(c, app, line, status.id);
  return c.redirect(`/admin/applications/${ref}`);
}

export async function merchantUpdate(c: Ctx, ref: string): Promise<Response> {
  const app = await appByRef(c, ref);
  if (!app) return c.redirect("/admin");
  const body = String((await c.req.formData()).get("body") || "").trim().slice(0, 4000);
  if (!body) return applicationDetail(c, ref, "Write the update.");
  if (mentionsSupplier(body)) return applicationDetail(c, ref, SUPPLIER_ERROR);
  await postMerchantUpdate(c, app, body, null);
  return c.redirect(`/admin/applications/${ref}`);
}

export async function internalNote(c: Ctx, ref: string): Promise<Response> {
  const app = await appByRef(c, ref);
  if (!app) return c.redirect("/admin");
  const body = String((await c.req.formData()).get("body") || "").trim().slice(0, 4000);
  if (!body) return applicationDetail(c, ref, "Write the note.");
  await c.env.DB.prepare("INSERT INTO internal_notes (id, application_id, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId("note"), app.id, body, c.get("user")!.id, nowIso())
    .run();
  return c.redirect(`/admin/applications/${ref}`);
}

export async function replyTicket(c: Ctx, ticketId: string): Promise<Response> {
  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.subject, a.id AS application_id, a.public_ref, a.email FROM tickets t JOIN applications a ON a.id = t.application_id WHERE t.id = ?`,
  )
    .bind(ticketId)
    .first<{ id: string; subject: string; application_id: string; public_ref: string; email: string }>();
  if (!ticket) return c.redirect("/admin");
  const body = String((await c.req.formData()).get("body") || "").trim().slice(0, 4000);
  if (!body || mentionsSupplier(body)) return applicationDetail(c, ticket.public_ref, body ? SUPPLIER_ERROR : "Write a reply.");
  const stamp = nowIso();
  await c.env.DB.prepare(
    "INSERT INTO ticket_messages (id, ticket_id, body, author_role, merchant_visible, email_queued, created_by, created_at) VALUES (?, ?, ?, 'admin', 1, 1, ?, ?)",
  )
    .bind(newId("msg"), ticket.id, body, c.get("user")!.id, stamp)
    .run();
  await c.env.DB.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").bind(stamp, ticket.id).run();
  const line = `Reply on your ticket “${ticket.subject}”: ${body}`;
  await c.env.DB.prepare(
    "INSERT INTO timeline_events (id, application_id, body, merchant_visible, email_queued, created_by, created_at) VALUES (?, ?, ?, 1, 1, ?, ?)",
  )
    .bind(newId("evt"), ticket.application_id, line, c.get("user")!.id, stamp)
    .run();
  await queueEmail(c.env.DB, {
    to: ticket.email,
    subject: `PaycoreOS application ${ticket.public_ref}`,
    body: merchantEmailBody(ticket.public_ref, line),
    applicationId: ticket.application_id,
  });
  return c.redirect(`/admin/applications/${ticket.public_ref}`);
}

export async function setPassword(c: Ctx, ref: string): Promise<Response> {
  const app = await appByRef(c, ref);
  if (!app?.merchant_user_id) return c.redirect("/admin");
  const password = String((await c.req.formData()).get("password") || "");
  if (password.length < 10) return applicationDetail(c, ref, "Use at least 10 characters.");
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'merchant'")
    .bind(await hashPassword(password), app.merchant_user_id)
    .run();
  return applicationDetail(c, ref, "Portal password updated. It was not emailed.");
}

export async function processors(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare("SELECT id, name, slug, active, api_credentials, notes FROM processors ORDER BY name").all<Record<string, string | null>>();
  const body = `<h1>Processors</h1>
    <p class="help">These names stay in admin. They are not shown in the merchant portal, on the public site, or in merchant email. API credentials typed here are stored in the database, not in the git repo. This app does not call a processor API.</p>
    <table><thead><tr><th>Name</th><th>Slug</th><th>Active</th><th>Credentials</th><th></th></tr></thead><tbody>
      ${(rows.results || []).map((r) => `<tr><td><a href="/admin/processors/${esc(r.id)}">${esc(r.name)}</a></td><td>${esc(r.slug)}</td><td>${r.active ? "Yes" : "No"}</td><td>${r.api_credentials ? "Saved" : "Empty"}</td><td></td></tr>`).join("")}
    </tbody></table>
    <h2>Add a processor</h2>
    ${processorForm("/admin/processors", null)}`;
  return c.html(shell(c, "Processors", "/admin/processors", body));
}

export async function processorEdit(c: Ctx, id: string): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT * FROM processors WHERE id = ?").bind(id).first<Record<string, string | null>>();
  if (!row) return c.redirect("/admin/processors");
  const body = `<h1>${esc(row.name)}</h1>${processorForm(`/admin/processors/${id}`, row)}
    <form method="post" action="/admin/processors/${esc(id)}/delete"><button class="btn-danger" type="submit">Remove processor</button></form>`;
  return c.html(shell(c, "Processor", "/admin/processors", body));
}

export async function saveProcessor(c: Ctx, id: string | null): Promise<Response> {
  const form = await c.req.formData();
  const name = String(form.get("name") || "").trim().slice(0, 120);
  const slug = String(form.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80);
  const notes = String(form.get("notes") || "").trim().slice(0, 4000);
  const credentials = String(form.get("api_credentials") || "");
  const active = form.get("active") === "yes" ? 1 : 0;
  if (!name || !slug) return c.redirect("/admin/processors");
  const stamp = nowIso();
  if (id) {
    await c.env.DB.prepare("UPDATE processors SET name = ?, slug = ?, notes = ?, api_credentials = ?, active = ?, updated_at = ? WHERE id = ?")
      .bind(name, slug, notes, credentials || null, active, stamp, id)
      .run();
  } else {
    await c.env.DB.prepare("INSERT INTO processors (id, slug, name, notes, api_credentials, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("proc"), slug, name, notes, credentials || null, active, stamp, stamp)
      .run();
  }
  return c.redirect("/admin/processors");
}

export async function deleteProcessor(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM processors WHERE id = ?").bind(id).run();
  return c.redirect("/admin/processors");
}

function processorForm(action: string, row: Record<string, unknown> | null): string {
  return `<form class="stack-form" method="post" action="${action}">
    <label>Name<input name="name" required value="${esc(String(row?.name ?? ""))}"></label>
    <label>Slug<input name="slug" required value="${esc(String(row?.slug ?? ""))}"></label>
    <label>Notes<textarea name="notes">${esc(String(row?.notes ?? ""))}</textarea></label>
    <label>API credentials<textarea name="api_credentials" autocomplete="off">${esc(String(row?.api_credentials ?? ""))}</textarea></label>
    <label class="check"><input type="checkbox" name="active" value="yes"${row == null || row.active === 1 || row.active === "1" ? " checked" : ""}> Active</label>
    <button class="btn-p" type="submit">Save processor</button>
  </form>`;
}

export async function fields(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare("SELECT id, key, label, section, required, active, categories FROM field_definitions ORDER BY sort_order, key").all<Record<string, string | number>>();
  const body = `<h1>Application fields</h1>
    <p class="help">Add, edit, or remove a field here. The apply form and the merchant portal read this list. A new field shows up without a code change.</p>
    <p><a class="btn-s" href="/admin/fields/new">Add a field</a></p>
    <table><thead><tr><th>Label</th><th>Key</th><th>Section</th><th>Required</th><th>Active</th></tr></thead><tbody>
      ${(rows.results || []).map((r) => `<tr><td><a href="/admin/fields/${esc(r.id)}">${esc(r.label)}</a></td><td>${esc(r.key)}</td><td>${esc(r.section)}</td><td>${r.required ? "Yes" : "No"}</td><td>${r.active ? "Yes" : "No"}</td></tr>`).join("")}
    </tbody></table>`;
  return c.html(shell(c, "Fields", "/admin/fields", body));
}

export async function fieldFormPage(c: Ctx, id: string | null, error = ""): Promise<Response> {
  const row = id ? await c.env.DB.prepare("SELECT * FROM field_definitions WHERE id = ?").bind(id).first<Record<string, unknown>>() : null;
  const field = row ? rowToField(row) : null;
  const body = `<h1>${field ? esc(field.label) : "New field"}</h1>
    ${error ? `<p class="errors" role="alert">${esc(error)}</p>` : ""}
    ${fieldEditor(id ? `/admin/fields/${id}` : "/admin/fields", field)}
    ${id ? `<form method="post" action="/admin/fields/${esc(id)}/delete"><button class="btn-danger" type="submit">Remove field</button></form>` : ""}`;
  return c.html(shell(c, "Field", "/admin/fields", body));
}

export async function saveField(c: Ctx, id: string | null): Promise<Response> {
  const form = await c.req.formData();
  const key = String(form.get("key") || "").trim();
  const label = String(form.get("label") || "").trim().slice(0, 200);
  const help = String(form.get("help_text") || "").trim().slice(0, 1000);
  const fieldType = String(form.get("field_type") || "");
  const section = String(form.get("section") || "").trim().slice(0, 40);
  const categories = String(form.get("categories") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const buyerTypes = String(form.get("buyer_types") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const optionsRaw = String(form.get("options") || "").trim();
  const conditionRaw = String(form.get("condition_json") || "").trim();
  if (!/^[a-z][a-z0-9_]*$/.test(key) || !label || !FIELD_TYPES.includes(fieldType as FieldType) || categories.length === 0) {
    return fieldFormPage(c, id, "Key, label, type, and at least one category are required. Keys use lowercase letters, numbers, and underscores.");
  }
  const publicText = `${label}\n${help}\n${optionsRaw}`;
  if (mentionsSupplier(publicText)) return fieldFormPage(c, id, SUPPLIER_ERROR);
  let options: { value: string; label: string }[] | null = null;
  if (optionsRaw) {
    options = optionsRaw.split("\n").map((line) => {
      const [value, ...rest] = line.split("|");
      return { value: (value || "").trim(), label: rest.join("|").trim() || (value || "").trim() };
    }).filter((opt) => opt.value);
  }
  let condition: string | null = null;
  if (conditionRaw) {
    try {
      JSON.parse(conditionRaw);
      condition = conditionRaw;
    } catch {
      return fieldFormPage(c, id, "Condition JSON did not parse.");
    }
  }
  const stamp = nowIso();
  const binds = [
    label,
    help,
    fieldType,
    section || "identity",
    JSON.stringify(categories),
    buyerTypes.length ? JSON.stringify(buyerTypes) : null,
    form.get("required") === "yes" ? 1 : 0,
    form.get("multiple") === "yes" ? 1 : 0,
    options ? JSON.stringify(options) : null,
    condition,
    Number(form.get("sort_order") || 0),
    form.get("active") === "yes" ? 1 : 0,
    form.get("screening") === "yes" ? 1 : 0,
    stamp,
  ];
  if (id) {
    await c.env.DB.prepare(
      `UPDATE field_definitions SET label=?, help_text=?, field_type=?, section=?, categories=?, buyer_types=?, required=?, multiple=?, options_json=?, condition_json=?, sort_order=?, active=?, screening=?, updated_at=?, key=? WHERE id=?`,
    )
      .bind(...binds, key, id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO field_definitions (id, label, help_text, field_type, section, categories, buyer_types, required, multiple, options_json, condition_json, sort_order, active, screening, updated_at, key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId("fld"), ...binds, key, stamp)
      .run();
  }
  return c.redirect("/admin/fields");
}

export async function deleteField(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM field_definitions WHERE id = ?").bind(id).run();
  return c.redirect("/admin/fields");
}

function fieldEditor(action: string, field: FieldDef | null): string {
  const options = (field?.options || []).map((opt) => `${opt.value}|${opt.label}`).join("\n");
  return `<form class="stack-form" method="post" action="${action}">
    <label>Key<input name="key" required value="${esc(field?.key || "")}"></label>
    <label>Label<input name="label" required value="${esc(field?.label || "")}"></label>
    <label>Help<textarea name="help_text">${esc(field?.help_text || "")}</textarea></label>
    <label>Type<select name="field_type">${FIELD_TYPES.map((type) => `<option${field?.field_type === type ? " selected" : ""}>${type}</option>`).join("")}</select></label>
    <label>Section<input name="section" value="${esc(field?.section || "identity")}"></label>
    <label>Categories, comma separated<input name="categories" value="${esc((field?.categories || []).join(", "))}"></label>
    <label>Buyer types, comma separated<input name="buyer_types" value="${esc((field?.buyer_types || []).join(", "))}" placeholder="existing, first"></label>
    <label>Options, one per line as value|label<textarea name="options">${esc(options)}</textarea></label>
    <label>Condition JSON<textarea name="condition_json">${esc(field?.condition ? JSON.stringify(field.condition) : "")}</textarea></label>
    <label>Sort<input name="sort_order" type="number" value="${field?.sort_order ?? 100}"></label>
    <label class="check"><input type="checkbox" name="required" value="yes"${field?.required ? " checked" : ""}> Required when visible</label>
    <label class="check"><input type="checkbox" name="multiple" value="yes"${field?.multiple ? " checked" : ""}> Multiple files</label>
    <label class="check"><input type="checkbox" name="screening" value="yes"${field?.screening ? " checked" : ""}> For PaycoreOS, not sent as a processor field</label>
    <label class="check"><input type="checkbox" name="active" value="yes"${!field || field.active ? " checked" : ""}> Active</label>
    <button class="btn-p" type="submit">Save field</button>
  </form>`;
}

export async function statuses(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare("SELECT id, key, label, active, sort_order FROM statuses ORDER BY sort_order").all<Record<string, string | number>>();
  const body = `<h1>Statuses</h1><p class="help">Merchant timelines use the label. Keep it in plain language.</p>
    <ul class="plain-list">${(rows.results || []).map((r) => `<li><a href="/admin/statuses/${esc(r.id)}">${esc(r.label)}</a> · ${esc(r.key)} · ${r.active ? "active" : "inactive"}</li>`).join("")}</ul>
    <h2>Add a status</h2>${statusForm("/admin/statuses", null)}`;
  return c.html(shell(c, "Statuses", "/admin/statuses", body));
}

export async function statusEdit(c: Ctx, id: string, error = ""): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT * FROM statuses WHERE id = ?").bind(id).first<Record<string, string | number>>();
  if (!row) return c.redirect("/admin/statuses");
  const body = `<h1>${esc(row.label)}</h1>${error ? `<p class="errors">${esc(error)}</p>` : ""}${statusForm(`/admin/statuses/${id}`, row)}
    <form method="post" action="/admin/statuses/${esc(id)}/delete"><button class="btn-danger" type="submit">Remove status</button></form>`;
  return c.html(shell(c, "Status", "/admin/statuses", body));
}

export async function saveStatus(c: Ctx, id: string | null): Promise<Response> {
  const form = await c.req.formData();
  const key = String(form.get("key") || "").trim();
  const label = String(form.get("label") || "").trim().slice(0, 120);
  const description = String(form.get("description") || "").trim().slice(0, 500);
  if (!/^[a-z][a-z0-9_]*$/.test(key) || !label) return statusEdit(c, id || "", "Key and label are required.");
  if (mentionsSupplier(`${label}\n${description}`)) return id ? statusEdit(c, id, SUPPLIER_ERROR) : c.html(shell(c, "Statuses", "/admin/statuses", `<p class="errors">${SUPPLIER_ERROR}</p>`), 400);
  const stamp = nowIso();
  const active = form.get("active") === "yes" ? 1 : 0;
  const sort = Number(form.get("sort_order") || 0);
  if (id) {
    await c.env.DB.prepare("UPDATE statuses SET key=?, label=?, description=?, sort_order=?, active=?, updated_at=? WHERE id=?")
      .bind(key, label, description, sort, active, stamp, id)
      .run();
  } else {
    await c.env.DB.prepare("INSERT INTO statuses (id, key, label, description, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("status"), key, label, description, sort, active, stamp, stamp)
      .run();
  }
  return c.redirect("/admin/statuses");
}

export async function deleteStatus(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM statuses WHERE id = ?").bind(id).run();
  return c.redirect("/admin/statuses");
}

function statusForm(action: string, row: Record<string, string | number> | null): string {
  return `<form class="stack-form" method="post" action="${action}">
    <label>Key<input name="key" required value="${esc(row?.key || "")}"></label>
    <label>Merchant label<input name="label" required value="${esc(row?.label || "")}"></label>
    <label>Description<textarea name="description">${esc(row?.description || "")}</textarea></label>
    <label>Sort<input name="sort_order" type="number" value="${row?.sort_order ?? 100}"></label>
    <label class="check"><input type="checkbox" name="active" value="yes"${!row || row.active ? " checked" : ""}> Active</label>
    <button class="btn-p" type="submit">Save status</button>
  </form>`;
}

export async function ticketTypes(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare("SELECT id, key, label, active FROM ticket_types ORDER BY sort_order").all<Record<string, string | number>>();
  const body = `<h1>Ticket types</h1>
    <ul class="plain-list">${(rows.results || []).map((r) => `<li><a href="/admin/ticket-types/${esc(r.id)}">${esc(r.label)}</a></li>`).join("")}</ul>
    <h2>Add a ticket type</h2>${ticketTypeForm("/admin/ticket-types", null)}`;
  return c.html(shell(c, "Ticket types", "/admin/ticket-types", body));
}

export async function ticketTypeEdit(c: Ctx, id: string, error = ""): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT * FROM ticket_types WHERE id = ?").bind(id).first<Record<string, string | number>>();
  if (!row) return c.redirect("/admin/ticket-types");
  const body = `<h1>${esc(row.label)}</h1>${error ? `<p class="errors">${esc(error)}</p>` : ""}${ticketTypeForm(`/admin/ticket-types/${id}`, row)}
    <form method="post" action="/admin/ticket-types/${esc(id)}/delete"><button class="btn-danger" type="submit">Remove ticket type</button></form>`;
  return c.html(shell(c, "Ticket type", "/admin/ticket-types", body));
}

export async function saveTicketType(c: Ctx, id: string | null): Promise<Response> {
  const form = await c.req.formData();
  const key = String(form.get("key") || "").trim();
  const label = String(form.get("label") || "").trim().slice(0, 120);
  const description = String(form.get("description") || "").trim().slice(0, 500);
  if (!/^[a-z][a-z0-9_]*$/.test(key) || !label) return c.redirect("/admin/ticket-types");
  if (mentionsSupplier(`${label}\n${description}`)) {
    return id ? ticketTypeEdit(c, id, SUPPLIER_ERROR) : c.html(shell(c, "Ticket types", "/admin/ticket-types", `<p class="errors">${SUPPLIER_ERROR}</p>`), 400);
  }
  const stamp = nowIso();
  const active = form.get("active") === "yes" ? 1 : 0;
  const sort = Number(form.get("sort_order") || 0);
  if (id) {
    await c.env.DB.prepare("UPDATE ticket_types SET key=?, label=?, description=?, sort_order=?, active=?, updated_at=? WHERE id=?")
      .bind(key, label, description, sort, active, stamp, id)
      .run();
  } else {
    await c.env.DB.prepare("INSERT INTO ticket_types (id, key, label, description, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("tt"), key, label, description, sort, active, stamp, stamp)
      .run();
  }
  return c.redirect("/admin/ticket-types");
}

export async function deleteTicketType(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM ticket_types WHERE id = ?").bind(id).run();
  return c.redirect("/admin/ticket-types");
}

function ticketTypeForm(action: string, row: Record<string, string | number> | null): string {
  return `<form class="stack-form" method="post" action="${action}">
    <label>Key<input name="key" required value="${esc(row?.key || "")}"></label>
    <label>Label<input name="label" required value="${esc(row?.label || "")}"></label>
    <label>Description<textarea name="description">${esc(row?.description || "")}</textarea></label>
    <label>Sort<input name="sort_order" type="number" value="${row?.sort_order ?? 100}"></label>
    <label class="check"><input type="checkbox" name="active" value="yes"${!row || row.active ? " checked" : ""}> Active</label>
    <button class="btn-p" type="submit">Save ticket type</button>
  </form>`;
}

export async function messages(c: Ctx): Promise<Response> {
  const calls = await c.env.DB.prepare(
    "SELECT name, phone, email, sells, card_status, monthly_volume, notes, created_at FROM call_requests ORDER BY created_at DESC LIMIT 100",
  ).all<Record<string, string>>();
  const rows = await c.env.DB.prepare("SELECT name, email, phone, message, topic, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 100").all<Record<string, string>>();
  const callList = (calls.results || [])
    .map(
      (r) => `<li><strong>${esc(r.name)}</strong> · ${esc(r.phone)} · ${esc(r.email)}<br>${esc(r.sells)} · ${esc(r.card_status)} · ${esc(r.monthly_volume)}${r.notes ? `<br>${esc(r.notes)}` : ""}<br><span>${esc(formatWhen(r.created_at))}</span></li>`,
    )
    .join("");
  const body = `<h1>Messages</h1>
    <h2>Call requests</h2>
    <p class="help">A call request is not a fee payment. Ads still use the fee payment as the only bidding conversion. Appointments are on <a href="/admin/bookings">Bookings</a>.</p>
    <ul class="plain-list">${callList || "<li>No call requests.</li>"}</ul>
    <h2>Contact messages</h2>
    <ul class="plain-list">${(rows.results || []).map((r) => `<li><strong>${esc(r.name)}</strong> · ${esc(r.email)} · ${esc(r.phone || "")}${r.topic ? ` · ${esc(r.topic)}` : ""}<br>${esc(r.message)}<br><span>${esc(formatWhen(r.created_at))}</span></li>`).join("") || "<li>No messages.</li>"}</ul>`;
  return c.html(shell(c, "Messages", "/admin/messages", body));
}

export async function outbox(c: Ctx): Promise<Response> {
  const rows = await c.env.DB.prepare("SELECT to_email, from_email, subject, body, status, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 100").all<Record<string, string>>();
  const body = `<h1>Email queue</h1>
    <p class="help">These messages are stored and marked to send from info@paycoreos.com. Nothing is delivered. Real email stays off until the inbox exists.</p>
    ${(rows.results || []).map((r) => `<article class="ticket"><h3>${esc(r.subject)}</h3><p>${esc(r.status)} · ${esc(r.from_email)} → ${esc(r.to_email)} · ${esc(formatWhen(r.created_at))}</p><pre class="json">${esc(r.body)}</pre></article>`).join("") || "<p>Nothing queued.</p>"}`;
  return c.html(shell(c, "Email queue", "/admin/outbox", body));
}

export async function download(c: Ctx, id: string): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT r2_key, filename FROM uploads WHERE id = ?").bind(id).first<{ r2_key: string; filename: string }>();
  if (!row) return c.text("Not found", 404);
  const object = await c.env.FILES.get(row.r2_key);
  if (!object) return c.text("Not found", 404);
  const headers = new Headers();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${row.filename.replace(/"/g, "")}"`);
  return new Response(object.body, { headers });
}

async function appByRef(c: Ctx, ref: string): Promise<{ id: string; public_ref: string; email: string; merchant_user_id: string | null } | null> {
  return c.env.DB.prepare("SELECT id, public_ref, email, merchant_user_id FROM applications WHERE public_ref = ?")
    .bind(ref)
    .first<{ id: string; public_ref: string; email: string; merchant_user_id: string | null }>();
}

async function postMerchantUpdate(c: Ctx, app: { id: string; public_ref: string; email: string }, body: string, statusId: string | null): Promise<void> {
  const stamp = nowIso();
  await c.env.DB.prepare(
    "INSERT INTO timeline_events (id, application_id, status_id, body, merchant_visible, email_queued, created_by, created_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)",
  )
    .bind(newId("evt"), app.id, statusId, body, c.get("user")!.id, stamp)
    .run();
  await queueEmail(c.env.DB, {
    to: app.email,
    subject: `PaycoreOS application ${app.public_ref}`,
    body: merchantEmailBody(app.public_ref, body),
    applicationId: app.id,
  });
}

function pretty(value: string | null): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function shell(c: Ctx, title: string, path: string, body: string): string {
  return appShell({ title: `${title} · PaycoreOS admin`, hostname: new URL(c.req.url).hostname, path, kind: "admin", body });
}
