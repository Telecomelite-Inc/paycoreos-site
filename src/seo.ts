import { ADDRESS, COMPANY, EMAIL, FEE_DISCLOSURE, PHONE_DISPLAY, SITE_ORIGIN, STREET, LOCALITY } from "./util";

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  h1: string;
  vertical?: string;
};

export const PAGES: PageSeo[] = [
  {
    path: "/",
    title: "PaycoreOS | Processing, point of sale, and dispute defense",
    description:
      "Processing, point of sale, and dispute defense for call centers, online stores, retailers, and restaurants. Already processing, a new business, or declined by a big bank. The application fee is $39.",
    h1: "Processing, point of sale, and dispute defense.",
  },
  {
    path: "/call-centers",
    title: "Card-not-present processing for call centers | PaycoreOS",
    description:
      "Card-not-present processing for call centers, with a virtual terminal, invoicing, and the Authorize.Net and NMI gateways. The application fee is $39, after the form.",
    h1: "Card-not-present processing for call centers",
    vertical: "call-centers",
  },
  {
    path: "/ecommerce",
    title: "Gateway, checkout, and chargeback defense for online stores | PaycoreOS",
    description:
      "Gateway, checkout, and chargeback defense for online stores, including the Authorize.Net and NMI gateways. The application fee is $39, after the form.",
    h1: "Gateway, checkout, and chargeback defense for online stores",
    vertical: "ecommerce",
  },
  {
    path: "/retail",
    title: "In-person processing and POS for retail | PaycoreOS",
    description:
      "In-person processing and point of sale for retail: a counter terminal, a handheld, or tap to pay. The application fee is $39, after the form.",
    h1: "In-person processing and POS for retail",
    vertical: "retail",
  },
  {
    path: "/restaurants",
    title: "Restaurant processing and handheld checkout | PaycoreOS",
    description:
      "Restaurant processing and handheld checkout, at the table or the counter. The application fee is $39, after the form.",
    h1: "Restaurant processing and handheld checkout",
    vertical: "restaurants",
  },
  {
    path: "/switching",
    title: "Already processing? Bring your statement. | PaycoreOS",
    description:
      "Already processing? Bring your statement. PaycoreOS reviews call centers, online stores, retailers, and restaurants. The application fee is $39.",
    h1: "Already processing? Bring your statement.",
  },
  {
    path: "/startups",
    title: "First merchant account for a new business | PaycoreOS",
    description:
      "First merchant account for a new business. You need a legal entity, a business bank account, and an owner ID. The $39 fee is not an approval.",
    h1: "First merchant account for a new business",
  },
  {
    path: "/declined",
    title: "Declined by a big bank? | PaycoreOS",
    description:
      "PaycoreOS still submits the application after a bank decline. Most underwriting decisions within 24–72 business hours. That is not a promise of approval. The application fee is $39.",
    h1: "Declined by a big bank?",
  },
  {
    path: "/dispute-defense",
    title: "Dispute defense for businesses that already accept cards | PaycoreOS",
    description:
      "Dispute defense for businesses that already accept cards. Visa and Mastercard tools, with your MID and CAID. The application fee is $39. This does not open a new processing account.",
    h1: "Dispute defense for businesses that already accept cards",
    vertical: "dispute-defense",
  },
  {
    path: "/services",
    title: "Services | PaycoreOS",
    description:
      "Merchant processing, the Authorize.Net and NMI gateways, point of sale, invoicing, and Visa and Mastercard dispute defense from PaycoreOS.",
    h1: "Merchant processing, gateways, point of sale, and dispute defense",
  },
  {
    path: "/apply",
    title: "Apply | PaycoreOS",
    description:
      "Apply to PaycoreOS for call centers, eCommerce, retail, restaurants, or dispute defense. The $39 fee comes after the form and is not collected yet.",
    h1: "Apply to PaycoreOS",
  },
  {
    path: "/about",
    title: "About PaycoreOS | Telecom Elite, Inc. since 2013",
    description:
      "PaycoreOS is a DBA of Telecom Elite, Inc. Since 2013, 98% boarding success across hundreds of applications.",
    h1: "About PaycoreOS",
  },
  {
    path: "/contact",
    title: "Contact PaycoreOS",
    description: `Call PaycoreOS at ${PHONE_DISPLAY}, email ${EMAIL}, or write to ${ADDRESS}.`,
    h1: "Contact PaycoreOS",
  },
  {
    path: "/book",
    title: "Book a time | PaycoreOS",
    description:
      "Book a time for a PaycoreOS call. Pick an open slot. The call is about 20 minutes. The $39 application fee is not charged on this page.",
    h1: "Book a time with PaycoreOS",
  },
  {
    path: "/privacy",
    title: "Privacy policy | PaycoreOS",
    description:
      "Privacy policy for PaycoreOS, a DBA of Telecom Elite, Inc. What an application collects, what is not uploaded to ad networks, and how to reach us.",
    h1: "Privacy policy",
  },
  {
    path: "/terms",
    title: "Terms of use | PaycoreOS",
    description: "Terms for the PaycoreOS website, the application, the $39 fee, the refund rule, and the merchant portal.",
    h1: "Terms of use",
  },
  {
    path: "/application-fee",
    title: "$39 application fee | PaycoreOS",
    description:
      "PaycoreOS charges a $39 application fee after the form. It is not collected until the fee account is ready. The refund rule is on this page.",
    h1: "The $39 application fee",
  },
];

