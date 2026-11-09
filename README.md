# PaycoreOS

Public site, merchant portal, and admin for PaycoreOS, a DBA of Telecom Elite, Inc. The app is a Cloudflare Worker with static assets, D1, and R2.

The $39 application fee is disclosed on the site. The pay button is off until `FEE_PAYMENTS_ENABLED` is set to `true`. There is no Stripe call in this repo.

## Local

```bash
npm install
cp .dev.vars.example .dev.vars
# Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters). Do not commit .dev.vars.
npx wrangler d1 migrations apply paycoreos --local
npx wrangler dev
```

The first request creates the admin user from those two variables if no admin exists yet.

## Secrets

Set these in Cloudflare with `wrangler secret put`. Do not commit the values.

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

`FEE_PAYMENTS_ENABLED` stays `false` in `wrangler.toml` until a fee account is ready.

The booking webhook is off until three things exist. None of them are in this repo:

- An https endpoint on the CRM that accepts `POST` JSON (`booking.created`).
- Worker secret `BOOKING_WEBHOOK_SECRET`, the HMAC key. Set it with `wrangler secret put`. Do not commit it.
- The URL saved in Admin → Bookings, and the send box checked.

## Contact and appointments

`/contact` is one form. The reason "Request a call about my file" still stores a `call_requests` row (what you sell, card status, monthly volume, and any note) and shows it under Admin → Messages. Other reasons store `contact_messages` with the reason. `POST /contact/call` still accepts the older call-request fields.

`/book` lists open times from weekly hours in D1. The first saved hours are Monday–Friday, 9:00 a.m.–5:00 p.m. America/New_York, 30-minute slots, four hours of notice, and 14 days ahead. Change them in Admin → Bookings. Those hours are a starting point, not a confirmed calendar.

There is no Twilio client and no CRM client in this repo. Processor rows have an `api_credentials` column for merchant-account providers, not for voice. The connection point is the webhook above. It stays off, and the booking is still saved, when the URL or the secret is missing. Header `X-Paycore-Event` is `booking.created`. Header `X-Paycore-Signature` is `sha256=` plus HMAC-SHA256 hex of the raw body. `tcpa_consent` and `recording_consent` are true only when the visitor checked the box. The text fields are the words shown on the page. Cancelling a booking does not send another event. A failed POST does not undo the booking.

`/thank-you` confirms a message, a call request, or an appointment. It is not a payment page. The $39 fee is not collected there.

`migrations/0002_contact_and_bookings.sql` adds the booking tables and the `topic` and `notes` columns. It was not applied to production. Apply it locally only:

```bash
npx wrangler d1 migrations apply paycoreos --local
```

The worker also creates these tables on boot if they are missing. Do not run the migration against production as part of this change.
