import type { Context } from "hono";
import { appShell, layout } from "./layout";
import { queueEmail } from "./mail";
import { pageSeo } from "./seo";
import type { Env, SessionUser } from "./types";
import { cleanText, EMAIL, esc, formatWhen, newId, nowIso } from "./util";

type Ctx = Context<{ Bindings: Env; Variables: { user: SessionUser | null } }>;

export const BOOKING_TZ = "America/New_York";

export const TCPA_TEXT =
  "I agree that PaycoreOS may call or text me at this number about this appointment, including with an automatic telephone dialing system or a prerecorded or artificial voice. I do not have to check this box to book a time. Checking it is not a condition of any purchase. Message and data rates may apply. I can reply STOP to end texts.";

export const RECORDING_NOTICE =
  "Calls may be recorded. Florida law requires all parties on a call to consent before it is recorded. Leave the box unchecked if you do not agree to a recording.";

export const RECORDING_CHECK = "I agree that this appointment call may be recorded.";

export const BOOKING_TOPICS = [
  ["file-read", "A read on a new file"],
  ["already-processing", "I already accept cards"],
  ["declined", "A bank declined my file"],
  ["dispute-defense", "Dispute defense"],
  ["other", "Something else"],
] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOT_CHOICES = [15, 20, 30, 45, 60];

type Settings = {
  slotMinutes: number;
  daysAhead: number;
  minNoticeHours: number;
  webhookEnabled: boolean;
  webhookUrl: string;
};

type Slot = { startsAt: string; endsAt: string; label: string };
type DaySlots = { key: string; label: string; slots: Slot[] };

type Span = { starts_at: string; ends_at: string };

export type BookingRow = {
  id: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  name: string;
  email: string;
  phone: string;
  business_name: string;
  topic: string;
  notes: string;
  tcpa_consent: number;
  tcpa_consent_text: string;
  recording_consent: number;
  recording_notice: string;
  status: string;
  webhook_status?: string;
  webhook_payload?: string;
  webhook_error?: string;
};

function choice(list: readonly (readonly [string, string])[], value: string): string | null {
  return list.find(([key]) => key === value)?.[1] ?? null;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

function nthWeekday(year: number, monthIndex: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return 1 + delta + (n - 1) * 7;
}

function easternDstBounds(year: number): { start: number; end: number } {
  const startDay = nthWeekday(year, 2, 0, 2);
  const endDay = nthWeekday(year, 10, 0, 1);
  return { start: Date.UTC(year, 2, startDay, 7, 0, 0), end: Date.UTC(year, 10, endDay, 6, 0, 0) };
}

export function easternToUtc(year: number, month: number, day: number, minutes: number): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let utc = Date.UTC(year, month - 1, day, hour + 5, minute, 0);
  const bounds = easternDstBounds(year);
  if (utc >= bounds.start && utc < bounds.end) utc = Date.UTC(year, month - 1, day, hour + 4, minute, 0);
  return new Date(utc);
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function partsInEastern(date: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return { year, month, day, weekday: weekdayOf(year, month, day) };
}

function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number; weekday: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate(), weekday: utc.getUTCDay() };
}

function dateKey(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function clockValue(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: BOOKING_TZ, hour: "numeric", minute: "2-digit" }).format(date);
}

function dayLabel(date: { year: number; month: number; day: number }): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: BOOKING_TZ, weekday: "short", month: "short", day: "numeric" }).format(
    easternToUtc(date.year, date.month, date.day, 12 * 60),
  );
}

function overlaps(start: string, end: string, rows: Span[]): boolean {
  const a = Date.parse(start);
  const b = Date.parse(end);
  return rows.some((row) => Date.parse(row.starts_at) < b && Date.parse(row.ends_at) > a);
}

