"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ClipboardList,
  History,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  archiveLiveWebsiteOrderAction,
  getAdminOrderDetailAction,
  getAdminOrderHistoryPageAction,
  updateWebsiteOrderAction,
} from "@/app/admin/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_ORDER_STATUSES,
  type ActiveAdminViewer,
  type AdminOrderDetail,
  type AdminOrderLineItem,
  type AdminOrderModifier,
  type AdminOrderStatus,
  type AdminOrderSummary,
  type AdminOrderWorkspaceSnapshot,
} from "@/lib/admin/types";

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

type EditableOrderItem = {
  clientId: string;
  sourceItemId: string | null;
  itemNameEn: string;
  itemNameBn: string;
  quantity: number;
  unitPriceMinor: number;
  customerNote: string | null;
  modifiers: AdminOrderModifier[];
};

type OrderDraft = {
  status: AdminOrderStatus;
  discountMinor: number;
  deliveryFeeMinor: number;
  note: string;
  items: EditableOrderItem[];
  itemsDirty: boolean;
};

function formatMoney(value: number, currencyCode = "BDT") {
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

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusVariant(status: AdminOrderStatus) {
  if (status === "rejected" || status === "cancelled") return "destructive" as const;
  if (status === "delivered") return "secondary" as const;
  return "outline" as const;
}

function toEditableItem(item: AdminOrderLineItem): EditableOrderItem {
  return {
    clientId: item.id,
    sourceItemId: item.sourceItemId,
    itemNameEn: item.nameEn,
    itemNameBn: item.nameBn,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    customerNote: item.customerNote,
    modifiers: item.modifiers,
  };
}

function createDraft(detail: AdminOrderDetail): OrderDraft {
  return {
    status: detail.status,
    discountMinor: detail.discountMinor,
    deliveryFeeMinor: detail.deliveryFeeMinor,
    note: "",
    items: detail.items.map(toEditableItem),
    itemsDirty: false,
  };
}

function asMinor(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1_000_000_000, Math.round(parsed * 100)));
}

function asQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(20, Math.trunc(parsed)));
}

function summaryMatches(
  order: AdminOrderSummary,
  query: string,
  status: string,
  mode: string,
) {
  const haystack = `${order.orderReference} ${order.status} ${order.mode}`.toLowerCase();
  return (
    (query.length === 0 || haystack.includes(query.toLowerCase())) &&
    (status === "all" || order.status === status) &&
    (mode === "all" || order.mode === mode)
  );
}

function OrderDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading protected order details"
      className="space-y-6 p-4 sm:p-6"
    >
      <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-3 rounded-2xl border p-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <span className="sr-only">Loading protected order details</span>
    </div>
  );
}

