"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ClipboardList, LockKeyhole, Radio, Volume2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getAdminOrderArrivalsAction } from "@/app/admin/actions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type {
  ActiveAdminViewer,
  AdminDashboardSnapshot,
  AdminOrderArrivalCursor,
  AdminOrderSummary,
} from "@/lib/admin/types";

const statusLabels = {
  placed: "Placed",
  pending_acceptance: "Awaiting acceptance",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
} as const;

function formatMoney(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(value / 100);
  } catch {
    return `${currencyCode} ${Math.round(value / 100)}`;
  }
}

function formatPlacedAt(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function newestCursor(orders: AdminOrderSummary[]): AdminOrderArrivalCursor | null {
  const newest = orders.reduce<AdminOrderSummary | null>((current, order) => {
    if (!current) return order;
    if (order.placedAt > current.placedAt) return order;
    if (order.placedAt === current.placedAt && order.orderId > current.orderId) {
      return order;
    }
    return current;
  }, null);

  return newest
    ? { placedAt: newest.placedAt, orderId: newest.orderId }
    : null;
}

function playArrivalTone() {
  if (typeof window === "undefined") return;

  try {
    const BrowserAudioContext =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!BrowserAudioContext) return;

    const context = new BrowserAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.44);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers may require a prior user gesture. The visual queue remains the
    // reliable notification path when audio is unavailable.
  }
}

export function AdminOrderQueue({
  viewer,
  snapshot,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  const router = useRouter();
  const [arrivals, setArrivals] = useState<AdminOrderSummary[]>([]);
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false);
  const cursorRef = useRef<AdminOrderArrivalCursor | null>(
    newestCursor(snapshot.orderQueue),
  );
  const queuedIdsRef = useRef(new Set<string>());
  const pollingRef = useRef(false);
  const initializedSnapshotRef = useRef(snapshot.generatedAt);
  const unavailable = snapshot.orderQueueAvailability !== "ready";
  const canReadOrders = viewer.permissions.includes("orders.read");
  const currentArrivals = useMemo(
    () =>
      snapshot.orderQueue
        .filter(
          (order) =>
            order.status === "pending_acceptance" && order.archivedAt === null,
        )
        .slice(0, 4),
    [snapshot.orderQueue],
  );

  useEffect(() => {
    if (initializedSnapshotRef.current === snapshot.generatedAt) return;
    initializedSnapshotRef.current = snapshot.generatedAt;
    cursorRef.current = newestCursor(snapshot.orderQueue);
  }, [snapshot.generatedAt, snapshot.orderQueue]);

  useEffect(() => {
    if (unavailable || !canReadOrders) return;

    let active = true;
    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const result = await getAdminOrderArrivalsAction(cursorRef.current);
        if (!active || result.status !== "success" || result.arrivals.length === 0) {
          return;
        }

        const newest = result.arrivals.at(-1);
        if (newest) {
          cursorRef.current = {
            placedAt: newest.placedAt,
            orderId: newest.orderId,
          };
        }

        const additions = result.arrivals.filter(
          (order) => !queuedIdsRef.current.has(order.orderId),
        );
        if (additions.length === 0) return;
        additions.forEach((order) => queuedIdsRef.current.add(order.orderId));
        setArrivals((existing) => [...existing, ...additions]);
        playArrivalTone();
        setArrivalDialogOpen(true);
      } finally {
        pollingRef.current = false;
      }
    };

    const interval = window.setInterval(() => void poll(), 8_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canReadOrders, unavailable]);

  const activeArrival = arrivals[0] ?? null;

  function dismissActiveArrival() {
    setArrivals((queue) => queue.slice(1));
    setArrivalDialogOpen(arrivals.length > 1);
  }

  function reviewActiveArrival() {
    if (!activeArrival) return;
    setArrivalDialogOpen(false);
    router.push(`/admin/orders?order=${encodeURIComponent(activeArrival.orderId)}`);
  }

  return (
    <>
      <Card
        id="orders"
        className="scroll-mt-32 rounded-2xl bg-white shadow-sm"
        aria-labelledby="order-arrivals-title"
      >
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle id="order-arrivals-title" className="text-lg font-bold">
                Current arrivals
              </CardTitle>
              <CardDescription className="mt-1 leading-5">
                A compact, contact-free queue. Open the protected Orders workspace
                to review, edit, or archive an order.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  snapshot.orderQueueAvailability === "ready" ? "default" : "outline"
                }
              >
                <Radio aria-hidden="true" />
                {snapshot.orderQueueAvailability === "ready"
                  ? "Monitoring"
                  : snapshot.orderQueueAvailability === "permission_required"
                    ? "Restricted"
                    : "Unavailable"}
              </Badge>
              {canReadOrders ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/orders">Open orders</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {unavailable ? (
            <Empty className="min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {snapshot.orderQueueAvailability === "permission_required" ? (
                    <LockKeyhole aria-hidden="true" />
                  ) : (
                    <ClipboardList aria-hidden="true" />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {snapshot.orderQueueAvailability === "permission_required"
                    ? "Order permission required"
                    : "Order data is safely unavailable"}
                </EmptyTitle>
                <EmptyDescription>
                  {snapshot.orderQueueAvailability === "permission_required"
                    ? "Your assigned role does not include orders.read."
                    : "No unverified fallback data will be shown. Try again once the protected backend is available."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : currentArrivals.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              No orders are awaiting acceptance. Incoming website orders will ring and
              appear here without loading customer contact details.
            </div>
          ) : (
            <ul className="grid gap-2" aria-label="Orders awaiting acceptance">
              {currentArrivals.map((order) => (
                <li
                  key={order.orderId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{order.orderReference}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPlacedAt(order.placedAt)} · {order.mode === "test" ? "Test" : "Live"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={order.mode === "test" ? "secondary" : "outline"}>
                      {statusLabels[order.status]}
                    </Badge>
                    <span className="text-sm font-bold">
                      {formatMoney(order.grandTotalMinor, order.currencyCode)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(activeArrival) && arrivalDialogOpen}
        onOpenChange={setArrivalDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary">
              <BellRing aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>New website order</AlertDialogTitle>
            <AlertDialogDescription>
              {activeArrival
                ? `${activeArrival.orderReference} is awaiting review. ${arrivals.length > 1 ? `${arrivals.length - 1} more order${arrivals.length - 1 === 1 ? " is" : "s are"} queued behind it.` : ""}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {activeArrival ? (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{activeArrival.mode === "test" ? "Test order" : "Live order"}</span>
                <span className="font-bold">
                  {formatMoney(activeArrival.grandTotalMinor, activeArrival.currencyCode)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Customer details remain protected until an authorized staff member opens the order.
              </p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={dismissActiveArrival}>
              Review later
            </Button>
            <Button type="button" onClick={reviewActiveArrival}>
              <Volume2 aria-hidden="true" />
              Review order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