export function bookingPayload(row: BookingRow, source: string): Record<string, unknown> {
  return {
    payload_version: 1,
    event: "booking.created",
    id: row.id,
    created_at: row.created_at,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: BOOKING_TZ,
    name: row.name,
    email: row.email,
    phone: row.phone,
    business_name: row.business_name,
    topic: row.topic,
    notes: row.notes,
    tcpa_consent: row.tcpa_consent === 1,
    tcpa_consent_text: row.tcpa_consent_text,
    recording_consent: row.recording_consent === 1,
    recording_notice: row.recording_notice,
    status: row.status || "scheduled",
    source,
  };
}

export function samplePayload(): string {
  return JSON.stringify(
    bookingPayload(
      {
        id: "book_example",
        created_at: "2026-11-09T15:00:00.000Z",
        starts_at: "2026-11-10T14:00:00.000Z",
        ends_at: "2026-11-10T14:30:00.000Z",
        name: "Example Merchant",
        email: "merchant@example.com",
        phone: "407-555-0100",
        business_name: "Example LLC",
        topic: "A read on a new file",
        notes: "",
        tcpa_consent: 0,
        tcpa_consent_text: TCPA_TEXT,
        recording_consent: 0,
        recording_notice: RECORDING_NOTICE,
        status: "scheduled",
      },
      "https://paycoreos.com/book",
    ),
    null,
    2,
  );
}

async function loadSettings(db: D1Database): Promise<Settings> {
  const rows = await db.prepare("SELECT key, value FROM booking_settings").all<{ key: string; value: string }>();
  const map = new Map((rows.results || []).map((row) => [row.key, row.value]));
  const slot = clampInt(map.get("slot_minutes"), 15, 60, 30);
  return {
    slotMinutes: SLOT_CHOICES.includes(slot) ? slot : 30,
    daysAhead: clampInt(map.get("days_ahead"), 1, 60, 14),
    minNoticeHours: clampInt(map.get("min_notice_hours"), 0, 168, 4),
    webhookEnabled: map.get("webhook_enabled") === "1",
    webhookUrl: map.get("webhook_url") || "",
  };
}

async function listDays(db: D1Database, now = new Date()): Promise<DaySlots[]> {
  const settings = await loadSettings(db);
  const windows = await db
    .prepare("SELECT weekday, start_min, end_min FROM booking_windows WHERE active = 1")
    .all<{ weekday: number; start_min: number; end_min: number }>();
  const blocks = await db
    .prepare("SELECT starts_at, ends_at FROM booking_blocks WHERE ends_at > ?")
    .bind(now.toISOString())
    .all<Span>();
  const taken = await db
    .prepare("SELECT starts_at, ends_at FROM bookings WHERE status = 'scheduled' AND ends_at > ?")
    .bind(now.toISOString())
    .all<Span>();
  const minStart = now.getTime() + settings.minNoticeHours * 3600000;
  const today = partsInEastern(now);
  const byDay = new Map<string, DaySlots>();
  const seen = new Set<string>();
  for (let offset = 0; offset < settings.daysAhead; offset++) {
    const date = addDays(today.year, today.month, today.day, offset);
    const key = dateKey(date);
    for (const window of windows.results || []) {
      if (Number(window.weekday) !== date.weekday) continue;
      const startMin = Number(window.start_min);
      const endMin = Number(window.end_min);
      for (let minute = startMin; minute + settings.slotMinutes <= endMin; minute += settings.slotMinutes) {
        const start = easternToUtc(date.year, date.month, date.day, minute);
        const end = new Date(start.getTime() + settings.slotMinutes * 60000);
        if (start.getTime() < minStart) continue;
        const startsAt = start.toISOString();
        const endsAt = end.toISOString();
        if (seen.has(startsAt)) continue;
        if (overlaps(startsAt, endsAt, blocks.results || []) || overlaps(startsAt, endsAt, taken.results || [])) continue;
        seen.add(startsAt);
        let day = byDay.get(key);
        if (!day) {
          day = { key, label: dayLabel(date), slots: [] };
          byDay.set(key, day);
        }
        day.slots.push({ startsAt, endsAt, label: timeLabel(start) });
      }
    }
  }
  return [...byDay.values()];
}

