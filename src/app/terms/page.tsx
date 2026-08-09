import type { Metadata } from "next";

import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using Yamzo Uttara online ordering and order tracking.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Website terms" summary="These terms cover Yamzo Uttara's online menu, ordering, account, and tracking services.">
      <section><h2>Ordering</h2><p>An order is a request until the Yamzo team accepts it. Items, prices, delivery coverage, minimum order value, preparation time, and opening hours may change. The final server-calculated total shown for an accepted order controls over a stale browser display.</p></section>
      <section><h2>Accurate details</h2><p>Please provide a reachable Bangladesh phone number and a complete Uttara address. Yamzo may reject or cancel an order when details cannot be confirmed, an item is unavailable, the address is outside current delivery coverage, or a request appears fraudulent or abusive.</p></section>
      <section><h2>Test mode</h2><p>Orders clearly marked as test orders are for approved staff testing only. They are not customer purchases and are excluded from live revenue and inventory reporting. Like all website orders, they are retained operational records and may be cancelled but not permanently deleted.</p></section>
      <section><h2>Accounts and tracking</h2><p>You are responsible for protecting access to your email account, signed-in session, and guest tracking key. Do not attempt to access another customer&apos;s order or interfere with the website, point-of-sale system, or service providers.</p></section>
      <section><h2>Google Maps content</h2><p>Google Maps ratings and reviews remain subject to <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps terms</a> and content policies. Reviews are supplied and ordered by Google Maps; Yamzo does not independently verify each reviewer&apos;s experience.</p></section>
      <section><h2>Availability</h2><p>We work to keep the service accurate and available, but maintenance, network issues, provider outages, or operational needs may pause ordering or status updates. Contact the restaurant if an urgent status needs confirmation.</p></section>
      <section><h2>Contact</h2><p>Questions about an order can be directed to <a href="tel:+8801761737584">01761-737584</a> or <a href="mailto:sales@yamzouttara.com">sales@yamzouttara.com</a>.</p></section>
    </LegalPage>
  );
}
