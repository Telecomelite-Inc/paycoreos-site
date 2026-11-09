import { withQuery } from "./attr";
import { pageSeo, type PageSeo } from "./seo";
import { ADDRESS, categoryLabel, EMAIL, esc, feeBox, PHONE_DISPLAY, PHONE_TEL } from "./util";

function offerPage(
  apply: (href: string) => string,
  opts: { h1: string; sub: string; applyHref: string; image: string; alt: string; painTitle: string; pain: string; story: string; boarding?: boolean },
): string {
  const href = esc(opts.applyHref);
  const fee = `<p class="home-fee"><a href="${esc(apply("/application-fee"))}">The application fee is $39.</a></p>`;
  const actions = (callLink: boolean) => `<div class="home-cta">
      <a class="btn-p" href="${href}">Apply</a>
      ${fee}
      ${callLink ? `<p class="home-call"><a href="${esc(apply("/book"))}">Want a read on the file first?</a></p>` : ""}
    </div>`;
  const proof =
    opts.boarding === false
      ? `<p>PaycoreOS is a DBA of Telecom Elite, Inc. The company has done this work since 2013.</p>`
      : `<p>PaycoreOS is a DBA of Telecom Elite, Inc. The company has done this work since 2013.</p>
    <p><strong>98% boarding success across hundreds of applications since 2013.</strong> That figure counts boarding outcomes on applications PaycoreOS handled in that period. It is not a promise that the next application is approved.</p>`;
  return `<header class="land-hero">
    <div class="land-copy">
      <p class="eyebrow">PaycoreOS · since 2013</p>
      <h1>${opts.h1}</h1>
      <p class="land-sub">${opts.sub}</p>
      ${actions(true)}
    </div>
    <figure class="land-figure">
      <img src="${esc(opts.image)}" alt="${esc(opts.alt)}" width="1152" height="864">
    </figure>
  </header>
  <section class="land-proof wrap">${proof}</section>
  <section class="land-pain wrap">
    <h2>${opts.painTitle}</h2>
    ${opts.pain}
  </section>
  <section class="land-steps wrap">
    <h2>How it works</h2>
    <ol class="step-list">
      <li><h3>Tell us how you take payments</h3><p>The form matches the business. You say what you sell and how the card is taken.</p></li>
      <li><h3>We review the file</h3><p>Most underwriting decisions within 24–72 business hours. That is the usual pace. It is not a promise of approval.</p></li>
      <li><h3>We call you</h3><p>PaycoreOS calls to go over the file. The call is about 20 minutes. <a href="${esc(apply("/book"))}">Pick a time</a>.</p></li>
    </ol>
  </section>
  <section class="land-story wrap">${opts.story}</section>
  <section class="land-close wrap">
    <h2>Start the application</h2>
    ${actions(false)}
  </section>`;
}

const TOOLS = `<ul class="plain">
  <li>Visa Order Insight</li>
  <li>Rapid Dispute Resolution</li>
  <li>Cardholder Dispute Resolution Network</li>
  <li>Resolve</li>
  <li>Compelling Evidence 3.0</li>
  <li>Mastercard Ethoca Alerts</li>
  <li>Ethoca Consumer Clarity</li>
</ul>`;

export const CALL_SELLS = [
  ["call-center", "Call center"],
  ["online-store", "Online store"],
  ["retail", "Retail"],
  ["restaurant", "Restaurant"],
  ["dispute-defense", "Dispute defense"],
] as const;

export const CALL_CARD = [
  ["already", "Already take cards"],
  ["declined", "A bank declined them"],
] as const;

export const CONTACT_TOPICS = [
  ["question", "A general question"],
  ["application", "A question about an application"],
  ["merchant", "I am already a merchant"],
  ["call", "Request a call about my file"],
] as const;

export const CALL_VOLUME = [
  ["under-10k", "Under $10,000"],
  ["10k-50k", "$10,000 to $50,000"],
  ["50k-250k", "$50,000 to $250,000"],
  ["over-250k", "Over $250,000"],
  ["not-sure", "Not sure yet"],
] as const;

export function callChoice(list: readonly (readonly [string, string])[], value: string): string | null {
  return list.find(([key]) => key === value)?.[1] ?? null;
}