function topicOptions(selected: string): string {
  return BOOKING_TOPICS.map(([key, label]) => `<option value="${esc(key)}"${key === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}

function webhookUrlError(value: string): string | null {
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "The webhook address must be a full https URL.";
  }
  if (url.protocol !== "https:") return "The webhook address must start with https.";
  if (url.username || url.password) return "The webhook address cannot include a username or password.";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".internal")) {
    return "The webhook address must be a public https host.";
  }
  return null;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pushWebhook(env: Env, row: BookingRow): Promise<{ status: string; error: string }> {
  const settings = await loadSettings(env.DB);
  const payload = row.webhook_payload || "";
  if (!settings.webhookEnabled) return { status: "disabled", error: "" };
  if (!settings.webhookUrl) return { status: "skipped_no_url", error: "Save an https webhook URL before sending." };
  if (webhookUrlError(settings.webhookUrl)) return { status: "skipped_no_url", error: "The saved webhook URL is not a public https address." };
  const secret = env.BOOKING_WEBHOOK_SECRET || "";
  if (!secret) return { status: "skipped_no_secret", error: "Set the BOOKING_WEBHOOK_SECRET Worker secret before sending." };
  try {
    const signature = await hmacHex(secret, payload);
    const response = await fetch(settings.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paycore-event": "booking.created",
        "x-paycore-signature": `sha256=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "failed", error: `HTTP ${response.status}` };
    return { status: "sent", error: "" };
  } catch (err) {
    return { status: "failed", error: cleanText(err instanceof Error ? err.message : String(err), 300) };
  }
}

export async function bookPage(c: Ctx, state?: { errors?: string[]; values?: Record<string, string> }): Promise<Response> {
  const url = new URL(c.req.url);
  const values = state?.values || {};
  const days = await listDays(c.env.DB);
  const requested = values.date || url.searchParams.get("date") || "";
  const selected = days.find((day) => day.key === requested) || days[0];
  const errors = state?.errors?.length
    ? `<div class="errors" role="alert"><p>Fix the form before the time can be saved.</p><ul>${state.errors.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`
    : "";
  const dayNav = days.length
    ? `<ul class="day-list">${days
        .map(
          (day) =>
            `<li><a href="/book?date=${esc(day.key)}"${selected && day.key === selected.key ? ' aria-current="date"' : ""}>${esc(day.label)}</a></li>`,
        )
        .join("")}</ul>`
    : "";
  const slots = selected
    ? `<fieldset class="slot-set"><legend>Open times on ${esc(selected.label)}</legend><div class="slot-grid">${selected.slots
        .map(
          (slot) =>
            `<label class="slot"><input type="radio" name="starts_at" value="${esc(slot.startsAt)}"${slot.startsAt === values.starts_at ? " checked" : ""} required><span>${esc(slot.label)} ET</span></label>`,
        )
        .join("")}</div></fieldset><input type="hidden" name="date" value="${esc(selected.key)}">`
    : `<p class="errors">No times are open right now. Call (407) 270-2502 or <a href="/contact">send a message</a>.</p>`;
  const form = selected
    ? `<form class="stack-form" method="post" action="/book">
        ${slots}
        <label>Name<input name="name" required autocomplete="name" value="${esc(values.name || "")}"></label>
        <label>Email<input name="email" type="email" required autocomplete="email" value="${esc(values.email || "")}"></label>
        <label>Phone<span class="help">A number PaycoreOS can call for this appointment.</span><input name="phone" type="tel" required autocomplete="tel" value="${esc(values.phone || "")}"></label>
        <label>Business name<span class="help">Optional.</span><input name="business_name" autocomplete="organization" value="${esc(values.business_name || "")}"></label>
        <label>What is the call about?
          <select name="topic" required>
            <option value="">Choose</option>
            ${topicOptions(values.topic || "")}
          </select>
        </label>
        <label>Note<span class="help">Optional.</span><textarea name="notes">${esc(values.notes || "")}</textarea></label>
        <div class="legal-note">
          <p>${esc(TCPA_TEXT)}</p>
          <label class="check"><input type="checkbox" name="tcpa_consent" value="yes"> I agree to calls and texts as described above.</label>
        </div>
        <div class="legal-note">
          <p>${esc(RECORDING_NOTICE)}</p>
          <label class="check"><input type="checkbox" name="recording_consent" value="yes"> ${esc(RECORDING_CHECK)}</label>
        </div>
        <button class="btn-p" type="submit">Book this time</button>
      </form>`
    : slots;
  const main = `<article class="wrap">
    <header class="page-head">
      <h1>Book a time with PaycoreOS</h1>
      <p class="lede">Pick an open time. PaycoreOS will call then. The call is about 20 minutes. Times are Eastern. This page does not submit an application, and it does not charge the $39 fee.</p>
    </header>
    ${errors}
    ${dayNav}
    ${form}
    <p class="home-call">Want to write instead? <a href="/contact">Contact PaycoreOS</a>. Ready to apply? <a href="/apply">Start the application</a>.</p>
  </article>`;
  const seo = pageSeo("/book");
  if (!seo) throw new Error("missing seo for /book");
  return c.html(layout({ hostname: url.hostname, seo, main }), state?.errors?.length ? 400 : 200);
}

