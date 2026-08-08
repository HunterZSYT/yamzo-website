"use client";

import { Fragment, type ComponentProps, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Languages,
  MapPin,
  Megaphone,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
  Waves,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  getLocalizedText,
  getMenuItemStartingPrice,
  type Locale,
  type MenuItem,
  type MenuModifierGroup,
} from "@/data";
import type { SiteAccess } from "@/lib/auth/access";
import type { StorefrontCatalog } from "@/lib/catalog/storefront";
import { createOrder } from "@/lib/orders/client";
import {
  checkoutSchema,
  type CartLine,
  type CheckoutDetails,
} from "@/lib/orders/types";
import { normalizeCheckoutInput } from "@/lib/orders/checkout-input";
import type { GoogleReviewSnapshot } from "@/lib/reviews/types";
import type {
  StorefrontBanner,
  StorefrontHomeSection,
  StorefrontMerchandising,
  StorefrontOffer,
} from "@/lib/storefront/merchandising";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    menu: "Menu",
    track: "Track order",
    signIn: "Sign in",
    search: "Search the menu",
    heroEyebrow: "Made fresh in Uttara",
    heroTitle: "Seafood cravings, sorted.",
    heroBody:
      "Yamzo favourites, direct prices, and live kitchen updates—delivered across Uttara.",
    browse: "Explore the menu",
    status: "Check an order",
    rating: "Google rating",
    reviews: "reviews",
    open: "Opening time is managed live by our team",
    delivery: "Uttara delivery",
    all: "All",
    popular: "Popular right now",
    fullMenu: "Full menu",
    result: "item",
    results: "items",
    noResults: "Nothing matched that search.",
    cart: "Your order",
    emptyCart: "Your next favourite is waiting.",
    emptyHint: "Choose something from the menu to start your order.",
    subtotal: "Subtotal",
    deliveryFee: "Delivery fee",
    calculated: "Confirmed before acceptance",
    checkout: "Continue to checkout",
    testCheckout: "Place a test order",
    unavailable: "Ordering is currently paused",
    add: "Add to order",
    from: "From",
    serving: "Serving",
    pieces: "pcs",
    choose: "Choose an option",
    quantity: "Quantity",
    checkoutTitle: "Where should we send it?",
    checkoutBody: "All fields are required so the kitchen can confirm your delivery.",
    name: "Full name",
    sector: "Sector number",
    road: "Road number",
    house: "House number",
    flat: "Flat number",
    phone: "Phone number",
    notes: "Order note (optional)",
    place: "Place order",
    placing: "Sending to the kitchen…",
    safe: "Your details are used only to fulfil and track your order.",
    testMode: "Staff preview · test orders only",
    preview: "Staff preview",
    reviewEyebrow: "Loved around Uttara",
    reviewTitle: "Five-star notes from Google Maps",
    reviewNotice: "Showing up to five 5-star reviews supplied by Google Maps, ordered by relevance.",
    viewReview: "View review on Google Maps",
    translated: "Translated by Google Maps",
  },
  bn: {
    menu: "মেনু",
    track: "অর্ডার দেখুন",
    signIn: "লগইন",
    search: "মেনু খুঁজুন",
    heroEyebrow: "উত্তরায় প্রতিদিন ফ্রেশ",
    heroTitle: "সি-ফুডের আনন্দ, এখন আরও সহজ।",
    heroBody: "ইয়ামজোর পছন্দের খাবার, সরাসরি দাম এবং লাইভ কিচেন আপডেট।",
    browse: "মেনু দেখুন",
    status: "অর্ডার দেখুন",
    rating: "গুগল রেটিং",
    reviews: "রিভিউ",
    open: "খোলার সময় আমাদের টিম লাইভ আপডেট করে",
    delivery: "উত্তরায় ডেলিভারি",
    all: "সব",
    popular: "এখন জনপ্রিয়",
    fullMenu: "সম্পূর্ণ মেনু",
    result: "টি আইটেম",
    results: "টি আইটেম",
    noResults: "এই নামে কোনো খাবার পাওয়া যায়নি।",
    cart: "আপনার অর্ডার",
    emptyCart: "আপনার পছন্দের খাবার অপেক্ষায় আছে।",
    emptyHint: "অর্ডার শুরু করতে মেনু থেকে খাবার বেছে নিন।",
    subtotal: "মোট",
    deliveryFee: "ডেলিভারি চার্জ",
    calculated: "অর্ডার গ্রহণের আগে নিশ্চিত করা হবে",
    checkout: "চেকআউট করুন",
    testCheckout: "টেস্ট অর্ডার দিন",
    unavailable: "অর্ডার এখন বন্ধ আছে",
    add: "অর্ডারে যোগ করুন",
    from: "শুরু",
    serving: "পরিমাণ",
    pieces: "পিস",
    choose: "একটি অপশন বাছুন",
    quantity: "পরিমাণ",
    checkoutTitle: "কোথায় পাঠাব?",
    checkoutBody: "ডেলিভারি নিশ্চিত করতে সব তথ্য প্রয়োজন।",
    name: "পুরো নাম",
    sector: "সেক্টর নম্বর",
    road: "রোড নম্বর",
    house: "বাড়ি নম্বর",
    flat: "ফ্ল্যাট নম্বর",
    phone: "ফোন নম্বর",
    notes: "অর্ডার নোট (ঐচ্ছিক)",
    place: "অর্ডার করুন",
    placing: "কিচেনে পাঠানো হচ্ছে…",
    safe: "আপনার তথ্য শুধু অর্ডার ডেলিভারি ও ট্র্যাকিংয়ের জন্য ব্যবহৃত হয়।",
    testMode: "স্টাফ প্রিভিউ · শুধু টেস্ট অর্ডার",
    preview: "স্টাফ প্রিভিউ",
    reviewEyebrow: "উত্তরার মানুষের পছন্দ",
    reviewTitle: "Google Maps-এর পাঁচ তারকা রিভিউ",
    reviewNotice: "Google Maps থেকে প্রাসঙ্গিকতার ভিত্তিতে সর্বোচ্চ পাঁচটি ৫-তারকা রিভিউ দেখানো হচ্ছে।",
    viewReview: "Google Maps-এ রিভিউ দেখুন",
    translated: "Google Maps দ্বারা অনূদিত",
  },
} as const;

type ProductSelection = {
  variantId: string | null;
  modifierOptionIds: string[];
  quantity: number;
};