export function marketingMain(path: string, url: URL, contactReceived: boolean): string | null {
  const apply = (href: string) => withQuery(href, url);
  switch (path) {
    case "/":
      return homePage(apply);
    case "/call-centers":
      return offerPage(apply, {
        h1: "Card-not-present processing for call centers",
        sub: "For a floor that takes the card over the phone, not at a counter.",
        applyHref: apply("/apply?vertical=call-centers"),
        image: "/assets/home/home-call-centers.jpg",
        alt: "Call center agents wearing headsets",
        painTitle: "The card is on the phone",
        pain: `<p>The agent needs a virtual terminal, an invoice, or a payment link while the caller is still on the line. A counter swipe account is the wrong file for that.</p>`,
        story: `<h2>What this application includes</h2>
        <p>Phone acceptance: a virtual terminal, an invoice, a QR code, and payment links. Online checkout can be added if you also run a cart. PaycoreOS resells the Authorize.Net gateway and the NMI gateway. They are gateways, not processors. Choosing one does not tell you which company receives the file.</p>
        <h2>Files the form will not skip</h2>
        <ul class="plain">
          <li>Agreements the call center uses.</li>
          <li>Scripts the agents read.</li>
          <li>Articles of incorporation or organization.</li>
        </ul>
        <h2>Dispute tools you can add</h2>
        ${TOOLS}`,
      });
    case "/ecommerce":
      return offerPage(apply, {
        h1: "Gateway, checkout, and chargeback defense for online stores",
        sub: "For a store that takes the card on the website, and wants a dispute tool before the chargeback.",
        applyHref: apply("/apply?vertical=ecommerce"),
        image: "/assets/home/home-ecommerce.jpg",
        alt: "Boxes packed for an online store",
        painTitle: "Checkout, then the chargeback",
        pain: `<p>The store needs a gateway or hosted checkout, and a way to answer an order the cardholder does not recognize. Recurring billing is on the same form if you bill again.</p>`,
        story: `<h2>The gateway</h2>
        <p>PaycoreOS resells the Authorize.Net gateway and the NMI gateway. A gateway sends the payment. It is not a processor, and choosing one does not tell you which company receives the file.</p>
        <p>The form also asks about the cart, a virtual terminal, invoices, and the website. If most sales are not in person, it asks for a login so the review can see the store.</p>
        <h2>Dispute tools</h2>
        ${TOOLS}`,
      });
    case "/retail":
      return offerPage(apply, {
        h1: "In-person processing and POS for retail",
        sub: "For a counter, a handheld, or tap to pay on the floor.",
        applyHref: apply("/apply?vertical=retail"),
        image: "/assets/home/home-retail.jpg",
        alt: "Retail counter with folded goods and a card reader",
        painTitle: "The line at the counter",
        pain: `<p>The card is taken where the goods are. A counter terminal, a handheld, or tap to pay on a phone. Phone or online can be added if you also sell that way.</p>`,
        story: `<h2>What you can ask for</h2>
        <p>In-person cards. Bank payments if you want them. EBT, and an FNS number if you take EBT.</p>
        <p>A Clover terminal you already own can be connected. PaycoreOS does not ship a new Clover unit. The portal shows the choice you made, such as handheld or counter. It does not name a supplier.</p>`,
      });
    case "/restaurants":
      return offerPage(apply, {
        h1: "Restaurant processing and handheld checkout",
        sub: "For a table or a counter, where the card is taken next to the guest.",
        applyHref: apply("/apply?vertical=restaurants"),
        image: "/assets/home/home-restaurants.jpg",
        alt: "Server holding a handheld card reader in a restaurant",
        painTitle: "Checkout where the guest is sitting",
        pain: `<p>A handheld at the table, or a terminal at the counter. The same application as every other business. You say how the card is taken.</p>`,
        story: `<h2>At the table or the counter</h2>
        <p>A handheld, a counter terminal, or tap to pay. A Clover terminal you already own can be connected. PaycoreOS does not ship a new Clover unit. If you take EBT, the form asks for the FNS number.</p>`,
      });
    case "/switching":
      return offerPage(apply, {
        h1: "Already processing? Bring your statement.",
        sub: "For a call center, online store, retailer, or restaurant that already accepts cards.",
        applyHref: apply("/apply?buyer=existing"),
        image: "/assets/home/home-take-payment.jpg",
        alt: "Hand tapping a card on an unbranded reader",
        painTitle: "The statement is the file",
        pain: `<p>Bring the processing statement with the application. PaycoreOS reads it with the rest of the file. This page does not quote a processing rate.</p>`,
        story: `<h2>Choose the business</h2>
        <div class="card-grid">
          ${["call-centers", "ecommerce", "retail", "restaurants"]
            .map((value) => `<a class="card" href="${esc(apply(`/apply?vertical=${value}&buyer=existing`))}"><h3>${categoryLabel(value)}</h3><p>I already accept cards.</p></a>`)
            .join("")}
        </div>`,
      });
    case "/declined":
      return offerPage(apply, {
        h1: "Declined by a big bank?",
        sub: "PaycoreOS still submits the application. Most underwriting decisions within 24–72 business hours. That is not a promise of approval.",
        applyHref: apply("/apply?declined=1"),
        image: "/assets/home/home-declined.jpg",
        alt: "Shop owner holding a plain envelope",
        painTitle: "The bank said no",
        pain: `<p>A decline from a big bank does not close the PaycoreOS application. You still choose the business. The form asks which bank, and you may upload the notice. The notice is optional. That is not a promise of approval.</p>`,
        story: `<h2 id="business">Choose the business</h2>
        <p>The application is still for a call center, an online store, retail, a restaurant, or dispute defense.</p>
        <div class="card-grid">
          <a class="card" href="${esc(apply("/apply?vertical=call-centers&declined=1"))}"><h3>Call center</h3><p>Card-not-present processing.</p></a>
          <a class="card" href="${esc(apply("/apply?vertical=ecommerce&declined=1"))}"><h3>Online store</h3><p>Gateway and checkout.</p></a>
          <a class="card" href="${esc(apply("/apply?vertical=retail&declined=1"))}"><h3>Retail</h3><p>In-person processing and POS.</p></a>
          <a class="card" href="${esc(apply("/apply?vertical=restaurants&declined=1"))}"><h3>Restaurant</h3><p>Restaurant processing and handheld checkout.</p></a>
          <a class="card" href="${esc(apply("/apply?category=dispute-defense&declined=1"))}"><h3>Dispute defense</h3><p>For a business that already accepts cards. This does not open a processing account.</p></a>
        </div>`,
      });
    case "/startups":
      return offerPage(apply, {
        h1: "First merchant account for a new business",
        sub: "For a call center, online store, retailer, or restaurant that has not taken cards yet.",
        applyHref: apply("/apply?buyer=first"),
        image: "/assets/home/home-pos.jpg",
        alt: "Unbranded counter terminal and handheld reader",
        painTitle: "No processing statements yet",
        pain: `<p>A first account still needs a legal entity, a business bank account, and an owner ID. You do not need card statements if you have never accepted cards. The fee is not an approval.</p>`,
        story: `<h2>Before you start</h2>
        <ul class="plain">
          <li>A legal entity.</li>
          <li>A business bank account.</li>
          <li>An owner ID.</li>
        </ul>
        <p>Bank statements, formation papers, a photo ID, and a voided check or bank letter are on the form.</p>
        <div class="card-grid">
          ${["call-centers", "ecommerce", "retail", "restaurants"]
            .map((value) => `<a class="card" href="${esc(apply(`/apply?vertical=${value}&buyer=first`))}"><h3>${categoryLabel(value)}</h3><p>This is my first merchant account.</p></a>`)
            .join("")}
        </div>`,
      });
    case "/dispute-defense":
      return offerPage(apply, {
        h1: "Dispute defense for businesses that already accept cards",
        sub: "For a business that already accepts cards and wants Visa and Mastercard dispute tools. This does not open a new processing account.",
        applyHref: apply("/apply?category=dispute-defense"),
        image: "/assets/home/home-dispute.jpg",
        alt: "Business owner reviewing dispute paperwork",
        painTitle: "The chargeback on cards you already take",
        pain: `<p>This file is for dispute tools on the account you already have. It asks for the MID and the CAID. It does not open a processing account, and it does not tell you which company enrolls the tools.</p>`,
        story: `<h2>What the form asks</h2>
        <ul class="plain">
          <li>Legal business name, contact, phone, email, and business address.</li>
          <li>Confirmation that you already accept cards.</li>
          <li>Your current processor and the descriptor customers see.</li>
          <li>Your merchant ID (MID) and card acceptor ID (CAID).</li>
          <li>Your website.</li>
          <li>Which tools you want.</li>
          <li>Processing statements or chargeback reports, if you have them. Those files are optional.</li>
        </ul>
        <h2>Tools</h2>
        ${TOOLS}
        <p>If the business is also a call center, the form requires agreements, scripts, and articles of incorporation or organization. A processing application is not on this form. After you enroll, the merchant portal can offer one. You do not have to take it.</p>`,
        boarding: false,
      });
    case "/services":
      return `<header class="hero">
        <p class="eyebrow">PaycoreOS · a DBA of Telecom Elite, Inc.</p>
        <h1>Merchant processing, gateways, point of sale, and dispute defense</h1>
        <p class="lede">Capabilities only. We match the account, the gateway or terminal, and dispute defense to the way you take payments. We do not publish a processing rate.</p>
        <div class="hero-actions"><a class="btn-p" href="${esc(apply("/apply"))}">Apply</a></div>
        <p class="home-call"><a href="${esc(apply("/book"))}">Want a read on the file first?</a></p>
      </header>
      <section class="wrap">
        <h2>Take the payment</h2>
        <p>Card payments in person, online, and by phone. Bank payments (ACH). A virtual terminal. A payment gateway and hosted checkout. Payment links.</p>
        <h2>Authorize.Net gateway and NMI gateway</h2>
        <p>PaycoreOS offers both gateways and is a reseller of both. They are for call centers and online stores, where a gateway is the product. A gateway is not a processor. Choosing Authorize.Net or NMI does not name the company that receives your application. We do not tell you which company that is.</p>
        <h2>Bill again</h2>
        <p>Invoices by email or text. Recurring and subscription billing. Card on file.</p>
        <h2>In person</h2>
        <p>Counter terminal, handheld terminal, and tap to pay on a phone. A Clover terminal the business already owns can be connected. PaycoreOS does not ship a new Clover unit.</p>
        <h2>Dispute defense</h2>
        <p>Dispute defense is its own service for a business that already accepts cards. It is not a substitute for a processing application, and it does not open one.</p>
        ${TOOLS}
        <p><a href="${esc(apply("/dispute-defense"))}">Dispute defense for businesses that already accept cards</a></p>
        <h2>Pricing programs</h2>
        <p>Surcharging and dual pricing are programs a business can ask about. No percent is quoted here.</p>
        ${feeBox()}
      </section>`;
    case "/about":
      return `<article class="wrap prose">
        <p class="eyebrow">PaycoreOS · Telecom Elite, Inc.</p>
        <h1>About PaycoreOS</h1>
        <p>PaycoreOS is a DBA of Telecom Elite, Inc. The company has been at this since 2013. The work is the same shape it has always been: get the account approved, then defend it so the account stays open.</p>
        <p><strong>98% boarding success across hundreds of applications since 2013.</strong> That figure counts boarding outcomes on applications PaycoreOS handled in that period. It is not a promise that the next application is approved.</p>
        <p>Most files get an underwriting answer within 24 to 72 business hours. That is the usual pace. It is not a promise that yours will, and it is not a promise that the answer will be yes.</p>
        <p>For phone payments and online checkout, PaycoreOS resells the Authorize.Net gateway and the NMI gateway. Those are gateways, not the company that underwrites the account.</p>
        <p>There is no one-size-fits-all account. The form asks how you take payments. A person submits the file. The merchant portal never names the company that received it.</p>
        <h2>Office</h2>
        <p>PaycoreOS, a DBA of Telecom Elite, Inc.<br>${ADDRESS}<br><a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a><br><a href="mailto:${EMAIL}">${EMAIL}</a></p>
        <p><a class="btn-p" href="${esc(apply("/apply"))}">Apply</a> <a class="btn-s" href="${esc(apply("/book"))}">Book a time</a></p>
      </article>`;
    case "/contact":
      return contactMain(url, { received: contactReceived });
    case "/application-fee":
      return `<article class="wrap prose">
        <h1>The $39 application fee</h1>
        <p>The fee is $39. It is the same for call centers, online stores, retail, restaurants, businesses that already process, new businesses, and dispute defense.</p>
        ${feeBox()}
        <h2>When it is charged</h2>
        <p>After the form is complete, and only after you have seen the fee language. Not before the form. The pay button on the application is off. If you do not see a way to pay, we are not charging you. The fee is not collected until the fee account is ready.</p>
        <h2>When it is not refunded</h2>
        <ul>
          <li>You are declined.</li>
          <li>You stop responding.</li>
          <li>You cancel after we are able to submit the application.</li>
          <li>We ask for a document or an answer we need in order to review or submit, and you do not provide it.</li>
        </ul>
        <p>Not sending that document or answer is the same as stopping. If we make the request and you do not respond for 10 business days, that counts as you stopping, and the fee is not refunded.</p>
        <h2>When it is refunded</h2>
        <p>Only when we cannot submit for a reason on our side. We make that refund within 10 business days after it is clear we cannot submit. A decline is not a refund.</p>
        <p>The full terms are on the <a href="/terms">terms page</a>. Customer payments for your business are not taken through this fee.</p>
        <p><a class="btn-p" href="${esc(apply("/apply"))}">Apply</a></p>
        <p><a href="${esc(apply("/contact"))}">Questions about the fee?</a> <a href="${esc(apply("/book"))}">Book a time</a> if you want to talk it through.</p>
      </article>`;
    default:
      return null;
  }
}

