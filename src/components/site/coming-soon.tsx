import { ArrowUpRight, Clock3, MapPin, Radar } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function ComingSoon() {
  return (
    <main className="coming-soon-shell">
      <Image
        src="/brand/yamzo-cover.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="coming-soon-cover"
      />
      <div className="coming-soon-wash" aria-hidden="true" />
      <div className="bubble bubble-one" aria-hidden="true" />
      <div className="bubble bubble-two" aria-hidden="true" />
      <div className="bubble bubble-three" aria-hidden="true" />

      <div className="coming-soon-frame">
        <header className="coming-soon-header">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Image
                src="/brand/yamzo-logo.png"
                alt="Yamzo"
                width={176}
                height={176}
                priority
                className="brand-image"
              />
            </div>
            <div>
              <p className="brand-location">Yamzo Uttara</p>
              <p className="brand-tagline">Taste the fun, dive into flavor</p>
            </div>
          </div>
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Website kitchen in progress
          </span>
        </header>

        <section className="coming-soon-content" aria-labelledby="coming-soon-title">
          <div className="content-copy">
            <p className="eyebrow">
              <Radar aria-hidden="true" />
              Something fresh is surfacing
            </p>
            <h1 id="coming-soon-title">Uttara&apos;s seafood stop is coming online.</h1>
            <p className="intro">
              We&apos;re preparing a faster way to explore the full Yamzo menu,
              place an order, and follow every step from our kitchen to your door.
            </p>

            <div className="feature-row" aria-label="Launch features">
              <span><MapPin aria-hidden="true" /> Uttara delivery</span>
              <span><Clock3 aria-hidden="true" /> Live order updates</span>
            </div>
          </div>

          <aside className="launch-card" aria-label="Launch progress">
            <p className="launch-label">Preparing your new ordering experience</p>
            <div className="launch-track" aria-hidden="true"><span /></div>
            <div className="launch-meta">
              <span>Menu</span><span>Checkout</span><span>Tracking</span>
            </div>
            <p className="launch-note">
              Online ordering remains closed while our team completes testing.
            </p>
          </aside>
        </section>

        <footer className="coming-soon-footer">
          <p>
            <span lang="bn" className="font-bengali">শীঘ্রই আসছে</span>
            <span aria-hidden="true"> · </span>
            Serving Uttara, Dhaka
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href="/privacy" className="min-h-11 content-center text-xs font-bold text-white/75 hover:text-white hover:underline">Privacy</Link>
            <Link href="/terms" className="min-h-11 content-center text-xs font-bold text-white/75 hover:text-white hover:underline">Terms</Link>
            <Button asChild variant="outline" size="lg" className="staff-link">
              <Link href="/login?next=/">
                Staff preview
                <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </footer>
      </div>
    </main>
  );
}