function formatPrice(value: number, locale: Locale) {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function localizedOr(
  value: { en: string; bn: string | null },
  locale: Locale,
  fallback: string,
) {
  return getLocalizedText(value, locale).trim() || fallback;
}

function BannerActionLink({
  href,
  children,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const external = href.startsWith("https://");
  return (
    <a
      {...props}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

function formatOfferValue(offer: StorefrontOffer, locale: Locale) {
  if (offer.kind === "free_delivery") {
    return locale === "bn" ? "ফ্রি ডেলিভারি" : "Free delivery";
  }
  if (offer.kind === "fixed") {
    return locale === "bn"
      ? `${formatPrice(offer.value / 100, locale)} ছাড়`
      : `${formatPrice(offer.value / 100, locale)} off`;
  }

  const percentage = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    maximumFractionDigits: 2,
  }).format(offer.value / 100);
  return locale === "bn" ? `${percentage}% ছাড়` : `${percentage}% off`;
}

function StoreHeader({ locale, setLocale, itemCount, onOpenCart, showMenu }: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  itemCount: number;
  onOpenCart: () => void;
  showMenu: boolean;
}) {
  const t = copy[locale];
  return (
    <header className="sticky top-0 z-40 border-b border-sky-100/90 bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex h-17 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Image src="/brand/yamzo-logo.png" alt="Yamzo Uttara" width={52} height={52} priority className="h-11 w-11 rounded-xl object-contain" />
          <div className="leading-none">
            <p className="text-[0.93rem] font-extrabold tracking-[-0.03em]">Yamzo Uttara</p>
            <p className="mt-1 hidden text-[0.65rem] font-semibold text-muted-foreground sm:block">Taste the fun</p>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {showMenu ? <Button asChild variant="ghost"><a href="#menu">{t.menu}</a></Button> : null}
          <Button asChild variant="ghost"><Link href="/order-status">{t.track}</Link></Button>
        </nav>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 gap-1.5 px-2.5"
            onClick={() => setLocale(locale === "en" ? "bn" : "en")}
            aria-label={locale === "en" ? "Switch to Bangla" : "Switch to English"}
          >
            <Languages aria-hidden="true" />
            <span className="font-bold">{locale === "en" ? "বাংলা" : "EN"}</span>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden min-h-11 sm:inline-flex">
            <Link href="/login?next=/"><UserRound aria-hidden="true" />{t.signIn}</Link>
          </Button>
          <button type="button" onClick={onOpenCart} className="relative grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden" aria-label={`${t.cart}, ${itemCount} items`}>
            <ShoppingBag aria-hidden="true" className="size-5" />
            {itemCount > 0 ? <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-black text-accent-foreground">{itemCount}</span> : null}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ locale, reviews, access, banner, section, showMenu }: {
  locale: Locale;
  reviews: GoogleReviewSnapshot;
  access: SiteAccess;
  banner: StorefrontBanner | null;
  section: StorefrontHomeSection;
  showMenu: boolean;
}) {
  const t = copy[locale];
  const ratingLabel = reviews.rating.toFixed(1);
  const reviewCount = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD").format(reviews.reviewCount);
  const eyebrow = banner
    ? localizedOr(banner.eyebrow, locale, t.heroEyebrow)
    : t.heroEyebrow;
  const title = banner
    ? localizedOr(banner.title, locale, localizedOr(section.title, locale, t.heroTitle))
    : localizedOr(section.title, locale, t.heroTitle);
  const body = banner
    ? localizedOr(banner.body, locale, localizedOr(section.subtitle, locale, t.heroBody))
    : localizedOr(section.subtitle, locale, t.heroBody);
  const primaryHref = banner?.actionUrl ?? (showMenu ? "#menu" : "/order-status");
  const primaryLabel = banner
    ? localizedOr(banner.actionLabel, locale, t.browse)
    : showMenu
      ? t.browse
      : t.status;
  const openingLabel = access.ordering.ordering_open
    ? locale === "bn"
      ? "অনলাইন অর্ডার খোলা আছে"
      : "Open for online orders"
    : locale === "bn"
      ? access.ordering.closed_reason_bn
      : access.ordering.closed_reason_en;
  return (
    <section className="relative isolate overflow-hidden bg-[#032f4f] text-white">
      {banner?.image ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url("${banner.image.src}")` }}
        />
      ) : (
        <Image src="/brand/yamzo-cover.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-center opacity-60" />
      )}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(92deg,rgba(1,28,49,.96)_0%,rgba(2,47,79,.88)_46%,rgba(2,47,79,.3)_100%)]" />
      <div className="mx-auto grid min-h-[31rem] max-w-[90rem] items-end gap-8 px-4 py-10 sm:px-6 md:min-h-[35rem] md:grid-cols-[1fr_21rem] md:py-14 lg:px-8">
        <div className="max-w-3xl pb-2">
          <p className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-sky-200"><Waves className="size-4" aria-hidden="true" />{eyebrow}</p>
          <h1 className={cn("max-w-[10ch] text-balance text-5xl font-black leading-[.94] tracking-[-.065em] sm:text-6xl lg:text-8xl", locale === "bn" && "font-bengali leading-[1.05] tracking-[-.035em]")}>{title}</h1>
          <p className={cn("mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg", locale === "bn" && "font-bengali")}>{body}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-h-12 bg-[#ff8a2b] text-[#3f1d00] hover:bg-[#ff9d50]"><BannerActionLink href={primaryHref}>{primaryLabel}<ArrowRight aria-hidden="true" /></BannerActionLink></Button>
            {showMenu || banner?.actionUrl ? <Button asChild size="lg" variant="outline" className="min-h-12 border-white/30 bg-white/10 text-white hover:bg-white hover:text-[#082a44]"><Link href="/order-status">{t.status}</Link></Button> : null}
          </div>
        </div>

        <div className="grid gap-3 md:pb-2">
          <a href={reviews.googleMapsUri} target="_blank" rel="noreferrer" className="rounded-3xl border border-white/18 bg-[#052d4a]/75 p-5 shadow-2xl backdrop-blur-xl transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-bold text-white/65">{t.rating}</p><p className="mt-1 text-4xl font-black tracking-[-.06em]">{ratingLabel}</p></div>
              <div className="text-right"><div className="flex gap-0.5 text-[#ffd12d]" aria-label={`${ratingLabel} out of 5 stars`}>{Array.from({ length: 5 }).map((_, index) => <Star key={index} className="size-4 fill-current" aria-hidden="true" />)}</div><p className="mt-1.5 text-xs text-white/65">{reviewCount} {t.reviews}</p></div>
            </div>
            <p className="mt-4 flex items-center justify-between border-t border-white/12 pt-4 text-xs font-bold text-white/75"><span><span translate="no">Google Maps</span>{reviews.source === "fallback" ? " · supplied snapshot" : " · live"}</span><ChevronRight className="size-4" aria-hidden="true" /></p>
          </a>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-[#052d4a]/70 p-4 backdrop-blur-xl"><MapPin className="size-4 text-[#ffd12d]" aria-hidden="true" /><p className="mt-2 text-xs font-bold">{t.delivery}</p></div>
            <div className="rounded-2xl border border-white/15 bg-[#052d4a]/70 p-4 backdrop-blur-xl"><Clock3 className="size-4 text-[#ffd12d]" aria-hidden="true" /><p className="mt-2 text-xs font-bold leading-4">{openingLabel ?? t.open}</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceAssurances({ locale }: { locale: Locale }) {
  const assurances = locale === "bn"
    ? [
        { icon: Check, title: "সরাসরি মেনু মূল্য", body: "মার্কেটপ্লেসের অতিরিক্ত দাম নেই" },
        { icon: PackageCheck, title: "কিচেনের সাথে সংযুক্ত", body: "প্রস্তুতির লাইভ আপডেট" },
        { icon: MapPin, title: "উত্তরার জন্য তৈরি", body: "এলাকাভিত্তিক ডেলিভারি" },
      ]
    : [
        { icon: Check, title: "Direct menu prices", body: "No marketplace markup" },
        { icon: PackageCheck, title: "Kitchen-connected", body: "Live preparation updates" },
        { icon: MapPin, title: "Made for Uttara", body: "Focused local delivery" },
      ];

  return (
    <section className="border-b border-sky-100 bg-white" aria-label={locale === "bn" ? "সেবার নিশ্চয়তা" : "Service assurances"}>
      <div className="mx-auto grid max-w-[90rem] grid-cols-1 gap-px bg-sky-100 sm:grid-cols-3">
        {assurances.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-center gap-3 bg-white px-5 py-4 sm:justify-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-primary"><Icon className="size-4" aria-hidden="true" /></span>
            <div><p className="text-xs font-extrabold">{title}</p><p className="mt-0.5 text-[.68rem] text-muted-foreground">{body}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnnouncementBanners({ banners, locale }: { banners: readonly StorefrontBanner[]; locale: Locale }) {
  if (!banners.length) return null;

  return (
    <section className="border-b border-orange-100 bg-[#fff8ef]" aria-label={locale === "bn" ? "ঘোষণা" : "Announcements"}>
      <ul className="mx-auto flex max-w-[90rem] snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-4 sm:px-6 lg:px-8 [scrollbar-width:thin]">
        {banners.map((banner) => {
          const title = getLocalizedText(banner.title, locale);
          const body = getLocalizedText(banner.body, locale);
          const eyebrow = localizedOr(
            banner.eyebrow,
            locale,
            locale === "bn" ? "ইয়ামজো আপডেট" : "Yamzo update",
          );
          const actionLabel = localizedOr(
            banner.actionLabel,
            locale,
            locale === "bn" ? "আরও দেখুন" : "Learn more",
          );

          return (
            <li
              key={banner.id}
              className="relative min-w-[min(88vw,31rem)] snap-start overflow-hidden rounded-2xl border border-orange-100 bg-[#fffaf4] px-5 py-4 shadow-[0_10px_28px_rgba(89,52,11,.06)] sm:min-w-[26rem]"
              style={banner.image ? { backgroundImage: `linear-gradient(90deg,rgba(255,250,244,.98),rgba(255,250,244,.82)),url("${banner.image.src}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
            >
              <p className="flex items-center gap-1.5 text-[.68rem] font-extrabold uppercase tracking-[.14em] text-[#a44f00]"><Megaphone className="size-3.5" aria-hidden="true" />{eyebrow}</p>
              <h2 className="mt-2 text-lg font-black tracking-[-.025em]">{title}</h2>
              {body ? <p className="mt-1.5 max-w-md text-xs leading-5 text-foreground/72">{body}</p> : null}
              {banner.actionUrl ? <a href={banner.actionUrl} target={banner.actionUrl.startsWith("https://") ? "_blank" : undefined} rel={banner.actionUrl.startsWith("https://") ? "noreferrer" : undefined} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-extrabold text-[#9a4700] underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a4700]">{actionLabel}<ArrowRight className="size-3.5" aria-hidden="true" /></a> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OffersSection({ offers, section, locale }: { offers: readonly StorefrontOffer[]; section: StorefrontHomeSection; locale: Locale }) {
  if (!offers.length) return null;
  const titleId = `home-section-${section.id}`;
  const title = localizedOr(section.title, locale, locale === "bn" ? "অফার" : "Offers");
  const subtitle = localizedOr(section.subtitle, locale, locale === "bn" ? "যোগ্য অর্ডারে সেরা অফার স্বয়ংক্রিয়ভাবে প্রয়োগ হবে।" : "The best eligible offer is applied automatically.");

  return (
    <section className="border-y border-orange-100 bg-[linear-gradient(180deg,#fff9f1_0%,#fff_100%)]" aria-labelledby={titleId}>
      <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="max-w-2xl">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.14em] text-[#a44f00]"><BadgePercent className="size-4" aria-hidden="true" />{locale === "bn" ? "আজকের সাশ্রয়" : "Today’s savings"}</p>
          <h2 id={titleId} className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => {
            const description = getLocalizedText(offer.description, locale);
            const terms = getLocalizedText(offer.terms, locale);
            return (
              <li key={offer.id} className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-5 shadow-[0_16px_44px_rgba(89,52,11,.07)]">
                <div className="absolute -right-8 -top-8 size-28 rounded-full bg-orange-100/65" aria-hidden="true" />
                <div className="relative">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge className="bg-[#ff8a2b] text-[#3f1d00] hover:bg-[#ff8a2b]">{formatOfferValue(offer, locale)}</Badge>
                    {offer.code ? <code className="rounded-lg border border-dashed border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[.68rem] font-extrabold text-[#7f3a00]" aria-label={`${locale === "bn" ? "অফার কোড" : "Offer code"}: ${offer.code}`}>{offer.code}</code> : null}
                  </div>
                  <h3 className="mt-4 text-xl font-black tracking-[-.035em]">{getLocalizedText(offer.name, locale)}</h3>
                  {description ? <p className="mt-2 text-sm leading-6 text-foreground/72">{description}</p> : null}
                  {offer.minimumSubtotalMinor > 0 ? <p className="mt-4 text-xs font-bold text-[#7f3a00]">{locale === "bn" ? `ন্যূনতম অর্ডার ${formatPrice(offer.minimumSubtotalMinor / 100, locale)}` : `Minimum order ${formatPrice(offer.minimumSubtotalMinor / 100, locale)}`}</p> : null}
                  {terms ? <details className="mt-3 text-xs text-muted-foreground"><summary className="min-h-11 cursor-pointer content-center font-bold text-foreground/75 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{locale === "bn" ? "শর্ত দেখুন" : "View terms"}</summary><p className="pb-1 leading-5">{terms}</p></details> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ReviewCarousel({ locale, snapshot, section }: { locale: Locale; snapshot: GoogleReviewSnapshot; section: StorefrontHomeSection }) {
  const viewport = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  if (!snapshot.reviews.length) return null;

  const move = (direction: -1 | 1) => {
    const width = viewport.current?.clientWidth ?? 320;
    viewport.current?.scrollBy({ left: direction * Math.max(280, width * 0.82), behavior: "smooth" });
  };

  return (
    <section className="border-t border-sky-100 bg-[linear-gradient(180deg,#f6fbfe_0%,#fff_100%)]" aria-labelledby="google-reviews-title">
      <div className="mx-auto max-w-[90rem] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.14em] text-primary">{t.reviewEyebrow}</p>
            <h2 id="google-reviews-title" className={cn("mt-2 max-w-2xl text-3xl font-black tracking-[-.05em] sm:text-4xl", locale === "bn" && "font-bengali tracking-[-.025em]")}>{localizedOr(section.title, locale, t.reviewTitle)}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{localizedOr(section.subtitle, locale, t.reviewNotice)}</p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{t.reviewNotice}</p>
          </div>
          <div className="flex gap-2" aria-label="Review carousel controls">
            <Button type="button" variant="outline" size="icon-lg" aria-label={locale === "bn" ? "আগের রিভিউ" : "Previous reviews"} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></Button>
            <Button type="button" variant="outline" size="icon-lg" aria-label={locale === "bn" ? "পরের রিভিউ" : "Next reviews"} onClick={() => move(1)}><ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>

        <div ref={viewport} className="mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]" tabIndex={0} aria-label={locale === "bn" ? "Google Maps-এর পাঁচ তারকা রিভিউ" : "Five-star Google Maps reviews"}>
          {snapshot.reviews.map((review) => (
            <article key={review.id} className="min-w-[min(86vw,22rem)] snap-start rounded-3xl border border-sky-100 bg-white p-5 shadow-[0_14px_42px_rgba(8,42,68,.07)] sm:min-w-[23rem] lg:min-w-[calc((100%-2rem)/3)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {review.authorPhotoUri ? <Image src={review.authorPhotoUri} alt="" width={44} height={44} className="size-11 rounded-full object-cover ring-2 ring-sky-100" /> : <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-50 text-sm font-black text-primary" aria-hidden="true">{review.authorName.slice(0, 1).toUpperCase()}</span>}
                  <div className="min-w-0">
                    {review.authorUri ? <a href={review.authorUri} target="_blank" rel="noreferrer" className="block truncate text-sm font-black hover:text-primary hover:underline">{review.authorName}</a> : <p className="truncate text-sm font-black">{review.authorName}</p>}
                    <p className="mt-0.5 text-[.68rem] text-muted-foreground">{review.relativePublishedAt}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 text-[#f2b900]" aria-label="5 out of 5 stars">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className="size-3.5 fill-current" aria-hidden="true" />)}</div>
              </div>
              <p className="mt-5 line-clamp-6 text-sm leading-6 text-foreground/82">“{review.text}”</p>
              {review.translated ? <p className="mt-3 text-[.68rem] text-muted-foreground">{t.translated}</p> : null}
              <a href={review.googleMapsUri} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-xs font-extrabold text-primary hover:underline">{t.viewReview}<ChevronRight className="size-3.5" aria-hidden="true" /></a>
            </article>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground"><span translate="no" className="font-normal text-[#5e5e5e]">Google Maps</span> reviews are ordered by relevance. Google checks for and removes fake content when it is identified.</p>
      </div>
    </section>
  );
}

function ProductCard({ item, locale, onOpen }: { item: MenuItem; locale: Locale; onOpen: (item: MenuItem) => void }) {
  const t = copy[locale];
  const name = getLocalizedText(item.name, locale);
  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.25 }} className="group overflow-hidden rounded-[1.45rem] border border-sky-100 bg-white shadow-[0_10px_36px_rgba(8,42,68,.06)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(8,42,68,.11)]">
      <button type="button" className="block w-full text-left" onClick={() => onOpen(item)} aria-label={`${name}, ${formatPrice(getMenuItemStartingPrice(item), locale)}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(145deg,#e7f7fd,#fff2c4)]">
          {item.image ? <Image src={item.image.src} alt={getLocalizedText(item.image.alt, locale)} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px" className="object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center"><Waves className="size-10 text-primary/35" aria-hidden="true" /></div>}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {item.popular ? <Badge className="border-0 bg-[#ffd12d] text-[#4a3200]">Popular</Badge> : null}
            {item.bestValue ? <Badge className="border-0 bg-[#e9f8ef] text-[#17663a]">Best value</Badge> : null}
          </div>
          <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white text-primary shadow-lg transition group-hover:rotate-6 group-hover:bg-primary group-hover:text-white"><Plus className="size-5" aria-hidden="true" /></span>
        </div>
        <div className="p-4">
          <h3 className={cn("line-clamp-1 text-sm font-extrabold tracking-[-.02em] sm:text-base", locale === "bn" && "font-bengali")}>{name}</h3>
          <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{getLocalizedText(item.description, locale)}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-sm font-black text-primary">{item.pricing.kind === "variants" ? `${t.from} ` : ""}{formatPrice(getMenuItemStartingPrice(item), locale)}</p>
            {item.serving ? <span className="text-[.65rem] font-bold text-muted-foreground">{item.serving.quantity}{item.serving.maximumQuantity ? `–${item.serving.maximumQuantity}` : ""} {item.serving.unit === "piece" ? t.pieces : "g"}</span> : null}
          </div>
        </div>
      </button>
    </motion.article>
  );
}

function CategoryHighlights({ section, categories, popular, locale, onOpen, onCategory, showMenu }: {
  section: StorefrontHomeSection;
  categories: StorefrontCatalog["categories"];
  popular: readonly MenuItem[];
  locale: Locale;
  onOpen: (item: MenuItem) => void;
  onCategory: (categoryId: string) => void;
  showMenu: boolean;
}) {
  if (!categories.length && !popular.length) return null;
  const t = copy[locale];
  const titleId = `home-section-${section.id}`;
  const title = localizedOr(section.title, locale, t.popular);
  const subtitle = getLocalizedText(section.subtitle, locale);

  return (
    <section className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14" aria-labelledby={titleId}>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.14em] text-primary">{locale === "bn" ? "ইয়ামজো ঘুরে দেখুন" : "Explore Yamzo"}</p>
          <h2 id={titleId} className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{title}</h2>
          {subtitle ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
        </div>
        {showMenu ? <a href="#menu" className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-primary underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t.fullMenu}<ArrowRight className="size-4" aria-hidden="true" /></a> : null}
      </div>

      {categories.length && showMenu ? (
        <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" aria-label={locale === "bn" ? "মেনু বিভাগ" : "Menu categories"}>
          {categories.map((entry) => (
            <a
              key={entry.id}
              href="#menu"
              onClick={() => onCategory(entry.id)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-sky-100 bg-white px-4 text-sm font-extrabold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {getLocalizedText(entry.name, locale)}
            </a>
          ))}
        </nav>
      ) : null}

      {popular.length ? <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-6">{popular.map((item) => <ProductCard key={item.id} item={item} locale={locale} onOpen={onOpen} />)}</div> : null}
    </section>
  );
}

function ProductDialog({ item, locale, open, onOpenChange, onAdd, modifierGroups }: {
  item: MenuItem | null;
  locale: Locale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: MenuItem, selection: ProductSelection) => void;
  modifierGroups: readonly MenuModifierGroup[];
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const t = copy[locale];
  if (!item) return null;
  const modifierGroupsById = new Map(
    modifierGroups.map((group) => [group.id, group]),
  );
  const groups = item.modifierGroupIds.flatMap((groupId) => {
    const group = modifierGroupsById.get(groupId);
    return group ? [group] : [];
  });
  const selectedVariant = item.pricing.kind === "variants" ? item.pricing.variants.find((variant) => variant.id === variantId) : null;
  const basePrice = item.pricing.kind === "fixed" ? item.pricing.price : selectedVariant?.price ?? getMenuItemStartingPrice(item);
  const modifierPrice = groups.flatMap((group) => group.options).filter((option) => modifierIds.includes(option.id)).reduce((sum, option) => sum + option.priceDelta, 0);
  const selectedOptionCount = (group: MenuModifierGroup) =>
    group.options.filter((option) => modifierIds.includes(option.id)).length;
  const requiredComplete =
    (item.pricing.kind === "fixed" || variantId !== null) &&
    groups.every((group) => {
      const selectionCount = selectedOptionCount(group);
      return (
        selectionCount >= group.minimumSelections &&
        selectionCount <= group.maximumSelections
      );
    });

  const toggleOption = (groupId: string, optionId: string) => {
    const group = modifierGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    if (group.selection === "single") {
      const groupOptions = new Set(group.options.map((option) => option.id));
      setModifierIds((current) => [...current.filter((id) => !groupOptions.has(id)), optionId]);
    } else {
      const groupOptions = new Set(group.options.map((option) => option.id));
      setModifierIds((current) => {
        if (current.includes(optionId)) {
          return current.filter((id) => id !== optionId);
        }
        const selectionCount = current.filter((id) => groupOptions.has(id)).length;
        return selectionCount >= group.maximumSelections
          ? current
          : [...current, optionId];
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setVariantId(null); setModifierIds([]); setQuantity(1); } }}>
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-[43rem]">
        <div className="relative aspect-[16/9] min-h-56 overflow-hidden bg-[linear-gradient(145deg,#e7f7fd,#fff2c4)]">
          {item.image ? <Image src={item.image.src} alt={getLocalizedText(item.image.alt, locale)} fill sizes="700px" className="object-cover" /> : <div className="grid h-full place-items-center"><Waves className="size-16 text-primary/30" aria-hidden="true" /></div>}
        </div>
        <div className="p-5 sm:p-7">
          <DialogHeader className="text-left">
            <DialogTitle className={cn("text-2xl font-black tracking-[-.045em]", locale === "bn" && "font-bengali")}>{getLocalizedText(item.name, locale)}</DialogTitle>
            <DialogDescription className="pt-1 leading-6">{getLocalizedText(item.description, locale)}</DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-5">
            {item.pricing.kind === "variants" ? (
              <fieldset>
                <legend className="mb-2 text-sm font-extrabold">{t.choose}<span className="ml-1 text-destructive">*</span></legend>
                <div className="grid gap-2">
                  {item.pricing.variants.map((variant) => (
                    <label key={variant.id} className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition", variantId === variant.id && "border-primary bg-primary/5 ring-1 ring-primary") }>
                      <span className="flex items-center gap-3"><input type="radio" name="variant" value={variant.id} checked={variantId === variant.id} onChange={() => setVariantId(variant.id)} className="size-4 accent-primary" /><span className="text-sm font-bold">{getLocalizedText(variant.label, locale)}</span></span>
                      <span className="text-sm font-black text-primary">{formatPrice(variant.price, locale)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {groups.map((group) => (
              <fieldset key={group.id}>
                <legend className="mb-2 text-sm font-extrabold">{getLocalizedText(group.label, locale)}{group.minimumSelections > 0 ? <span className="ml-1 text-destructive">*</span> : null}</legend>
                <div className="grid gap-2">
                  {group.options.map((option) => (
                    <label key={option.id} className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition", modifierIds.includes(option.id) && "border-primary bg-primary/5 ring-1 ring-primary", group.selection === "multiple" && !modifierIds.includes(option.id) && selectedOptionCount(group) >= group.maximumSelections && "cursor-not-allowed opacity-60") }>
                      <span className="flex items-center gap-3"><input type={group.selection === "single" ? "radio" : "checkbox"} name={group.id} value={option.id} checked={modifierIds.includes(option.id)} disabled={group.selection === "multiple" && !modifierIds.includes(option.id) && selectedOptionCount(group) >= group.maximumSelections} onChange={() => toggleOption(group.id, option.id)} className="size-4 accent-primary" /><span className="text-sm font-bold">{getLocalizedText(option.label, locale)}</span></span>
                      {option.priceDelta ? <span className="text-sm font-bold">+{formatPrice(option.priceDelta, locale)}</span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex min-h-12 items-center rounded-xl border bg-muted/40 p-1" aria-label={t.quantity}>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus aria-hidden="true" /></Button>
              <span className="min-w-9 text-center text-sm font-black" aria-live="polite">{quantity}</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Increase quantity" onClick={() => setQuantity((value) => Math.min(20, value + 1))}><Plus aria-hidden="true" /></Button>
            </div>
            <Button className="min-h-12 flex-1" disabled={!requiredComplete} onClick={() => { onAdd(item, { variantId, modifierOptionIds: modifierIds, quantity }); onOpenChange(false); setVariantId(null); setModifierIds([]); setQuantity(1); }}>
              {t.add}<span className="ml-auto">{formatPrice((basePrice + modifierPrice) * quantity, locale)}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CartBanner({ banner, locale }: { banner: StorefrontBanner; locale: Locale }) {
  const body = getLocalizedText(banner.body, locale);
  const actionLabel = localizedOr(
    banner.actionLabel,
    locale,
    locale === "bn" ? "আরও দেখুন" : "Learn more",
  );
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-orange-100 bg-[#fff7ec] p-4"
      role="note"
      style={banner.image ? { backgroundImage: `linear-gradient(90deg,rgba(255,247,236,.98),rgba(255,247,236,.86)),url("${banner.image.src}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      <p className="flex items-center gap-1.5 text-[.65rem] font-extrabold uppercase tracking-[.12em] text-[#944500]"><Megaphone className="size-3.5" aria-hidden="true" />{localizedOr(banner.eyebrow, locale, locale === "bn" ? "কার্ট আপডেট" : "Cart update")}</p>
      <p className="mt-1.5 text-sm font-black">{getLocalizedText(banner.title, locale)}</p>
      {body ? <p className="mt-1 text-xs leading-5 text-foreground/70">{body}</p> : null}
      {banner.actionUrl ? <a href={banner.actionUrl} target={banner.actionUrl.startsWith("https://") ? "_blank" : undefined} rel={banner.actionUrl.startsWith("https://") ? "noreferrer" : undefined} className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-extrabold text-[#944500] underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#944500]">{actionLabel}<ArrowRight className="size-3.5" aria-hidden="true" /></a> : null}
    </div>
  );
}

function CartContents({ lines, locale, onQuantity, onRemove, onCheckout, orderingEnabled, testMode, banner }: {
  lines: CartLine[];
  locale: Locale;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
  orderingEnabled: boolean;
  testMode: boolean;
  banner: StorefrontBanner | null;
}) {
  const t = copy[locale];
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  if (!lines.length) {
    return <div className="flex min-h-72 flex-col gap-4 overflow-y-auto px-4 py-4">{banner ? <CartBanner banner={banner} locale={locale} /> : null}<div className="grid flex-1 place-items-center px-2 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-sky-50 text-primary"><ShoppingBag className="size-7" aria-hidden="true" /></span><p className="mt-4 text-base font-black">{t.emptyCart}</p><p className="mx-auto mt-2 max-w-60 text-xs leading-5 text-muted-foreground">{t.emptyHint}</p></div></div></div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {banner ? <CartBanner banner={banner} locale={locale} /> : null}
        {lines.map((line) => (
          <div key={line.key} className="rounded-2xl border border-sky-100 bg-white p-3">
            <div className="flex gap-3">
              <div className="relative size-15 shrink-0 overflow-hidden rounded-xl bg-muted">{line.imageSrc ? <Image src={line.imageSrc} alt="" fill sizes="60px" className="object-cover" /> : <Waves className="absolute inset-0 m-auto size-5 text-primary/30" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{line.itemName}</p>{line.variantLabel || line.modifierLabels.length ? <p className="mt-1 line-clamp-2 text-[.68rem] leading-4 text-muted-foreground">{[line.variantLabel, ...line.modifierLabels].filter(Boolean).join(" · ")}</p> : null}<p className="mt-1 text-xs font-black text-primary">{formatPrice(line.unitPrice * line.quantity, locale)}</p></div>
              <button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${line.itemName}`} onClick={() => onRemove(line.key)}><X className="size-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-3 flex w-fit items-center rounded-lg border bg-muted/35 p-0.5">
              <Button size="icon-sm" variant="ghost" className="size-8" aria-label="Decrease quantity" onClick={() => onQuantity(line.key, line.quantity - 1)}><Minus aria-hidden="true" /></Button>
              <span className="w-8 text-center text-xs font-black">{line.quantity}</span>
              <Button size="icon-sm" variant="ghost" className="size-8" aria-label="Increase quantity" onClick={() => onQuantity(line.key, line.quantity + 1)}><Plus aria-hidden="true" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t bg-white p-4">
        <div className="flex items-center justify-between text-sm font-black"><span>{t.subtotal}</span><span>{formatPrice(subtotal, locale)}</span></div>
        <div className="mt-2 flex items-start justify-between gap-4 text-[.7rem] text-muted-foreground"><span>{t.deliveryFee}</span><span className="text-right">{t.calculated}</span></div>
        <Button className="mt-4 min-h-12 w-full" disabled={!orderingEnabled} onClick={onCheckout}>{orderingEnabled ? (testMode ? t.testCheckout : t.checkout) : t.unavailable}<ArrowRight aria-hidden="true" /></Button>
      </div>
    </div>
  );
}

const initialCheckout: Record<keyof CheckoutDetails, string> = { fullName: "", sector: "", road: "", house: "", flat: "", phone: "", notes: "" };

function CheckoutDialog({ open, onOpenChange, locale, lines, mode, requiresTurnstile }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  lines: CartLine[];
  mode: "test" | "live";
  requiresTurnstile: boolean;
}) {
  const t = copy[locale];
  const router = useRouter();
  const [values, setValues] = useState(initialCheckout);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const update = (key: keyof CheckoutDetails, value: string) => {
    const normalizedValue = normalizeCheckoutInput(key, value);
    setValues((current) => ({ ...current, [key]: normalizedValue }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleConstrainedKeyDown = (key: keyof CheckoutDetails, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;

    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextValue = `${input.value.slice(0, selectionStart)}${event.key}${input.value.slice(selectionEnd)}`;

    if (nextValue !== normalizeCheckoutInput(key, nextValue)) event.preventDefault();
  };

  const handleConstrainedPaste = (key: keyof CheckoutDetails, event: React.ClipboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const pastedText = event.clipboardData.getData("text");
    const nextValue = `${input.value.slice(0, selectionStart)}${pastedText}${input.value.slice(selectionEnd)}`;
    const normalizedValue = normalizeCheckoutInput(key, nextValue);

    if (nextValue === normalizedValue) return;

    event.preventDefault();
    update(key, normalizedValue);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = checkoutSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
      setErrors(nextErrors);
      return;
    }
    if (requiresTurnstile && (!turnstileSiteKey || !turnstileToken)) {
      setSubmitError("Complete the security check before placing your order.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createOrder({ locale, customer: parsed.data, expectedSubtotalMinor: Math.round(lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0) * 100), turnstileToken: turnstileToken ?? undefined, lines: lines.map((line) => ({ menuItemId: line.itemId, variantId: line.variantId, modifierOptionIds: line.modifierOptionIds, quantity: line.quantity })) });
      sessionStorage.setItem(`yamzo:tracking:${result.publicId}`, result.trackingToken);
      sessionStorage.setItem("yamzo:last-phone", parsed.data.phone);
      router.push(`/order-status?order=${encodeURIComponent(result.publicId)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We could not place your order.");
      if (requiresTurnstile) setTurnstileReset((current) => current + 1);
      setSubmitting(false);
    }
  };

  const fields: Array<{ key: keyof CheckoutDetails; label: string; autoComplete: string; type: "text" | "tel"; inputMode?: "numeric" | "tel"; placeholder: string; pattern?: string; maxLength?: number; constrained?: boolean }> = [
    { key: "fullName", label: t.name, autoComplete: "name", type: "text", placeholder: "Junaed Saimon", maxLength: 100 },
    { key: "sector", label: t.sector, autoComplete: "address-level3", type: "text", inputMode: "numeric", placeholder: "11", pattern: "[0-9]*", maxLength: 2, constrained: true },
    { key: "road", label: t.road, autoComplete: "address-line2", type: "text", inputMode: "numeric", placeholder: "20", pattern: "[0-9]*", maxLength: 30, constrained: true },
    { key: "house", label: t.house, autoComplete: "address-line1", type: "text", inputMode: "numeric", placeholder: "80", pattern: "[0-9]*", maxLength: 30, constrained: true },
    { key: "flat", label: t.flat, autoComplete: "address-line3", type: "text", placeholder: "3A", maxLength: 30 },
    { key: "phone", label: t.phone, autoComplete: "tel", type: "tel", inputMode: "tel", placeholder: "01XXXXXXXXX", pattern: "[+0-9]*", maxLength: 14, constrained: true },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-[39rem]">
        <DialogHeader className="text-left"><DialogTitle className={cn("text-2xl font-black tracking-[-.045em]", locale === "bn" && "font-bengali")}>{t.checkoutTitle}</DialogTitle><DialogDescription>{t.checkoutBody}</DialogDescription></DialogHeader>
        {mode === "test" ? <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900"><Sparkles className="size-4" aria-hidden="true" />{t.testMode}</div> : null}
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={cn("grid gap-1.5", field.key === "fullName" && "sm:col-span-2")}>
                <Label htmlFor={`checkout-${field.key}`}>{field.label}<span className="ml-1 text-destructive">*</span></Label>
                <Input id={`checkout-${field.key}`} name={field.key} type={field.type} value={values[field.key]} onChange={(event) => update(field.key, event.target.value)} onKeyDown={field.constrained ? (event) => handleConstrainedKeyDown(field.key, event) : undefined} onPaste={field.constrained ? (event) => handleConstrainedPaste(field.key, event) : undefined} autoComplete={field.autoComplete} inputMode={field.inputMode} pattern={field.pattern} maxLength={field.maxLength} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `checkout-${field.key}-error` : undefined} className="min-h-12" />
                {errors[field.key] ? <p id={`checkout-${field.key}-error`} className="text-xs font-semibold text-destructive">{errors[field.key]}</p> : null}
              </div>
            ))}
          </div>
          <div className="grid gap-1.5"><Label htmlFor="checkout-notes">{t.notes}</Label><Textarea id="checkout-notes" name="notes" value={values.notes} onChange={(event) => update("notes", event.target.value)} maxLength={300} className="min-h-20" placeholder="Allergies or delivery directions" /></div>
          {requiresTurnstile && turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} resetSignal={turnstileReset} onToken={setTurnstileToken} /> : null}
          {requiresTurnstile && !turnstileSiteKey ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-950">Secure public checkout is temporarily unavailable.</p> : null}
          {submitError ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">{submitError}</p> : null}
          <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-[.7rem] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{t.safe}</div>
          <Button type="submit" size="lg" className="min-h-12" disabled={submitting || (requiresTurnstile && (!turnstileSiteKey || !turnstileToken))}>{submitting ? t.placing : t.place}{submitting ? null : <ArrowRight aria-hidden="true" />}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Storefront({ access, reviews, catalog, merchandising }: {
  access: SiteAccess;
  reviews: GoogleReviewSnapshot;
  catalog: StorefrontCatalog;
  merchandising: StorefrontMerchandising;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const t = copy[locale];
  const menuCategories = catalog.categories;
  const menuItems = catalog.items;
  const modifierGroups = catalog.modifierGroups;
  const mode: "test" | "live" = access.runtime.live_orders_enabled ? "live" : "test";
  const orderingEnabled =
    access.backendReady &&
    catalog.source === "supabase" &&
    (access.ordering.accepting_live_orders ||
      (access.viewer.canPreview && access.ordering.accepting_test_orders));

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return menuItems.filter((item) => (category === "all" || item.categoryId === category) && (!normalized || `${item.name.en} ${item.description.en}`.toLowerCase().includes(normalized)));
  }, [category, menuItems, query]);
  const popular = menuItems.filter((item) => item.popular).slice(0, 6);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const heroBanner = merchandising.banners.find((banner) => banner.placement === "hero") ?? null;
  const announcementBanners = merchandising.banners.filter(
    (banner) => banner.placement === "announcement",
  );
  const cartBanner = merchandising.banners.find((banner) => banner.placement === "cart") ?? null;
  const singletonKinds = new Set<StorefrontHomeSection["kind"]>([
    "banner",
    "menu",
    "reviews",
  ]);
  const renderedSingletonKinds = new Set<StorefrontHomeSection["kind"]>();
  const homeSections = merchandising.homeSections.filter((section) => {
    if (!singletonKinds.has(section.kind)) return true;
    if (renderedSingletonKinds.has(section.kind)) return false;
    renderedSingletonKinds.add(section.kind);
    return true;
  });
  const hasHeroSection = homeSections.some((section) => section.kind === "banner");
  const hasMenuSection = homeSections.some((section) => section.kind === "menu");

  const addToCart = (item: MenuItem, selection: ProductSelection) => {
    const variant = item.pricing.kind === "variants" ? item.pricing.variants.find((entry) => entry.id === selection.variantId) : null;
    const selectedOptions = modifierGroups.flatMap((group) => group.options).filter((option) => selection.modifierOptionIds.includes(option.id));
    const unitPrice = (item.pricing.kind === "fixed" ? item.pricing.price : variant?.price ?? getMenuItemStartingPrice(item)) + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const key = [item.id, selection.variantId ?? "fixed", ...selection.modifierOptionIds.slice().sort()].join(":");
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => line.key === key ? { ...line, quantity: Math.min(20, line.quantity + selection.quantity) } : line);
      return [...current, { key, itemId: item.id, itemName: getLocalizedText(item.name, locale), imageSrc: item.image?.src ?? null, variantId: variant?.id ?? null, variantLabel: variant ? getLocalizedText(variant.label, locale) : null, modifierOptionIds: selectedOptions.map((option) => option.id), modifierLabels: selectedOptions.map((option) => getLocalizedText(option.label, locale)), unitPrice, quantity: selection.quantity }];
    });
  };
  const updateQuantity = (key: string, quantity: number) => setCart((current) => quantity <= 0 ? current.filter((line) => line.key !== key) : current.map((line) => line.key === key ? { ...line, quantity: Math.min(20, quantity) } : line));

  return (
    <div lang={locale} className={cn("min-h-svh bg-[#f6fbfe]", locale === "bn" && "font-bengali")}>
      {access.viewer.canPreview && !access.runtime.site_published ? <div className="bg-[#ffd12d] px-4 py-2 text-center text-xs font-extrabold text-[#473100]"><span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden="true" />{t.preview} · The public still sees Coming Soon</span></div> : null}
      <StoreHeader
        locale={locale}
        setLocale={setLocale}
        itemCount={itemCount}
        onOpenCart={() => setMobileCartOpen(true)}
        showMenu={hasMenuSection}
      />
      <main>
        {!hasHeroSection ? <ServiceAssurances locale={locale} /> : null}
        {homeSections.map((section) => (
          <Fragment key={section.id}>
            {section.kind === "banner" ? (
              <>
                <Hero
                  locale={locale}
                  reviews={reviews}
                  access={access}
                  banner={heroBanner}
                  section={section}
                  showMenu={hasMenuSection}
                />
                <ServiceAssurances locale={locale} />
                <AnnouncementBanners banners={announcementBanners} locale={locale} />
              </>
            ) : null}

            {section.kind === "offers" ? (
              <OffersSection
                offers={merchandising.offers}
                section={section}
                locale={locale}
              />
            ) : null}

            {section.kind === "categories" ? (
              <CategoryHighlights
                section={section}
                categories={menuCategories}
                popular={popular}
                locale={locale}
                onOpen={setSelectedItem}
                onCategory={setCategory}
                showMenu={hasMenuSection}
              />
            ) : null}

            {section.kind === "menu" ? (
        <section id="menu" className="scroll-mt-20 border-t border-sky-100 bg-white" aria-labelledby={`home-section-${section.id}`}>
          <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.14em] text-primary">{locale === "bn" ? t.fullMenu : "Everything Yamzo"}</p>
                <h2 id={`home-section-${section.id}`} className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{localizedOr(section.title, locale, t.fullMenu)}</h2>
                {getLocalizedText(section.subtitle, locale) ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{getLocalizedText(section.subtitle, locale)}</p> : null}
              </div>
              <div className="relative w-full lg:max-w-sm"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} className="min-h-12 rounded-xl bg-[#f6fbfe] pl-10" /></div>
            </div>
            <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" aria-label={locale === "bn" ? t.menu : "Menu categories"}>
              <Button type="button" aria-pressed={category === "all"} variant={category === "all" ? "default" : "outline"} className="min-h-11 shrink-0 rounded-full" onClick={() => setCategory("all")}>{t.all}</Button>
              {menuCategories.map((entry) => <Button type="button" aria-pressed={category === entry.id} key={entry.id} variant={category === entry.id ? "default" : "outline"} className="min-h-11 shrink-0 rounded-full" onClick={() => setCategory(entry.id)}>{getLocalizedText(entry.name, locale)}</Button>)}
            </nav>
            <p className="mt-3 text-xs font-semibold text-muted-foreground" aria-live="polite">{filteredItems.length} {filteredItems.length === 1 ? t.result : t.results}</p>

            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div>
                {filteredItems.length ? <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">{filteredItems.map((item) => <ProductCard key={item.id} item={item} locale={locale} onOpen={setSelectedItem} />)}</div> : <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed bg-muted/25 text-center"><div><Search className="mx-auto size-7 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-extrabold">{t.noResults}</p><Button variant="link" onClick={() => { setQuery(""); setCategory("all"); }}>Clear search</Button></div></div>}
              </div>
              <aside id="cart" className="sticky top-22 hidden h-[calc(100svh-7rem)] max-h-[43rem] overflow-hidden rounded-3xl border border-sky-100 bg-[#f9fdff] shadow-[0_18px_55px_rgba(8,42,68,.09)] lg:flex lg:flex-col" aria-label={t.cart}>
                <div className="flex items-center justify-between border-b bg-white px-4 py-4"><div><p className="text-base font-black">{t.cart}</p><p className="mt-0.5 text-[.68rem] text-muted-foreground">{itemCount} {itemCount === 1 ? t.result : t.results}</p></div><span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><ShoppingBag className="size-5" aria-hidden="true" /></span></div>
                <CartContents lines={cart} locale={locale} onQuantity={updateQuantity} onRemove={(key) => setCart((current) => current.filter((line) => line.key !== key))} onCheckout={() => setCheckoutOpen(true)} orderingEnabled={orderingEnabled} testMode={mode === "test"} banner={cartBanner} />
              </aside>
            </div>
          </div>
        </section>
            ) : null}

            {section.kind === "reviews" ? (
              <ReviewCarousel locale={locale} snapshot={reviews} section={section} />
            ) : null}
          </Fragment>
        ))}

        <section className="bg-[#032f4f] text-white">
          <div className="mx-auto grid max-w-[90rem] gap-7 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
            <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-sky-200">Your order, in view</p><h2 className="mt-2 max-w-xl text-3xl font-black tracking-[-.05em] sm:text-4xl">From accepted to ready—follow every kitchen update.</h2></div>
            <Button asChild size="lg" className="min-h-12 bg-white text-[#082a44] hover:bg-sky-50"><Link href="/order-status">{t.track}<ArrowRight aria-hidden="true" /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t bg-white"><div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div className="flex items-center gap-2"><Image src="/brand/yamzo-logo.png" alt="" width={36} height={36} className="size-9 rounded-lg object-contain" /><div><p className="font-extrabold text-foreground">Yamzo Uttara</p><p className="mt-0.5">House 80, Road 20, Sector 11, Uttara</p></div></div><div className="flex flex-wrap gap-5"><a href="tel:+8801761737584" className="min-h-11 content-center hover:text-primary">01761-737584</a><Link href="/login?next=/" className="min-h-11 content-center hover:text-primary">Account</Link><Link href="/order-status" className="min-h-11 content-center hover:text-primary">Order status</Link><Link href="/privacy" className="min-h-11 content-center hover:text-primary">Privacy</Link><Link href="/terms" className="min-h-11 content-center hover:text-primary">Terms</Link></div></div></footer>

      <AnimatePresence>{itemCount > 0 ? <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed inset-x-3 bottom-3 z-40 lg:hidden"><Button size="lg" className="min-h-14 w-full justify-between rounded-2xl px-4 shadow-[0_16px_45px_rgba(8,42,68,.28)]" onClick={() => setMobileCartOpen(true)}><span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-white/18 text-xs font-black">{itemCount}</span>{t.cart}</span><span>{formatPrice(subtotal, locale)}<ChevronRight className="ml-1 inline size-4" aria-hidden="true" /></span></Button></motion.div> : null}</AnimatePresence>

      <ProductDialog item={selectedItem} locale={locale} open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} onAdd={addToCart} modifierGroups={modifierGroups} />
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}><SheetContent side="bottom" className="flex max-h-[88svh] min-h-[30rem] flex-col rounded-t-[1.7rem] p-0"><SheetHeader className="border-b px-5 py-4 text-left"><SheetTitle>{t.cart}</SheetTitle><SheetDescription>{itemCount} {itemCount === 1 ? t.result : t.results}</SheetDescription></SheetHeader><CartContents lines={cart} locale={locale} onQuantity={updateQuantity} onRemove={(key) => setCart((current) => current.filter((line) => line.key !== key))} onCheckout={() => { setMobileCartOpen(false); setCheckoutOpen(true); }} orderingEnabled={orderingEnabled} testMode={mode === "test"} banner={cartBanner} /></SheetContent></Sheet>
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} locale={locale} lines={cart} mode={mode} requiresTurnstile={!access.viewer.isAuthenticated} />
    </div>
  );
}