function pathCard(href: string, src: string, alt: string, title: string, benefit: string): string {
  return `<a class="path-card" href="${esc(href)}">
    <img src="${esc(src)}" alt="${esc(alt)}" width="1152" height="864">
    <h3>${esc(title)}</h3>
    <p>${esc(benefit)}</p>
  </a>`;
}

function productBlock(src: string, alt: string, title: string, href: string, copy: string): string {
  return `<article class="product">
    <img src="${esc(src)}" alt="${esc(alt)}" width="1152" height="864">
    <div>
      <h3><a href="${esc(href)}">${esc(title)}</a></h3>
      <p>${esc(copy)}</p>
    </div>
  </article>`;
}

function homePage(apply: (href: string) => string): string {
  return `<header class="home-hero">
    <div class="home-hero-copy">
      <p class="eyebrow">Merchant processing</p>
      <h1>Processing, point of sale, and dispute defense.</h1>
      <p class="home-sub">For call centers, online stores, retailers, and restaurants. Already processing, just starting, or declined by a big bank.</p>
      <div class="home-cta">
        <a class="btn-p" href="${esc(apply("/apply"))}">Apply</a>
        <p class="home-fee">The application fee is $39.</p>
        <p class="home-call"><a href="${esc(apply("/book"))}">Want a read on the file first?</a></p>
      </div>
    </div>
    <figure class="home-hero-figure">
      <img src="/assets/home/home-hero.jpg" alt="A merchant at a counter taking a card payment with a handheld reader" width="1152" height="864">
    </figure>
  </header>
  <section class="home-section">
    <h2>Choose the business</h2>
    <div class="path-grid">
      ${pathCard(apply("/call-centers"), "/assets/home/home-call-centers.jpg", "Call center agents wearing headsets", "Call centers", "Take card payments over the phone, with a virtual terminal and invoicing.")}
      ${pathCard(apply("/ecommerce"), "/assets/home/home-ecommerce.jpg", "Boxes packed for an online store", "Online stores", "Add a gateway, checkout, and chargeback defense for the store.")}
      ${pathCard(apply("/retail"), "/assets/home/home-retail.jpg", "Retail counter with folded goods and a card reader", "Retail", "Take cards at the counter, on a handheld, or with tap to pay.")}
      ${pathCard(apply("/restaurants"), "/assets/home/home-restaurants.jpg", "Server holding a handheld card reader in a restaurant", "Restaurants", "Check out at the table or the counter with a handheld.")}
      ${pathCard(apply("/dispute-defense"), "/assets/home/home-dispute.jpg", "Business owner reviewing dispute paperwork", "Dispute defense", "For a business that already accepts cards and wants dispute tools.")}
      ${pathCard(apply("/declined"), "/assets/home/home-declined.jpg", "Shop owner holding a plain envelope", "Declined by a big bank", "A bank decline does not stop the PaycoreOS application.")}
    </div>
    <p class="home-also">Already processing? <a href="${esc(apply("/switching"))}">Bring your statement.</a> New business? <a href="${esc(apply("/startups"))}">Open a first merchant account.</a></p>
  </section>
  <section class="home-section home-products">
    <h2>What you can add</h2>
    <div class="product-list">
      ${productBlock("/assets/home/home-take-payment.jpg", "Hand tapping a card on an unbranded reader", "Take the payment", apply("/services"), "Cards in person, online, and by phone. Bank payments, a virtual terminal, and payment links.")}
      ${productBlock("/assets/home/home-bill-again.jpg", "Merchant sending an invoice from a phone", "Bill again", apply("/services"), "Send an invoice by email or text, bill on a schedule, and keep a card on file.")}
      ${productBlock("/assets/home/home-pos.jpg", "Unbranded counter terminal and handheld reader", "In-person point of sale", apply("/retail"), "A counter terminal, a handheld, or tap to pay on a phone. A Clover terminal you already own can be connected.")}
      ${productBlock("/assets/home/home-dispute.jpg", "Business owner reviewing dispute paperwork", "Dispute defense", apply("/dispute-defense"), "Visa and Mastercard dispute tools for a business that already accepts cards. This does not open a new processing account.")}
      ${productBlock("/assets/home/home-gateways.jpg", "Person shopping on a laptop beside a bag", "Authorize.Net and NMI", apply("/services"), "PaycoreOS resells the Authorize.Net gateway and the NMI gateway for checkout and hosted payments.")}
    </div>
  </section>`;
}

