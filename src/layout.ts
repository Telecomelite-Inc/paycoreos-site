import { canonical, homeJsonLd, robotsFor, type PageSeo } from "./seo";
import { ADDRESS, EMAIL, esc, FOOTER_LINE, PHONE_DISPLAY, PHONE_TEL, SITE_ORIGIN } from "./util";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/book", label: "Book" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/apply", label: "Apply", cta: true },
];

const FOOTER_LINKS = [
  ["/", "Home"],
  ["/call-centers", "Call centers"],
  ["/ecommerce", "eCommerce"],
  ["/retail", "Retail"],
  ["/restaurants", "Restaurants"],
  ["/switching", "Already processing"],
  ["/startups", "New businesses"],
  ["/declined", "Declined by a bank"],
  ["/dispute-defense", "Dispute defense"],
  ["/services", "Services"],
  ["/apply", "Apply"],
  ["/about", "About"],
  ["/book", "Book a time"],
  ["/contact", "Contact"],
  ["/application-fee", "Application fee"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/portal/login", "Merchant sign in"],
];

export function layout(opts: {
  seo: PageSeo;
  hostname: string;
  main: string;
  current?: string;
  alsoEvent?: string;
  jsonLd?: boolean;
  track?: boolean;
  robots?: string;
}): string {
  const robots = opts.robots ?? robotsFor(opts.hostname, opts.seo.path);
  const url = canonical(opts.seo.path);
  const vertical = opts.seo.vertical ? ` data-paycore-vertical="${esc(opts.seo.vertical)}"` : "";
  const also = opts.alsoEvent ? ` data-paycore-also="${esc(opts.alsoEvent)}"` : "";
  const event = opts.track === false ? "" : ` data-paycore-event="page_view"`;
  const ld = opts.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(homeJsonLd()).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.seo.title)}</title>
<meta name="description" content="${esc(opts.seo.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${esc(robots)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PaycoreOS">
<meta property="og:title" content="${esc(opts.seo.title)}">
<meta property="og:description" content="${esc(opts.seo.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_ORIGIN}/assets/logo.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${ld}
</head>
<body data-site="paycoreos" data-fee-payments="off"${event} data-paycore-path="${esc(opts.seo.path)}"${vertical}${also}>
<a class="skip" href="#content">Skip to content</a>
${publicNav(opts.current ?? opts.seo.path)}
<main id="content">
${opts.main}
</main>
${publicFooter(opts.seo.path)}
<script src="/track.js" defer></script>
</body>
</html>`;
}

function publicNav(current: string): string {
  const links = NAV.map((item) => {
    const active = item.href === current ? ' class="active" aria-current="page"' : item.cta ? ' class="ncta"' : "";
    return `<li><a href="${item.href}"${active}>${item.label}</a></li>`;
  }).join("");
  return `<nav>
  <a class="nlogo" href="/">
    <img src="/assets/logo.png" alt="PaycoreOS" width="640" height="239">
    <span class="nslogan"><span>Powerful Operating Support.</span><span>Powerful Growth.</span></span>
  </a>
  <ul class="nl" id="nl">${links}</ul>
  <button class="ntoggle" id="ntoggle" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
</nav>`;
}

function publicFooter(path: string): string {
  const links = FOOTER_LINKS.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  const identity =
    path === "/"
      ? ""
      : `<p class="sf-legal">${FOOTER_LINE}</p>
  <address>
    <span>PaycoreOS, a DBA of Telecom Elite, Inc.</span>
    <span>${ADDRESS}</span>
    <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a>
    <a href="mailto:${EMAIL}">${EMAIL}</a>
  </address>`;
  return `<footer class="site-footer">
  <div class="sf-logo">Paycore<span class="g">OS</span></div>
  <p class="sf-tag">Powerful Operating Support. Powerful Growth.</p>
  ${identity}
  <ul class="sf-links">${links}</ul>
  <p class="sf-copy">© 2026 PaycoreOS / Telecom Elite, Inc.</p>
</footer>`;
}

export function appShell(opts: { title: string; hostname: string; path: string; kind: "portal" | "admin"; body: string }): string {
  const home = opts.kind === "admin" ? "/admin" : "/portal";
  const links =
    opts.kind === "admin"
      ? [
          ["/admin", "Applications"],
          ["/admin/bookings", "Bookings"],
          ["/admin/processors", "Processors"],
          ["/admin/fields", "Fields"],
          ["/admin/statuses", "Statuses"],
          ["/admin/ticket-types", "Ticket types"],
          ["/admin/messages", "Messages"],
          ["/admin/outbox", "Email queue"],
        ]
      : [
          ["/portal", "Applications"],
          ["/", "Public site"],
        ];
  const nav = links
    .map(([href, label]) => `<a href="${href}"${href === opts.path ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="robots" content="${esc(robotsFor(opts.hostname, opts.path))}">
<link rel="icon" href="/assets/logo.png">
<link rel="stylesheet" href="/styles.css">
</head>
<body data-site="paycoreos" data-fee-payments="off" class="app-body">
<header class="app-bar">
  <a class="app-brand" href="${home}">Paycore<span>OS</span> ${opts.kind === "admin" ? "Admin" : "Portal"}</a>
  <nav class="app-nav">${nav}</nav>
  <form method="post" action="${opts.kind === "admin" ? "/admin/logout" : "/portal/logout"}"><button type="submit" class="linkish">Sign out</button></form>
</header>
<main id="content" class="app-main">${opts.body}</main>
</body>
</html>`;
}

export function simplePage(opts: { hostname: string; title: string; h1: string; body: string; path: string; statusNote?: string }): string {
  return layout({
    hostname: opts.hostname,
    seo: { path: opts.path, title: opts.title, description: opts.h1, h1: opts.h1 },
    robots: "noindex, nofollow",
    track: false,
    main: `<article class="prose wrap"><h1>${esc(opts.h1)}</h1>${opts.body}</article>`,
  });
}
