export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  FEE_PAYMENTS_ENABLED: string;
  SITE_ORIGIN: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  BOOKING_WEBHOOK_SECRET?: string;
}

export type Role = "admin" | "merchant";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  name: string;
};

export type Attr = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  li_fat_id?: string;
  first_landing_path?: string;
  first_vertical?: string;
  first_buyer_type?: string;
};

export const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "li_fat_id",
] as const;

export type AttrKey = (typeof ATTR_KEYS)[number];