function options(list: readonly (readonly [string, string])[], selected: string): string {
  return list
    .map(([key, label]) => `<option value="${esc(key)}"${key === selected ? " selected" : ""}>${esc(label)}</option>`)
    .join("");
}

export function contactMain(
  url: URL,
  state: { received?: boolean; booked?: boolean; errors?: string[]; values?: Record<string, string> },
): string {
  const values = state.values || {};
  const showCall = values.topic === "call";
  const errors = state.errors?.length
    ? `<div class="errors" role="alert"><p>Fix the form before it can be sent.</p><ul>${state.errors.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`
    : "";
  const booked = url.searchParams.get("booked") === "1" || state.booked;
  const received = state.received
    ? '<p class="ok" role="status">We saved your message. Email from this site is not being sent yet. If you need an answer now, call (407) 270-2502.</p>'
    : "";
  const bookedNote = booked ? '<p class="ok" role="status">PaycoreOS will call. The call is about 20 minutes.</p>' : "";
  return `<article class="wrap">
    <header class="page-head"><h1>Contact PaycoreOS</h1>
    <p class="lede">Send one message. Choose a reason. If you want PaycoreOS to call about the file, pick that reason. To choose the time yourself, book an appointment.</p></header>
    ${received}
    ${bookedNote}
    ${errors}
    <form id="contact-form" class="stack-form" method="post" action="/contact">
      <label>Name<input name="name" required autocomplete="name" value="${esc(values.name || "")}"></label>
      <label>Email<input name="email" type="email" required autocomplete="email" value="${esc(values.email || "")}"></label>
      <label>Phone<input name="phone" type="tel" autocomplete="tel" value="${esc(values.phone || "")}"${showCall ? " required" : ""}></label>
      <label>Reason
        <select name="topic" required>
          <option value="">Choose</option>
          ${options(CONTACT_TOPICS, values.topic || "")}
        </select>
      </label>
      <fieldset id="call-fields" class="call-fields"${showCall ? "" : " hidden"}>
        <label>What do you sell?
          <select name="sells"${showCall ? " required" : ""}>
            <option value="">Choose</option>
            ${options(CALL_SELLS, values.sells || "")}
          </select>
        </label>
        <label>Already taking cards, or did a bank decline the file?
          <select name="card_status"${showCall ? " required" : ""}>
            <option value="">Choose</option>
            ${options(CALL_CARD, values.card_status || "")}
          </select>
        </label>
        <label>Rough monthly card volume
          <select name="monthly_volume"${showCall ? " required" : ""}>
            <option value="">Choose</option>
            ${options(CALL_VOLUME, values.monthly_volume || "")}
          </select>
        </label>
      </fieldset>
      <label>Message<span class="help">Required unless you are requesting a call.</span><textarea name="message"${showCall ? "" : " required"}>${esc(values.message || "")}</textarea></label>
      <button class="btn-p" type="submit">${showCall ? "Request a call" : "Send message"}</button>
    </form>
    <section id="book" class="call-form">
      <h2>Want a set time?</h2>
      <p>Book an appointment and PaycoreOS will call at that time. The call is about 20 minutes.</p>
      <p><a class="btn-s" href="/book">Book a time</a></p>
    </section>
    <div class="contact-facts">
      <p><span class="k">Phone</span><br><a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a></p>
      <p><span class="k">Email</span><br><a href="mailto:${EMAIL}">${EMAIL}</a></p>
      <p><span class="k">Address</span><br>PaycoreOS, a DBA of Telecom Elite, Inc.<br>${ADDRESS}</p>
    </div>
    <script src="/contact.js" defer></script>
  </article>`;
}

export function seoOrThrow(path: string): PageSeo {
  const seo = pageSeo(path);
  if (!seo) throw new Error(`missing seo for ${path}`);
  return seo;
}
