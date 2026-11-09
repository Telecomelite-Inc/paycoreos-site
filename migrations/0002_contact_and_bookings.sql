-- Booking tables and contact-form columns.
-- Not applied to production by this change. Apply locally with:
--   npx wrangler d1 migrations apply paycoreos --local
-- The worker also adds these objects on boot if they are missing.

ALTER TABLE contact_messages ADD COLUMN topic TEXT NOT NULL DEFAULT '';
ALTER TABLE call_requests ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS booking_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_windows (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS booking_blocks (
  id TEXT PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  tcpa_consent INTEGER NOT NULL DEFAULT 0,
  tcpa_consent_text TEXT NOT NULL DEFAULT '',
  recording_consent INTEGER NOT NULL DEFAULT 0,
  recording_notice TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  webhook_status TEXT NOT NULL DEFAULT 'disabled',
  webhook_payload TEXT NOT NULL DEFAULT '',
  webhook_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_open_slot ON bookings(starts_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_bookings_starts ON bookings(starts_at);
