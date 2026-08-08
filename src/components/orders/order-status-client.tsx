"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock3,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { normalizeBangladeshPhoneInput } from "@/lib/orders/checkout-input";
import type { OrderStatus, OrderSummary } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

const activeSteps: Array<{ status: OrderStatus; label: string; detail: string; icon: typeof Check }> = [
  { status: "pending_acceptance", label: "Sent to Yamzo", detail: "Waiting for the team to accept", icon: Clock3 },
  { status: "accepted", label: "Accepted", detail: "Your order is confirmed", icon: Check },
  { status: "preparing", label: "Cooking", detail: "The kitchen is preparing it", icon: ChefHat },
  { status: "ready", label: "Ready", detail: "Packed and ready to leave", icon: PackageCheck },
  { status: "out_for_delivery", label: "On the way", detail: "Heading to your Uttara address", icon: Truck },
  { status: "delivered", label: "Delivered", detail: "Enjoy your food", icon: MapPin },
];

const statusRank = new Map<OrderStatus, number>(activeSteps.map((step, index) => [step.status, index]));

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(value));
}

type PhoneLookupHint = {
  referenceHint: string;
  status: OrderStatus;
  mode: "test" | "live";
  placedAt: string;
};

type LookupResponse = {
  orders: OrderSummary[];
  latest: PhoneLookupHint | null;
};

