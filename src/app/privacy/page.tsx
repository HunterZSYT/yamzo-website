import type { Metadata } from "next";

import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Yamzo Uttara handles website, account, and order information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" summary="This notice explains the information used to place, fulfil, and track a Yamzo Uttara order.">
      <section><h2>Information we use</h2><p>When you order, we collect your name, phone number, Uttara delivery address, selected items, order notes, timestamps, and order status. If you sign in, your Supabase account identifier and email are used to secure your account and show orders linked to it.</p></section>
      <section><h2>Why we use it</h2><p>We use order information to confirm availability, prepare and deliver food, provide live status updates, prevent duplicate or abusive requests, support customers, and keep the operational and financial records required to run the restaurant.</p></section>
      <section><h2>Guest tracking</h2><p>A guest order receives a private tracking key stored in that browser&apos;s session storage. A phone number by itself does not unlock full order history. Signed-in history is protected by the account session and database access rules.</p></section>
      <section><h2>Service providers</h2><p>We use Supabase for authentication and data, Vercel for website hosting, Cloudflare for DNS and network services, and Resend for transactional email. When enabled, Google provides sign-in and Google Maps rating/review content. Each provider processes data under its own terms and privacy practices.</p></section>
      <section><h2>Google Maps content</h2><p>Ratings and reviews labeled <span translate="no">Google Maps</span> come from Google Maps Platform. Review authors and source links are displayed with that content. Read <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google&apos;s Privacy Policy</a>.</p></section>
      <section id="analytics"><h2>Analytics choices</h2><p>Optional Meta Pixel browser analytics is off by default. If you explicitly accept, it may receive page views and a non-identifying order reference, currency, and order value; Yamzo does not send your name, phone number, or delivery address from the browser. Your choice is stored in the first-party <code>yamzo_analytics_consent</code> cookie for up to 180 days. Global Privacy Control or Do Not Track keeps browser analytics off even if an earlier cookie says otherwise. You can delete Yamzo Uttara site data in your browser to make the choice again, and your choice never affects ordering.</p><p>When the restaurant enables server-side conversion measurement, Meta may separately receive a completed production order&apos;s value and item details plus one-way hashes derived from the customer&apos;s name, phone number, country, and signed-in account identifier. Test orders are excluded. These server events support advertising measurement and are not used to decide whether an order is accepted or fulfilled.</p></section>
      <section><h2>Retention and choices</h2><p>Production orders are retained for restaurant operations, support, audit, and legal needs. Test orders are separated and may be permanently deleted by an authorized operator. You may ask about your personal information by emailing <a href="mailto:admin@yamzouttara.com">admin@yamzouttara.com</a>.</p></section>
      <section><h2>Security</h2><p>We use role-based access, row-level database policies, encrypted transport, secret-only server configuration, and audit records. No online service can promise absolute security, so we continually limit access and the amount of personal information exposed.</p></section>
    </LegalPage>
  );
}
