"use client";

import { useActionState } from "react";
import { ClipboardList, LockKeyhole, Radio } from "lucide-react";

import { transitionOrderAction } from "@/app/admin/actions";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ActiveAdminViewer,
  AdminDashboardSnapshot,
  AdminOrderStatus,
} from "@/lib/admin/types";
import { initialAdminActionState } from "@/lib/admin/action-state";

const statusLabels: Record<AdminOrderStatus, string> = {
  placed: "Placed",
  pending_acceptance: "Awaiting acceptance",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const nextStatuses: Record<AdminOrderStatus, AdminOrderStatus[]> = {
  placed: ["pending_acceptance", "cancelled"],
  pending_acceptance: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminOrderQueue({
  viewer,
  snapshot,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  const [state, formAction, pending] = useActionState(
    transitionOrderAction,
    initialAdminActionState,
  );
  const unavailable = snapshot.orderQueueAvailability !== "ready";
  const canTransition = viewer.permissions.includes("orders.transition");

  return (
    <Card
      id="orders"
      className="scroll-mt-32 rounded-2xl bg-white shadow-sm"
      aria-labelledby="order-queue-title"
    >
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle id="order-queue-title" className="text-lg font-bold">
              Website order queue
            </CardTitle>
            <CardDescription className="mt-1 leading-5">
              Recent live and test orders. Customer contact details are never loaded
              in this overview.
            </CardDescription>
          </div>
          <Badge
            variant={
              snapshot.orderQueueAvailability === "ready" ? "default" : "outline"
            }
          >
            <Radio aria-hidden="true" />
            {snapshot.orderQueueAvailability === "ready"
              ? "Synced"
              : snapshot.orderQueueAvailability === "permission_required"
                ? "Restricted"
                : "Unavailable"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {state.message ? (
          <p
            aria-live="polite"
            className={
              state.status === "error"
                ? "my-3 rounded-xl bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive"
                : "my-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
            }
          >
            {state.message}
          </p>
        ) : null}
        {unavailable ? (
          <Empty className="min-h-64 border">
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
                  : "No unverified fallback data will be shown. Try again after the backend connection is ready."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : snapshot.orderQueue.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No website orders yet</EmptyTitle>
              <EmptyDescription>
                New orders will appear here after checkout and continue into the POS
                operations queue.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.orderQueue.map((order) => (
                <TableRow key={order.orderId}>
                  <TableCell className="font-semibold">
                    {order.orderReference}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.status === "rejected" || order.status === "cancelled"
                          ? "destructive"
                          : order.status === "delivered"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {statusLabels[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.mode === "test" ? "secondary" : "default"}>
                      {order.mode === "test" ? "Test" : "Live"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPlacedAt(order.placedAt)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoney(order.grandTotalMinor, order.currencyCode)}
                  </TableCell>
                  <TableCell className="min-w-64">
                    {canTransition && nextStatuses[order.status].length > 0 ? (
                      <form action={formAction} className="grid gap-2">
                        <input type="hidden" name="orderId" value={order.orderId} />
                        <input
                          type="hidden"
                          name="expectedVersion"
                          value={order.version}
                        />
                        <label className="sr-only" htmlFor={`status-${order.orderId}`}>
                          New status for {order.orderReference}
                        </label>
                        <select
                          id={`status-${order.orderId}`}
                          name="toStatus"
                          disabled={pending}
                          className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm font-semibold"
                        >
                          {nextStatuses[order.status].map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                        <Input
                          name="note"
                          maxLength={500}
                          disabled={pending}
                          placeholder="Audit note (optional)"
                          aria-label={`Audit note for ${order.orderReference}`}
                        />
                        <Button size="sm" disabled={pending}>
                          {pending ? "Saving…" : "Update status"}
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {canTransition ? "Final status" : "Permission required"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