export async function submitBooking(c: Ctx): Promise<Response> {
  const form = await c.req.formData();
  const values: Record<string, string> = {
    name: cleanText(String(form.get("name") || ""), 200),
    email: cleanText(String(form.get("email") || ""), 200),
    phone: cleanText(String(form.get("phone") || ""), 40),
    business_name: cleanText(String(form.get("business_name") || ""), 200),
    topic: String(form.get("topic") || ""),
    notes: cleanText(String(form.get("notes") || ""), 2000),
    starts_at: String(form.get("starts_at") || ""),
    date: String(form.get("date") || ""),
  };
  const topic = choice(BOOKING_TOPICS, values.topic);
  const tcpa = form.get("tcpa_consent") === "yes";
  const recording = form.get("recording_consent") === "yes";
  const errors: string[] = [];
  if (!values.name) errors.push("Name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push("Enter a valid email.");
  if (values.phone.replace(/\D/g, "").length < 10) errors.push("Enter a phone number with an area code.");
  if (!topic) errors.push("Choose what the call is about.");
  const days = await listDays(c.env.DB);
  const slot = days.flatMap((day) => day.slots).find((item) => item.startsAt === values.starts_at);
  if (!slot) errors.push("That time is no longer open. Choose another.");
  if (errors.length || !slot || !topic) return bookPage(c, { errors, values });

  const id = newId("book");
  const stamp = nowIso();
  const url = new URL(c.req.url);
  const row: BookingRow = {
    id,
    created_at: stamp,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    name: values.name,
    email: values.email,
    phone: values.phone,
    business_name: values.business_name,
    topic,
    notes: values.notes,
    tcpa_consent: tcpa ? 1 : 0,
    tcpa_consent_text: TCPA_TEXT,
    recording_consent: recording ? 1 : 0,
    recording_notice: RECORDING_NOTICE,
    status: "scheduled",
  };
  const payload = JSON.stringify(bookingPayload(row, `${url.origin}/book`));
  try {
    await c.env.DB.prepare(
      `INSERT INTO bookings (
        id, name, email, phone, business_name, topic, notes, starts_at, ends_at, timezone,
        tcpa_consent, tcpa_consent_text, recording_consent, recording_notice, status,
        webhook_status, webhook_payload, webhook_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'disabled', ?, '', ?)`,
    )
      .bind(
        id,
        row.name,
        row.email,
        row.phone,
        row.business_name,
        row.topic,
        row.notes,
        row.starts_at,
        row.ends_at,
        BOOKING_TZ,
        row.tcpa_consent,
        row.tcpa_consent_text,
        row.recording_consent,
        row.recording_notice,
        payload,
        stamp,
      )
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return bookPage(c, { errors: ["That time was just taken. Choose another."], values });
    throw err;
  }
  const sent = await pushWebhook(c.env, { ...row, webhook_payload: payload });
  await c.env.DB.prepare("UPDATE bookings SET webhook_status = ?, webhook_error = ? WHERE id = ?").bind(sent.status, sent.error, id).run();
  await queueEmail(c.env.DB, {
    to: EMAIL,
    subject: `PaycoreOS appointment from ${row.name}`,
    body: `${row.name}\n${row.phone}\n${row.email}\n${row.business_name}\n${row.topic}\n${formatWhen(row.starts_at)} Eastern\nTCPA consent: ${tcpa ? "yes" : "no"}\nRecording consent: ${recording ? "yes" : "no"}\n\n${row.notes}\n\nThis is an appointment. It is not a fee payment.`,
    applicationId: null,
  });
  return c.redirect(`/thank-you?for=booking&ref=${encodeURIComponent(id)}`);
}

export async function bookingThanks(db: D1Database, id: string): Promise<string> {
  const safe = id.startsWith("book_") ? id : "";
  const row = safe
    ? await db
        .prepare(
          "SELECT name, email, phone, business_name, topic, starts_at, ends_at, tcpa_consent, recording_consent, status FROM bookings WHERE id = ?",
        )
        .bind(safe)
        .first<{
          name: string;
          email: string;
          phone: string;
          business_name: string;
          topic: string;
          starts_at: string;
          ends_at: string;
          tcpa_consent: number;
          recording_consent: number;
          status: string;
        }>()
    : null;
  if (!row || row.status !== "scheduled") {
    return `<p>We could not find that appointment. <a href="/book">Book a time</a>.</p>
      <p>This page is not a payment receipt. The $39 application fee is not collected here.</p>`;
  }
  const tcpa =
    row.tcpa_consent === 1
      ? "You agreed that PaycoreOS may call or text this number about the appointment, including with an automatic dialer or a prerecorded voice."
      : "You did not check the box for automatic or prerecorded calls and texts. PaycoreOS will still call at the time you booked, because you asked for that appointment.";
  const recording =
    row.recording_consent === 1
      ? "You agreed this call may be recorded."
      : "You did not agree to a recording. Florida law requires all parties to consent before a call is recorded.";
  return `<p class="ok" role="status">Your time is saved. PaycoreOS will call at ${esc(formatWhen(row.starts_at))} Eastern. The call is about 20 minutes.</p>
    <p><strong>${esc(row.name)}</strong>${row.business_name ? ` · ${esc(row.business_name)}` : ""}<br>${esc(row.phone)} · ${esc(row.email)}<br>${esc(row.topic)}</p>
    <p>${esc(tcpa)}</p>
    <p>${esc(recording)}</p>
    <p>This page is not a payment receipt. The $39 application fee is not collected here.</p>
    <p><a href="/apply">Start the application</a> · <a href="/contact">Send a message</a></p>`;
}

export async function upcomingBookingsHtml(db: D1Database): Promise<string> {
  const rows = await db
    .prepare(
      "SELECT name, phone, topic, starts_at FROM bookings WHERE status = 'scheduled' AND starts_at >= ? ORDER BY starts_at ASC LIMIT 8",
    )
    .bind(new Date().toISOString())
    .all<{ name: string; phone: string; topic: string; starts_at: string }>();
  const items = (rows.results || [])
    .map((row) => `<li><strong>${esc(formatWhen(row.starts_at))}</strong> · ${esc(row.name)} · ${esc(row.phone)} · ${esc(row.topic)}</li>`)
    .join("");
  return `<h2>Upcoming appointments</h2>
    <p><a href="/admin/bookings">Manage hours and bookings</a></p>
    <ul class="plain-list">${items || "<li>No upcoming appointments.</li>"}</ul>`;
}

function adminShell(c: Ctx, body: string): string {
  return appShell({
    title: "Bookings · PaycoreOS admin",
    hostname: new URL(c.req.url).hostname,
    path: "/admin/bookings",
    kind: "admin",
    body,
  });
}

export async function bookingsAdmin(c: Ctx, error = ""): Promise<Response> {
  const settings = await loadSettings(c.env.DB);
  const windows = await c.env.DB.prepare("SELECT id, weekday, start_min, end_min FROM booking_windows WHERE active = 1 ORDER BY weekday, start_min").all<{
    id: string;
    weekday: number;
    start_min: number;
    end_min: number;
  }>();
  const blocks = await c.env.DB.prepare("SELECT id, starts_at, ends_at, reason FROM booking_blocks WHERE ends_at > ? ORDER BY starts_at LIMIT 50")
    .bind(new Date().toISOString())
    .all<{ id: string; starts_at: string; ends_at: string; reason: string }>();
  const bookings = await c.env.DB.prepare(
    "SELECT id, name, email, phone, topic, starts_at, status, tcpa_consent, recording_consent, webhook_status, webhook_error FROM bookings ORDER BY starts_at DESC LIMIT 100",
  ).all<{
    id: string;
    name: string;
    email: string;
    phone: string;
    topic: string;
    starts_at: string;
    status: string;
    tcpa_consent: number;
    recording_consent: number;
    webhook_status: string;
    webhook_error: string;
  }>();
  const windowRows = (windows.results || [])
    .map(
      (row) => `<tr>
        <td>${esc(WEEKDAYS[Number(row.weekday)] || "")}</td>
        <td>${esc(formatMinutes(Number(row.start_min)))}</td>
        <td>${esc(formatMinutes(Number(row.end_min)))}</td>
        <td><form method="post" action="/admin/bookings/windows/${esc(row.id)}/delete"><button class="btn-danger" type="submit">Remove</button></form></td>
      </tr>`,
    )
    .join("");
  const weekdayOptions = WEEKDAYS.map((label, index) => `<option value="${index}">${label}</option>`).join("");
  const blockRows = (blocks.results || [])
    .map(
      (row) => `<li>${esc(formatWhen(row.starts_at))} – ${esc(formatWhen(row.ends_at))}${row.reason ? ` · ${esc(row.reason)}` : ""}
        <form method="post" action="/admin/bookings/blocks/${esc(row.id)}/delete"><button class="btn-danger" type="submit">Remove block</button></form></li>`,
    )
    .join("");
  const bookingRows = (bookings.results || [])
    .map((row) => {
      const cancel =
        row.status === "scheduled"
          ? `<form method="post" action="/admin/bookings/${esc(row.id)}/cancel"><button class="btn-danger" type="submit">Cancel</button></form>`
          : esc(row.status);
      return `<tr>
        <td>${esc(formatWhen(row.starts_at))}</td>
        <td>${esc(row.name)}<br>${esc(row.phone)}<br>${esc(row.email)}</td>
        <td>${esc(row.topic)}</td>
        <td>${row.tcpa_consent === 1 ? "Yes" : "No"}</td>
        <td>${row.recording_consent === 1 ? "Yes" : "No"}</td>
        <td>${esc(row.webhook_status)}${row.webhook_error ? `<br><span class="help">${esc(row.webhook_error)}</span>` : ""}
          <form method="post" action="/admin/bookings/${esc(row.id)}/webhook"><button class="btn-s" type="submit">Send webhook</button></form></td>
        <td>${cancel}</td>
      </tr>`;
    })
    .join("");
  const slotOptions = SLOT_CHOICES.map((n) => `<option value="${n}"${n === settings.slotMinutes ? " selected" : ""}>${n} minutes</option>`).join("");
  const body = `<h1>Bookings</h1>
    ${error ? `<p class="errors" role="alert">${esc(error)}</p>` : ""}
    <p class="help">Public times come from the weekly hours below. The first setup is Monday through Friday, 9:00 a.m. to 5:00 p.m. Eastern, in 30-minute slots, with 4 hours' notice and 14 days ahead. Confirm or change that before customers rely on it. The CRM webhook is off until you turn it on. There is no Twilio connection in this app.</p>
    <h2>Saved appointments</h2>
    <table><thead><tr><th>When</th><th>Who</th><th>Topic</th><th>TCPA</th><th>Recording</th><th>Webhook</th><th></th></tr></thead>
      <tbody>${bookingRows || `<tr><td colspan="7">No appointments yet.</td></tr>`}</tbody></table>
    <h2 id="hours">Weekly hours</h2>
    <p class="help">Times are Eastern. A slot is offered only when the whole slot fits inside a window.</p>
    <table><thead><tr><th>Day</th><th>Opens</th><th>Closes</th><th></th></tr></thead><tbody>${windowRows || `<tr><td colspan="4">No hours. The public page has no times.</td></tr>`}</tbody></table>
    <form class="stack-form" method="post" action="/admin/bookings/windows">
      <h3>Add hours</h3>
      <label>Day<select name="weekday">${weekdayOptions}</select></label>
      <label>Opens<input name="start" type="time" value="09:00" required></label>
      <label>Closes<input name="end" type="time" value="17:00" required></label>
      <button class="btn-p" type="submit">Add hours</button>
    </form>
    <h2>Blocked times</h2>
    <ul class="plain-list">${blockRows || "<li>No blocks.</li>"}</ul>
    <form class="stack-form" method="post" action="/admin/bookings/blocks">
      <h3>Block a range</h3>
      <label>Date<input name="date" type="date" required></label>
      <label>From<input name="start" type="time" value="09:00" required></label>
      <label>To<input name="end" type="time" value="17:00" required></label>
      <label>Reason<span class="help">Optional. To close a day, block 12:00 AM through 11:59 PM.</span><input name="reason"></label>
      <button class="btn-p" type="submit">Add block</button>
    </form>
    <h2>Schedule settings</h2>
    <form class="stack-form" method="post" action="/admin/bookings/settings">
      <label>Slot length<select name="slot_minutes">${slotOptions}</select></label>
      <label>Days ahead<input name="days_ahead" type="number" min="1" max="60" value="${settings.daysAhead}"></label>
      <label>Hours of notice<input name="min_notice_hours" type="number" min="0" max="168" value="${settings.minNoticeHours}"></label>
      <label>CRM webhook URL<span class="help">Leave blank to keep sending off. https only. This is not a secret.</span><input name="webhook_url" type="url" value="${esc(settings.webhookUrl)}" placeholder="https://example.com/paycoreos/bookings"></label>
      <label class="check"><input type="checkbox" name="webhook_enabled" value="yes"${settings.webhookEnabled ? " checked" : ""}> Send bookings to the CRM webhook</label>
      <p class="help">This box starts unchecked. Checking it does not send anything until an https URL is saved and the Worker secret BOOKING_WEBHOOK_SECRET is set. Do not put that secret in the repo.</p>
      <button class="btn-p" type="submit">Save settings</button>
    </form>
    <h2>Webhook payload</h2>
    <p class="help">Off by default. When it is on, PaycoreOS POSTs this JSON to the URL above. The header <code>X-Paycore-Event</code> is <code>booking.created</code>. The header <code>X-Paycore-Signature</code> is <code>sha256=</code> plus the HMAC-SHA256 hex of the raw body, using BOOKING_WEBHOOK_SECRET. <code>tcpa_consent</code> and <code>recording_consent</code> are true only when the visitor checked the box. The text fields are the words shown on the page, not proof of consent by themselves. A failed POST does not undo the booking. Cancelling a booking does not send another event. <code>source</code> is the /book URL on the host that saved it.</p>
    <pre class="json">${esc(samplePayload())}</pre>`;
  return c.html(adminShell(c, body), error ? 400 : 200);
}

async function saveSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO booking_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

export async function saveBookingSettings(c: Ctx): Promise<Response> {
  const form = await c.req.formData();
  const slot = clampInt(String(form.get("slot_minutes") || ""), 15, 60, 30);
  const days = clampInt(String(form.get("days_ahead") || ""), 1, 60, 14);
  const notice = clampInt(String(form.get("min_notice_hours") || ""), 0, 168, 4);
  const url = cleanText(String(form.get("webhook_url") || ""), 500);
  const urlError = webhookUrlError(url);
  if (urlError) return bookingsAdmin(c, urlError);
  if (!SLOT_CHOICES.includes(slot)) return bookingsAdmin(c, "Choose a slot length of 15, 20, 30, 45, or 60 minutes.");
  await saveSetting(c.env.DB, "slot_minutes", String(slot));
  await saveSetting(c.env.DB, "days_ahead", String(days));
  await saveSetting(c.env.DB, "min_notice_hours", String(notice));
  await saveSetting(c.env.DB, "webhook_url", url);
  await saveSetting(c.env.DB, "webhook_enabled", form.get("webhook_enabled") === "yes" ? "1" : "0");
  return c.redirect("/admin/bookings");
}

export async function addWindow(c: Ctx): Promise<Response> {
  const form = await c.req.formData();
  const weekday = Number(form.get("weekday"));
  const start = parseClock(String(form.get("start") || ""));
  const end = parseClock(String(form.get("end") || ""));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || start === null || end === null || end <= start) {
    return bookingsAdmin(c, "Choose a day and a close time after the open time.");
  }
  await c.env.DB.prepare("INSERT INTO booking_windows (id, weekday, start_min, end_min, active) VALUES (?, ?, ?, ?, 1)")
    .bind(newId("win"), weekday, start, end)
    .run();
  return c.redirect("/admin/bookings#hours");
}