export function AdminOrderWorkspace({
  viewer,
  snapshot,
  initialOrderId,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminOrderWorkspaceSnapshot;
  initialOrderId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [olderOrders, setOlderOrders] = useState<AdminOrderSummary[]>([]);
  const [hasOlderOrders, setHasOlderOrders] = useState(
    snapshot.orders.length === 100,
  );
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialOrderId));
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");
  const [isLoadingDetail, startLoadingDetail] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isLoadingOlder, startLoadingOlder] = useTransition();
  const canManage = viewer.permissions.includes("orders.manage");

  const historyOrders = useMemo(() => {
    const byId = new Map<string, AdminOrderSummary>();
    for (const order of [...snapshot.orders, ...olderOrders]) {
      if (!byId.has(order.orderId)) byId.set(order.orderId, order);
    }
    return [...byId.values()].sort((left, right) => {
      if (left.placedAt !== right.placedAt) {
        return right.placedAt.localeCompare(left.placedAt);
      }
      return right.orderId.localeCompare(left.orderId);
    });
  }, [olderOrders, snapshot.orders]);

  const filteredOrders = useMemo(
    () =>
      historyOrders.filter((order) =>
        summaryMatches(order, query, statusFilter, modeFilter),
      ),
    [historyOrders, modeFilter, query, statusFilter],
  );

  const openOrder = useCallback((orderId: string) => {
    setDrawerOpen(true);
    setDetail(null);
    setDraft(null);
    setDetailError(null);
    setFeedback(null);
    startLoadingDetail(async () => {
      const result = await getAdminOrderDetailAction(orderId);
      if (result.status === "error") {
        setDetailError(result.message);
        return;
      }
      setDetail(result.detail);
      setDraft(createDraft(result.detail));
    });
  }, []);

  useEffect(() => {
    if (!initialOrderId) return;
    let active = true;

    void getAdminOrderDetailAction(initialOrderId).then((result) => {
      if (!active) return;
      setDrawerOpen(true);
      setDetailError(null);
      if (result.status === "error") {
        setDetailError(result.message);
        return;
      }
      setDetail(result.detail);
      setDraft(createDraft(result.detail));
    });

    return () => {
      active = false;
    };
  }, [initialOrderId]);

  const hasChanges = Boolean(
    detail &&
      draft &&
      (draft.status !== detail.status ||
        draft.discountMinor !== detail.discountMinor ||
        draft.deliveryFeeMinor !== detail.deliveryFeeMinor ||
        draft.itemsDirty),
  );
  const cancellationReasonRequired = Boolean(
    detail &&
      draft &&
      detail.status !== "cancelled" &&
      draft.status === "cancelled" &&
      draft.note.trim().length < 2,
  );

  function updateDraftItem(clientId: string, update: Partial<EditableOrderItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        itemsDirty: true,
        items: current.items.map((item) =>
          item.clientId === clientId ? { ...item, ...update } : item,
        ),
      };
    });
  }

  function removeDraftItem(clientId: string) {
    setDraft((current) => {
      if (!current || current.items.length <= 1) return current;
      return {
        ...current,
        itemsDirty: true,
        items: current.items.filter((item) => item.clientId !== clientId),
      };
    });
  }

  function addDraftItem() {
    setDraft((current) => {
      if (!current || current.items.length >= 60) return current;
      return {
        ...current,
        itemsDirty: true,
        items: [
          ...current.items,
          {
            clientId: `manual-${crypto.randomUUID()}`,
            sourceItemId: null,
            itemNameEn: "Manual adjustment item",
            itemNameBn: "Manual adjustment item",
            quantity: 1,
            unitPriceMinor: 0,
            customerNote: null,
            modifiers: [],
          },
        ],
      };
    });
  }

  function resetDraft() {
    if (detail) setDraft(createDraft(detail));
    setFeedback(null);
  }

  function refreshAfterSave(orderId: string) {
    startLoadingDetail(async () => {
      const result = await getAdminOrderDetailAction(orderId);
      if (result.status === "error") {
        setDetailError(result.message);
        return;
      }
      setDetail(result.detail);
      setDraft(createDraft(result.detail));
    });
  }

  function saveOrder() {
    if (!detail || !draft || !hasChanges) return;
    if (cancellationReasonRequired) {
      setFeedback("Add a short cancellation reason before cancelling this order.");
      return;
    }

    startSaving(async () => {
      const result = await updateWebsiteOrderAction({
        orderId: detail.orderId,
        expectedVersion: detail.version,
        toStatus: draft.status === detail.status ? null : draft.status,
        discountMinor:
          draft.discountMinor === detail.discountMinor ? null : draft.discountMinor,
        deliveryFeeMinor:
          draft.deliveryFeeMinor === detail.deliveryFeeMinor
            ? null
            : draft.deliveryFeeMinor,
        note: draft.note.trim() || null,
        items: draft.itemsDirty
          ? draft.items.map((item) => ({
              sourceItemId: item.sourceItemId,
              itemNameEn: item.itemNameEn.trim(),
              itemNameBn: item.itemNameBn.trim() || item.itemNameEn.trim(),
              quantity: item.quantity,
              unitPriceMinor: item.unitPriceMinor,
              customerNote: item.customerNote?.trim() || null,
              modifiers: item.modifiers.map((modifier) => ({
                sourceOptionId: modifier.sourceOptionId,
                groupNameEn: modifier.groupNameEn,
                groupNameBn: modifier.groupNameBn,
                optionNameEn: modifier.optionNameEn,
                optionNameBn: modifier.optionNameBn,
                priceDeltaMinor: modifier.priceDeltaMinor,
              })),
            }))
          : null,
      });
      if (result.status === "error") {
        setFeedback(result.message);
        return;
      }
      setFeedback(result.message);
      refreshAfterSave(result.orderId);
      router.refresh();
    });
  }

  function archiveLiveOrder() {
    if (!detail) return;
    startSaving(async () => {
      const result = await archiveLiveWebsiteOrderAction({
        orderId: detail.orderId,
        expectedVersion: detail.version,
        note: archiveNote,
      });
      if (result.status === "error") {
        setFeedback(result.message);
        return;
      }
      setArchiveDialogOpen(false);
      setArchiveNote("");
      setFeedback(result.message);
      refreshAfterSave(result.orderId);
      router.refresh();
    });
  }

  function loadOlderOrders() {
    const oldest = historyOrders.at(-1);
    if (!oldest || !hasOlderOrders || isLoadingOlder) return;

    startLoadingOlder(async () => {
      const result = await getAdminOrderHistoryPageAction({
        placedAt: oldest.placedAt,
        orderId: oldest.orderId,
      });
      if (result.status === "error") {
        setFeedback(result.message);
        return;
      }
      setOlderOrders((current) => [...current, ...result.orders]);
      setHasOlderOrders(result.orders.length === 100);
    });
  }

  if (snapshot.availability !== "ready") {
    const permissionRequired = snapshot.availability === "permission_required";
    return (
      <Card className="rounded-2xl bg-white shadow-sm">
        <CardContent className="pt-6">
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {permissionRequired
                  ? "Order workspace permission required"
                  : "Order workspace is safely unavailable"}
              </EmptyTitle>
              <EmptyDescription>
                {permissionRequired
                  ? "Your current staff role does not include orders.read."
                  : "The protected order list could not be verified, so no fallback order data is shown."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <section aria-labelledby="orders-workspace-title">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
              Website source of truth
            </p>
            <h1 id="orders-workspace-title" className="mt-1 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
              Orders
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Update status independently, adjust an order with a staff note, and keep every change versioned for the website and POS mirror.
            </p>
          </div>
          <Badge variant="outline" className="h-6">
            <History aria-hidden="true" />
            {historyOrders.length} loaded web order{historyOrders.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {feedback ? (
          <p
            role="status"
            className="mt-5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm font-medium text-primary"
          >
            {feedback}
          </p>
        ) : null}

        <Card className="mt-6 rounded-2xl bg-white shadow-sm">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Order history</CardTitle>
                <CardDescription className="mt-1">
                  Search loaded history by order reference, mode, or current status. Load older pages as needed; details load only when an authorized staff member opens an order.
                </CardDescription>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_10rem_9rem]">
                <label className="relative block sm:col-span-2 xl:col-span-1">
                  <span className="sr-only">Search order history</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search order reference"
                    className="h-10 pl-9"
                  />
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full" aria-label="Filter by status">
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {ADMIN_ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={modeFilter} onValueChange={setModeFilter}>
                  <SelectTrigger className="h-10 w-full" aria-label="Filter by order mode">
                    <SelectValue placeholder="Any mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any mode</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredOrders.length === 0 ? (
              <Empty className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardList aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No matching website orders</EmptyTitle>
                  <EmptyDescription>
                    Try clearing a filter or wait for the next website checkout.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Placed</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-28 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.orderId}>
                          <TableCell className="font-semibold">{order.orderReference}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(order.status)}>
                              {statusLabels[order.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={order.mode === "test" ? "secondary" : "outline"}>
                              {order.mode === "test" ? "Test" : "Live"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(order.placedAt)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(order.grandTotalMinor, order.currencyCode)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => openOrder(order.orderId)}>
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="divide-y md:hidden">
                  {filteredOrders.map((order) => (
                    <article
                      key={order.orderId}
                      className="grid gap-3 px-4 py-4 sm:px-5"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{order.orderReference}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(order.placedAt)}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold">
                          {formatMoney(order.grandTotalMinor, order.currencyCode)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={statusVariant(order.status)}>
                            {statusLabels[order.status]}
                          </Badge>
                          <Badge variant={order.mode === "test" ? "secondary" : "outline"}>
                            {order.mode === "test" ? "Test" : "Live"}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openOrder(order.orderId)}
                        >
                          Review order
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {historyOrders.length > 0 && hasOlderOrders ? (
              <div className="flex justify-center border-t p-4">
                <Button type="button" variant="outline" onClick={loadOlderOrders} disabled={isLoadingOlder}>
                  {isLoadingOlder ? <Spinner /> : <History aria-hidden="true" />}
                  {isLoadingOlder ? "Loading older orders" : "Load older orders"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setDetailError(null);
        }}
      >
        <SheetContent
          side="right"
          className="h-dvh w-full max-w-full min-w-0 gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:w-[calc(100vw-2rem)] data-[side=right]:sm:max-w-3xl"
          aria-describedby="order-drawer-description"
        >
          <SheetHeader className="min-w-0 shrink-0 border-b bg-muted/25 pr-12">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SheetTitle className="min-w-0 break-words">
                {detail?.orderReference ?? "Loading order"}
              </SheetTitle>
              {detail ? <Badge variant={statusVariant(detail.status)}>{statusLabels[detail.status]}</Badge> : null}
              {detail ? <Badge variant={detail.mode === "test" ? "secondary" : "outline"}>{detail.mode === "test" ? "Test" : "Live"}</Badge> : null}
            </div>
            <SheetDescription id="order-drawer-description">
              Staff-only customer data. Changes are authorized on the server and saved as a new order version.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            {isLoadingDetail || (drawerOpen && !detail && !detailError) ? (
              <OrderDetailSkeleton />
            ) : detailError ? (
              <div className="p-4 sm:p-6">
                <Card
                  role="alert"
                  className="border-destructive/25 bg-destructive/5 shadow-none"
                >
                  <CardContent className="pt-4 text-sm text-destructive">
                    {detailError}
                  </CardContent>
                </Card>
              </div>
            ) : detail && draft ? (
            <div className="min-w-0 space-y-6 p-4 pb-8 sm:p-6 sm:pb-8">
              {feedback ? (
                <p role="status" className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
                  {feedback}
                </p>
              ) : null}

              <section className="grid min-w-0 gap-3 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-2" aria-labelledby="customer-heading">
                <div className="min-w-0">
                  <p id="customer-heading" className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Delivery contact</p>
                  <p className="mt-2 break-words font-bold">{detail.contact.fullName}</p>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 break-all text-sm text-muted-foreground"><Phone aria-hidden="true" className="size-3.5 shrink-0" />{detail.contact.phoneE164}</p>
                </div>
                <div className="min-w-0 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground"><MapPin aria-hidden="true" className="size-3.5" />Uttara delivery address</p>
                  <p className="mt-1 break-words">Sector {detail.contact.sectorNumber}, Road {detail.contact.roadNumber}</p>
                  <p className="break-words">House {detail.contact.houseNumber}, Flat {detail.contact.flatNumber}</p>
                </div>
              </section>

              <section className="min-w-0 rounded-2xl border p-4" aria-labelledby="order-control-heading">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="order-control-heading" className="font-bold">Order controls</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Any staff-authorized status is available. This does not depend on the previous step; use Cancelled to close an order. Website orders are retained and cannot be deleted.
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">Version {detail.version}</Badge>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Status
                    <Select
                      value={draft.status}
                      disabled={!canManage || isSaving}
                      onValueChange={(value) =>
                        setDraft((current) =>
                          current ? { ...current, status: value as AdminOrderStatus } : current,
                        )
                      }
                    >
                      <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADMIN_ORDER_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Discount (৳)
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={draft.discountMinor / 100}
                      disabled={!canManage || isSaving}
                      onChange={(event) => setDraft((current) => current ? { ...current, discountMinor: asMinor(event.target.value) } : current)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Delivery fee (৳)
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={draft.deliveryFeeMinor / 100}
                      disabled={!canManage || isSaving}
                      onChange={(event) => setDraft((current) => current ? { ...current, deliveryFeeMinor: asMinor(event.target.value) } : current)}
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-1.5">
                  <Label htmlFor="order-audit-note">{draft.status !== detail.status && draft.status === "cancelled" ? "Cancellation reason *" : "Staff note for this adjustment"}</Label>
                  <Textarea
                    id="order-audit-note"
                    maxLength={500}
                    value={draft.note}
                    disabled={!canManage || isSaving}
                    onChange={(event) => setDraft((current) => current ? { ...current, note: event.target.value } : current)}
                    placeholder={draft.status !== detail.status && draft.status === "cancelled" ? "Why is this order being cancelled? This is required and becomes part of the staff audit trail." : "Why was the order changed? This becomes part of the staff audit trail."}
                  />
                </div>
              </section>

              <section className="min-w-0 rounded-2xl border p-4" aria-labelledby="line-items-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="line-items-heading" className="font-bold">Line items</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Add, remove, or correct items after speaking with the customer. Existing modifiers stay attached to their line.
                    </p>
                  </div>
                  {canManage ? (
                    <Button type="button" size="sm" variant="outline" onClick={addDraftItem} disabled={isSaving || draft.items.length >= 60}>
                      <Plus aria-hidden="true" /> Add item
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  {draft.items.map((item, index) => (
                    <article key={item.clientId} className="min-w-0 rounded-xl border bg-muted/15 p-3">
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_6rem_7rem_auto] lg:items-end">
                        <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:col-span-2 lg:col-span-1">
                          Item name
                          <Input
                            value={item.itemNameEn}
                            maxLength={160}
                            disabled={!canManage || isSaving}
                            onChange={(event) => updateDraftItem(item.clientId, { itemNameEn: event.target.value, itemNameBn: item.itemNameBn === item.itemNameEn ? event.target.value : item.itemNameBn })}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                          Qty
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            inputMode="numeric"
                            value={item.quantity}
                            disabled={!canManage || isSaving}
                            onChange={(event) => updateDraftItem(item.clientId, { quantity: asQuantity(event.target.value) })}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                          Unit price (৳)
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            value={item.unitPriceMinor / 100}
                            disabled={!canManage || isSaving}
                            onChange={(event) => updateDraftItem(item.clientId, { unitPriceMinor: asMinor(event.target.value) })}
                          />
                        </label>
                        {canManage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
                            disabled={isSaving || draft.items.length <= 1}
                            onClick={() => removeDraftItem(item.clientId)}
                            aria-label={`Remove ${item.itemNameEn || `item ${index + 1}`}`}
                          >
                            <Trash2 aria-hidden="true" />
                            <span>Remove</span>
                          </Button>
                        ) : null}
                      </div>
                      {item.modifiers.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Modifiers: {item.modifiers.map((modifier) => `${modifier.groupNameEn}: ${modifier.optionNameEn}${modifier.priceDeltaMinor > 0 ? ` (+${formatMoney(modifier.priceDeltaMinor)})` : ""}`).join(" · ")}
                        </p>
                      ) : null}
                      <label className="mt-3 grid gap-1.5 text-xs font-medium text-muted-foreground">
                        Line note
                        <Input
                          value={item.customerNote ?? ""}
                          maxLength={300}
                          disabled={!canManage || isSaving}
                          onChange={(event) => updateDraftItem(item.clientId, { customerNote: event.target.value || null })}
                          placeholder="Optional adjustment note"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid min-w-0 gap-3 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]" aria-labelledby="totals-heading">
                <div className="min-w-0">
                  <h2 id="totals-heading" className="font-bold">Order total</h2>
                  <p className="mt-1 text-xs text-muted-foreground">The server recalculates all item, modifier, discount, and delivery totals.</p>
                </div>
                <dl className="grid min-w-0 gap-1 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Current subtotal</dt><dd>{formatMoney(detail.subtotalMinor, detail.currencyCode)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Current discount</dt><dd>-{formatMoney(detail.discountMinor, detail.currencyCode)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Current delivery</dt><dd>{formatMoney(detail.deliveryFeeMinor, detail.currencyCode)}</dd></div>
                  <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-bold"><dt>Current total</dt><dd>{formatMoney(detail.grandTotalMinor, detail.currencyCode)}</dd></div>
                </dl>
              </section>

              <section className="rounded-2xl border p-4" aria-labelledby="timeline-heading">
                <div className="flex items-center gap-2"><ReceiptText aria-hidden="true" className="size-4 text-primary" /><h2 id="timeline-heading" className="font-bold">Audit timeline</h2></div>
                <div className="mt-4 grid gap-3">
                  {detail.statusEvents.length === 0 && detail.mutationAudits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No staff updates have been recorded yet.</p>
                  ) : (
                    <>
                      {detail.statusEvents.map((event) => (
                        <div key={`status-${event.id}`} className="rounded-xl bg-muted/30 p-3 text-sm">
                          <p className="font-semibold">{event.fromStatus ? `${statusLabels[event.fromStatus]} → ` : ""}{statusLabels[event.toStatus]}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{event.actorType} · {formatDate(event.createdAt)}{event.note ? ` · ${event.note}` : ""}</p>
                        </div>
                      ))}
                      {detail.mutationAudits.map((audit) => (
                        <div key={`audit-${audit.id}`} className="rounded-xl bg-primary/5 p-3 text-sm">
                          <p className="font-semibold">{audit.action === "order.live_archived" ? "Live order archived" : `Version ${audit.fromVersion} → ${audit.toVersion}`}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{statusLabels[audit.fromStatus]} → {statusLabels[audit.toStatus]} · {formatDate(audit.createdAt)}{audit.note ? ` · ${audit.note}` : ""}</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </section>

              {detail.mode === "live" && detail.archivedAt === null && canManage ? (
                <section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4" aria-labelledby="archive-heading">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h2 id="archive-heading" className="font-bold text-destructive">Cancel live order</h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Cancellation retains the order, customer details, and audit history. Website orders are never deleted.</p>
                    </div>
                    <Button type="button" variant="destructive" onClick={() => setArchiveDialogOpen(true)} disabled={isSaving}>
                      <Archive aria-hidden="true" /> Cancel order
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>
            ) : null}
          </div>

          {detail && draft ? (
            <SheetFooter className="shrink-0 border-t bg-background/95 p-3 backdrop-blur sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 text-xs leading-5 text-muted-foreground">
                  {canManage
                    ? "Saving sends a versioned snapshot to the POS sync feed."
                    : "Your role can review but cannot edit orders."}
                </p>
                {canManage ? (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={resetDraft}
                      disabled={!hasChanges || isSaving}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 sm:flex-none"
                      onClick={saveOrder}
                      disabled={!hasChanges || cancellationReasonRequired || isSaving}
                    >
                      {isSaving ? <Spinner /> : <PencilLine aria-hidden="true" />}
                      {isSaving ? "Saving" : "Save changes"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive"><Archive aria-hidden="true" /></AlertDialogMedia>
            <AlertDialogTitle>Cancel this live order?</AlertDialogTitle>
            <AlertDialogDescription>
              This retains the order, customer data, and audit history. Add a concise cancellation reason before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-1.5 text-sm font-medium">
            Cancellation reason
            <Textarea value={archiveNote} maxLength={500} onChange={(event) => setArchiveNote(event.target.value)} placeholder="Customer cancelled after call" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Keep order</AlertDialogCancel>
            <AlertDialogAction disabled={isSaving || archiveNote.trim().length < 2} onClick={archiveLiveOrder} variant="destructive">
              {isSaving ? <Spinner /> : <Archive aria-hidden="true" />} Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