export function pageSeo(path: string): PageSeo | undefined {
  return PAGES.find((p) => p.path === path);
}

export function canonical(path: string): string {
  if (path === "/") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${path}`;
}

export function robotsFor(hostname: string, path: string): string {
  if (
    path === "/thank-you" ||
    path.startsWith("/admin") ||
    path.startsWith("/portal") ||
    path.startsWith("/apply/fee")
  ) {
    return "noindex, nofollow";
  }
  if (hostname !== "paycoreos.com" && hostname !== "www.paycoreos.com") return "noindex, nofollow";
  return "index, follow";
}

export function sitemapXml(): string {
  const urls = PAGES.map(
    (p) => `  <url><loc>${canonical(p.path)}</loc><lastmod>2026-10-23</lastmod></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  const agents = ["Googlebot", "Bingbot", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "*"];
  const blocks = agents
    .map(
      (agent) => `User-agent: ${agent}
Allow: /
Disallow: /thank-you
Disallow: /admin
Disallow: /portal`,
    )
    .join("\n\n");
  return `${blocks}\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function llmsTxt(): string {
  return `# PaycoreOS

> ${COMPANY}. PaycoreOS places call centers, online stores, retailers, and restaurants into merchant processing, point of sale, and Visa and Mastercard dispute defense. One application. The form matches the business. A real person submits it.

PaycoreOS has done this work since 2013. The application fee is $39. It is charged only after the form, and it is not collected until the fee account is ready. PaycoreOS does not publish a processing rate.

## Who it is for

Business owners who need a merchant account approved and then kept in good standing, and businesses that already accept cards and want dispute defense only. The processing categories are call centers, eCommerce, retail, and restaurants. A new business needs a legal entity, a business bank account, and an owner ID. Dispute defense is its own service for a business that already accepts cards. It does not open a new processing account.

## Services

- Merchant processing for call centers, online stores, retail, and restaurants
- Payment gateway and hosted checkout. PaycoreOS is a reseller of the Authorize.Net gateway and the NMI gateway. Those are gateways, not processors.
- Virtual terminal, payment links, invoicing by email or text, and recurring billing
- Point of sale: counter terminal, handheld terminal, and tap to pay on a phone. A Clover terminal the business already owns can be connected. PaycoreOS does not ship a new Clover unit.
- Dispute defense for businesses that already accept cards: Visa Order Insight, Rapid Dispute Resolution, the Cardholder Dispute Resolution Network, Resolve, and Compelling Evidence 3.0; Mastercard Ethoca Alerts and Ethoca Consumer Clarity. Enrollment asks for the current processor, descriptor, website, merchant ID (MID), and card acceptor ID (CAID).
- Surcharging and dual pricing as programs a business can ask about
- Applications after a bank decline. PaycoreOS still submits the application. Most underwriting decisions within 24–72 business hours. That is not a promise of approval. The merchant names the bank. A decline notice is optional. PaycoreOS does not tell the merchant which company receives the file.

## Fee

${FEE_DISCLOSURE}

The fee is not collected until the fee account is ready.

## Contact

${COMPANY}
${STREET}
${LOCALITY}
${PHONE_DISPLAY}
${EMAIL}

## Pages

- [Home](${SITE_ORIGIN}/): Processing, point of sale, and dispute defense
- [Call centers](${SITE_ORIGIN}/call-centers): Card-not-present processing for call centers
- [eCommerce](${SITE_ORIGIN}/ecommerce): Gateway, checkout, and chargeback defense for online stores
- [Retail](${SITE_ORIGIN}/retail): In-person processing and POS for retail
- [Restaurants](${SITE_ORIGIN}/restaurants): Restaurant processing and handheld checkout
- [Already processing](${SITE_ORIGIN}/switching): Already processing? Bring your statement.
- [New businesses](${SITE_ORIGIN}/startups): First merchant account for a new business
- [Declined by a bank](${SITE_ORIGIN}/declined): Declined by a big bank? PaycoreOS still submits the application.
- [Dispute defense](${SITE_ORIGIN}/dispute-defense): Dispute defense for businesses that already accept cards
- [Services](${SITE_ORIGIN}/services): Capabilities, gateways, and dispute defense
- [Apply](${SITE_ORIGIN}/apply): The application
- [About](${SITE_ORIGIN}/about): Telecom Elite, Inc., since 2013
- [Book a time](${SITE_ORIGIN}/book): Pick an open time for a call
- [Contact](${SITE_ORIGIN}/contact): One contact form, plus phone, email, and address
- [Application fee](${SITE_ORIGIN}/application-fee): The $39 fee and the refund rule
- [Privacy](${SITE_ORIGIN}/privacy): Privacy policy
- [Terms](${SITE_ORIGIN}/terms): Terms of use
`;
}

export function homeJsonLd(): unknown {
  const service = (name: string, url: string, description: string) => ({
    "@type": "Service",
    name,
    url,
    description,
    provider: { "@type": "Organization", name: "PaycoreOS" },
  });
  const items = [
    service("Merchant processing", `${SITE_ORIGIN}/`, "Merchant processing for call centers, online stores, retailers, and restaurants."),
    service("Call center processing", `${SITE_ORIGIN}/call-centers`, "Card-not-present processing for call centers."),
    service("eCommerce processing", `${SITE_ORIGIN}/ecommerce`, "Gateway, checkout, and chargeback defense for online stores."),
    service("Retail point of sale", `${SITE_ORIGIN}/retail`, "In-person processing and point of sale for retail."),
    service("Restaurant processing", `${SITE_ORIGIN}/restaurants`, "Restaurant processing and handheld checkout."),
    service("Authorize.Net gateway", `${SITE_ORIGIN}/services`, "Payment gateway. PaycoreOS is a reseller. This is a gateway, not a processor."),
    service("NMI gateway", `${SITE_ORIGIN}/services`, "Payment gateway. PaycoreOS is a reseller. This is a gateway, not a processor."),
    service("Virtual terminal", `${SITE_ORIGIN}/services`, "Virtual terminal for phone and invoice payments."),
    service("Invoicing and recurring billing", `${SITE_ORIGIN}/services`, "Invoices by email or text, and recurring billing."),
    service("Dispute defense", `${SITE_ORIGIN}/dispute-defense`, "Visa and Mastercard dispute defense for a business that already accepts cards."),
    service(
      "Applications after a bank decline",
      `${SITE_ORIGIN}/declined`,
      "PaycoreOS still submits the application after a bank decline. Most underwriting decisions within 24–72 business hours. That is not a promise of approval.",
    ),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "PaycoreOS",
    legalName: "Telecom Elite, Inc.",
    url: `${SITE_ORIGIN}/`,
    telephone: "+1-407-270-2502",
    email: EMAIL,
    image: `${SITE_ORIGIN}/assets/logo.png`,
    description:
      "PaycoreOS, a DBA of Telecom Elite, Inc., places call centers, online stores, retailers, and restaurants into merchant processing, point of sale, and Visa and Mastercard dispute defense.",
    address: {
      "@type": "PostalAddress",
      streetAddress: STREET,
      addressLocality: "Oviedo",
      addressRegion: "FL",
      postalCode: "32765",
      addressCountry: "US",
    },
    parentOrganization: {
      "@type": "Organization",
      name: "Telecom Elite, Inc.",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "PaycoreOS services",
      itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })),
    },
  };
}