export async function deleteWindow(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM booking_windows WHERE id = ?").bind(id).run();
  return c.redirect("/admin/bookings#hours");
}

export async function addBlock(c: Ctx): Promise<Response> {
  const form = await c.req.formData();
  const date = parseDateKey(String(form.get("date") || ""));
  const start = parseClock(String(form.get("start") || ""));
  const end = parseClock(String(form.get("end") || ""));
  const reason = cleanText(String(form.get("reason") || ""), 200);
  if (!date || start === null || end === null || end <= start) return bookingsAdmin(c, "Choose a date and an end time after the start.");
  const starts = easternToUtc(date.year, date.month, date.day, start);
  const ends = easternToUtc(date.year, date.month, date.day, end);
  await c.env.DB.prepare("INSERT INTO booking_blocks (id, starts_at, ends_at, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId("blk"), starts.toISOString(), ends.toISOString(), reason, nowIso())
    .run();
  return c.redirect("/admin/bookings");
}

export async function deleteBlock(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("DELETE FROM booking_blocks WHERE id = ?").bind(id).run();
  return c.redirect("/admin/bookings");
}

export async function cancelBooking(c: Ctx, id: string): Promise<Response> {
  await c.env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").bind(id).run();
  return c.redirect("/admin/bookings");
}

export async function resendBookingWebhook(c: Ctx, id: string): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();
  if (!row) return c.redirect("/admin/bookings");
  const sent = await pushWebhook(c.env, row);
  await c.env.DB.prepare("UPDATE bookings SET webhook_status = ?, webhook_error = ? WHERE id = ?").bind(sent.status, sent.error, id).run();
  return c.redirect("/admin/bookings");
}