export function OrderStatusClient({
  initialOrder,
  authenticated,
  turnstileSiteKey,
}: {
  initialOrder: string | null;
  authenticated: boolean;
  turnstileSiteKey: string | null;
}) {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [latestHint, setLatestHint] = useState<PhoneLookupHint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialOrder);
  const [loading, setLoading] = useState(Boolean(initialOrder));
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const selected = useMemo(() => orders.find((order) => order.publicId === selectedId) ?? orders[0] ?? null, [orders, selectedId]);

  const fetchTrackedOrder = useCallback(async (publicId: string, silent = false) => {
    const token = sessionStorage.getItem(`yamzo:tracking:${publicId}`);
    if (!token) {
      if (!silent) setError("This browser does not have the secure tracking key for that guest order. Sign in or use the same browser that placed it.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(publicId)}`, { headers: { "x-yamzo-tracking-token": token }, cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { order?: OrderSummary; message?: string };
      if (!response.ok || !body.order) throw new Error(body.message ?? "We could not find that order.");
      setOrders((current) => [body.order!, ...current.filter((order) => order.publicId !== body.order!.publicId)]);
      setSelectedId(body.order.publicId);
      setError(null);
    } catch (fetchError) {
      if (!silent) setError(fetchError instanceof Error ? fetchError.message : "We could not load the order.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const lastPhone = sessionStorage.getItem("yamzo:last-phone");
      if (lastPhone) setPhone(normalizeBangladeshPhoneInput(lastPhone));
      if (initialOrder) void fetchTrackedOrder(initialOrder);
    });
    const timer = initialOrder
      ? window.setInterval(() => void fetchTrackedOrder(initialOrder, true), 15_000)
      : null;
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer) window.clearInterval(timer);
    };
  }, [fetchTrackedOrder, initialOrder]);

  const lookup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setLatestHint(null);

    if (!authenticated && (!turnstileSiteKey || !turnstileToken)) {
      setError("Complete the security check before looking up an order.");
      setLoading(false);
      return;
    }

    try {
      const trackingTokens = Object.keys(sessionStorage)
        .filter((key) => key.startsWith("yamzo:tracking:"))
        .map((key) => ({ publicId: key.slice("yamzo:tracking:".length), token: sessionStorage.getItem(key) }))
        .filter((entry): entry is { publicId: string; token: string } => Boolean(entry.token));
      const response = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          trackingTokens,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as LookupResponse & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "We could not look up your orders.");
      setOrders(body.orders ?? []);
      setLatestHint(body.latest ?? null);
      setSelectedId(body.orders?.[0]?.publicId ?? null);
      sessionStorage.setItem("yamzo:last-phone", phone);
      if (!body.orders?.length && !body.latest) {
        setError("No recent order was found for that number.");
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "We could not look up your orders.");
    } finally {
      if (!authenticated) setTurnstileReset((value) => value + 1);
      setLoading(false);
    }
  };

  const currentRank = selected ? (statusRank.get(selected.status) ?? -1) : -1;
  const terminalFailure = selected?.status === "rejected" || selected?.status === "cancelled";

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_right,rgba(34,168,221,.14),transparent_28%),#f6fbfe]">
      <header className="border-b bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-17 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-xl"><Image src="/brand/yamzo-logo.png" alt="Yamzo Uttara" width={46} height={46} className="size-11 rounded-xl object-contain" /><span className="text-sm font-black">Yamzo Uttara</span></Link>
          <Button asChild variant="ghost"><Link href="/"><ArrowLeft aria-hidden="true" />Back to menu</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-12">
        <div className="grid gap-7 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside>
            <p className="text-xs font-extrabold uppercase tracking-[.15em] text-primary">Live order updates</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.055em]">Track your Yamzo order.</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Use the phone number from checkout for the latest status. Full guest history stays protected on the browser that placed the order; signing in keeps account orders available across devices.</p>

            <Card className="mt-6 border-sky-100 shadow-[0_12px_40px_rgba(8,42,68,.07)]">
              <CardContent>
                <form onSubmit={lookup} className="grid gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="order-phone">Phone number</Label><div className="relative"><Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="order-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(normalizeBangladeshPhoneInput(event.target.value))} placeholder="01XXXXXXXXX" required className="min-h-12 pl-9" /></div></div>
                  {!authenticated && turnstileSiteKey ? (
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      action="order_lookup"
                      resetSignal={turnstileReset}
                      onToken={setTurnstileToken}
                    />
                  ) : null}
                  {!authenticated && !turnstileSiteKey ? (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-950">
                      Secure phone lookup is temporarily unavailable.
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="min-h-12"
                    disabled={
                      loading ||
                      (!authenticated && (!turnstileSiteKey || !turnstileToken))
                    }
                  >
                    {loading ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                    {loading ? "Checking…" : "Find my orders"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {orders.length > 1 ? <div className="mt-5"><p className="mb-2 text-xs font-extrabold text-muted-foreground">ORDER HISTORY</p><div className="grid gap-2">{orders.map((order) => <button key={order.publicId} type="button" onClick={() => setSelectedId(order.publicId)} className={cn("flex min-h-14 items-center justify-between rounded-xl border bg-white px-3 text-left", selected?.publicId === order.publicId && "border-primary ring-1 ring-primary")}><span><span className="block text-xs font-black">#{order.orderNumber}</span><span className="mt-0.5 block text-[.68rem] text-muted-foreground">{formatTime(order.placedAt)}</span></span><Badge variant="secondary">{order.status.replaceAll("_", " ")}</Badge></button>)}</div></div> : null}
          </aside>

          <section aria-live="polite">
            {error ? <div role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{error}</div> : null}
            {!selected ? (
              latestHint ? (
                <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_20px_60px_rgba(8,42,68,.09)]">
                  <div className="bg-[#032f4f] p-6 text-white sm:p-8">
                    <Badge className={cn("border-0", latestHint.mode === "test" ? "bg-[#ffd12d] text-[#493200]" : "bg-emerald-100 text-emerald-900")}>
                      {latestHint.mode === "test" ? "Test order" : "Live order"}
                    </Badge>
                    <p className="mt-5 text-xs font-bold text-sky-200">
                      LATEST ORDER ENDING {latestHint.referenceHint}
                    </p>
                    <h2 className="mt-2 text-3xl font-black tracking-[-.04em] capitalize">
                      {latestHint.status.replaceAll("_", " ")}
                    </h2>
                    <p className="mt-2 text-sm text-white/65">
                      Placed {formatTime(latestHint.placedAt)}
                    </p>
                  </div>
                  <div className="p-6 sm:p-8">
                    <p className="text-sm leading-6 text-muted-foreground">
                      For privacy, phone lookup shows only the latest status and a partial reference. Use the original browser tracking link or sign in to view full order history.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[31rem] place-items-center rounded-3xl border border-dashed border-sky-200 bg-white/60 p-6 text-center"><div><span className="mx-auto grid size-18 place-items-center rounded-3xl bg-sky-50 text-primary"><ShoppingBag className="size-8" aria-hidden="true" /></span><h2 className="mt-5 text-xl font-black">Your kitchen updates will appear here.</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Enter your checkout phone number, or return here immediately after placing an order.</p></div></div>
              )
            ) : (
              <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_20px_60px_rgba(8,42,68,.09)]">
                <div className="bg-[#032f4f] p-5 text-white sm:p-7">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold text-sky-200">ORDER #{selected.orderNumber}</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{terminalFailure ? `Order ${selected.status}` : activeSteps[Math.max(0, currentRank)]?.label ?? "Order received"}</h2><p className="mt-2 text-sm text-white/65">Placed {formatTime(selected.placedAt)}</p></div><div className="flex gap-2"><Badge className={cn("border-0", selected.mode === "test" ? "bg-[#ffd12d] text-[#493200]" : "bg-emerald-100 text-emerald-900")}><Sparkles aria-hidden="true" />{selected.mode === "test" ? "Test order" : "Live order"}</Badge><Button size="icon-sm" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white hover:text-[#082a44]" aria-label="Refresh order" onClick={() => void fetchTrackedOrder(selected.publicId)}><RefreshCw aria-hidden="true" /></Button></div></div>
                  <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/12 pt-5 text-xs"><div><p className="text-white/55">Total</p><p className="mt-1 font-black">{formatMoney(selected.total)}</p></div><div><p className="text-white/55">Items</p><p className="mt-1 font-black">{selected.itemCount}</p></div><div><p className="text-white/55">Phone</p><p className="mt-1 font-black">{selected.phoneMasked}</p></div></div>
                </div>

                {terminalFailure ? <div className="p-6 sm:p-8"><div className="rounded-2xl bg-destructive/8 p-5"><p className="font-black text-destructive">This order was {selected.status}.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Call Yamzo at <a className="font-bold text-primary underline" href="tel:+8801761737584">01761-737584</a> if you need help.</p></div></div> : (
                  <ol className="p-5 sm:p-8">
                    {activeSteps.map((step, index) => {
                      const complete = index <= currentRank;
                      const current = index === currentRank;
                      const Icon = step.icon;
                      return <li key={step.status} className="relative flex gap-4 pb-7 last:pb-0">{index < activeSteps.length - 1 ? <span className={cn("absolute left-[1.1rem] top-9 h-[calc(100%-1.25rem)] w-0.5", index < currentRank ? "bg-primary" : "bg-sky-100")} aria-hidden="true" /> : null}<span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 bg-white", complete ? "border-primary bg-primary text-white" : "border-sky-100 text-muted-foreground", current && "ring-4 ring-primary/10")}><Icon className="size-4" aria-hidden="true" /></span><div className="pt-0.5"><p className={cn("text-sm font-black", !complete && "text-muted-foreground")}>{step.label}</p><p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>{current ? <Badge variant="secondary" className="mt-2">Current status</Badge> : null}</div></li>;
                    })}
                  </ol>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
