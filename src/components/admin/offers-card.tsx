"use client";

import { useActionState } from "react";
import { BadgePercent, Plus } from "lucide-react";

import { upsertOfferAction } from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { ActiveAdminViewer, AdminDashboardSnapshot, AdminOffer } from "@/lib/admin/types";

function dateTimeLocal(value: string | null) {
  if (!value) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function OfferForm({ offer, snapshot, action, pending }: { offer?: AdminOffer; snapshot: AdminDashboardSnapshot; action: (payload: FormData) => void; pending: boolean }) {
  const target = offer?.targets[0] ?? { targetKind: "all" as const, targetId: null };
  const valueDisplay = offer ? offer.kind === "percent" ? offer.value / 100 : offer.kind === "fixed" ? offer.value / 100 : 0 : 10;
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-muted/35 p-4 md:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="id" value={offer?.id ?? ""} />
      <div className="grid gap-1"><Label>English name</Label><Input name="nameEn" defaultValue={offer?.nameEn ?? ""} maxLength={160} required disabled={pending} /></div>
      <div className="grid gap-1"><Label>বাংলা নাম</Label><Input name="nameBn" defaultValue={offer?.nameBn ?? ""} maxLength={160} required disabled={pending} lang="bn" /></div>
      <label className="grid gap-1 text-xs font-semibold">Code (optional)<Input name="code" defaultValue={offer?.code ?? ""} maxLength={32} placeholder="WELCOME10" disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">Kind<select name="kind" defaultValue={offer?.kind ?? "percent"} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="percent">Percent</option><option value="fixed">Fixed amount</option><option value="free_delivery">Free delivery</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Value (% or BDT)<Input type="number" name="valueDisplay" min="0" step="0.01" defaultValue={valueDisplay} required disabled={pending} inputMode="decimal" /></label>
      <label className="grid gap-1 text-xs font-semibold">Minimum subtotal (BDT)<Input type="number" name="minimumSubtotalBdt" min="0" step="0.01" defaultValue={(offer?.minimumSubtotalMinor ?? 0) / 100} required disabled={pending} inputMode="decimal" /></label>
      <label className="grid gap-1 text-xs font-semibold">Max discount (BDT)<Input type="number" name="maximumDiscountBdt" min="0" step="0.01" defaultValue={offer?.maximumDiscountMinor === null || offer?.maximumDiscountMinor === undefined ? "" : offer.maximumDiscountMinor / 100} disabled={pending} inputMode="decimal" /></label>
      <label className="grid gap-1 text-xs font-semibold">Priority<Input type="number" name="priority" defaultValue={offer?.priority ?? 0} required disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">Active<select name="isActive" defaultValue={String(offer?.isActive ?? false)} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Stackable<select name="isStackable" defaultValue={String(offer?.isStackable ?? false)} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="false">No</option><option value="true">Yes</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Target kind<select name="targetKind" defaultValue={target.targetKind} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="all">All menu</option><option value="category">Category</option><option value="item">Item</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Target<select name="targetId" defaultValue={target.targetId ?? ""} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="">None / all menu</option><optgroup label="Categories">{snapshot.operations.menuCategories?.map((category) => <option key={category.id} value={category.id}>{category.nameEn}</option>)}</optgroup><optgroup label="Items">{snapshot.operations.menuItems?.map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}</optgroup></select></label>
      <label className="grid gap-1 text-xs font-semibold">Starts (Dhaka)<Input type="datetime-local" name="startsAt" defaultValue={dateTimeLocal(offer?.startsAt ?? null)} disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">Ends (Dhaka)<Input type="datetime-local" name="endsAt" defaultValue={dateTimeLocal(offer?.endsAt ?? null)} disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">English description<textarea name="descriptionEn" defaultValue={offer?.descriptionEn ?? ""} maxLength={800} disabled={pending} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">বাংলা বিবরণ<textarea name="descriptionBn" defaultValue={offer?.descriptionBn ?? ""} maxLength={800} disabled={pending} lang="bn" className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">English terms<textarea name="termsEn" defaultValue={offer?.termsEn ?? ""} maxLength={2000} disabled={pending} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">বাংলা শর্তাবলি<textarea name="termsBn" defaultValue={offer?.termsBn ?? ""} maxLength={2000} disabled={pending} lang="bn" className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <Button className="md:col-span-2 xl:col-span-4" disabled={pending}>{pending ? "Saving…" : offer ? "Save offer" : "Create offer"}</Button>
    </form>
  );
}

export function OffersCard({ viewer, snapshot }: { viewer: ActiveAdminViewer; snapshot: AdminDashboardSnapshot }) {
  const [state, formAction, pending] = useActionState(upsertOfferAction, initialAdminActionState);
  const canManage = viewer.permissions.includes("merchandising.manage");
  const offers = snapshot.operations.offers;
  return (
    <Card id="offers" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="offers-title">
      <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><BadgePercent aria-hidden="true" className="size-4.5" /></span><div><CardTitle id="offers-title" className="text-lg font-bold">Offers · অফার</CardTitle><CardDescription className="mt-1 leading-5">Schedule bilingual discounts with server-validated values, menu targets, limits, and terms.</CardDescription></div></div><Badge variant="outline">{offers ? `${offers.length} configured` : canManage ? "Unavailable" : "Permission required"}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 pt-5">
        {state.message ? <p aria-live="polite" className={state.status === "error" ? "rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" : "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"}>{state.message}</p> : null}
        {!canManage || !offers ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Verified offer controls are unavailable.</p> : <><details className="rounded-xl border"><summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"><Plus aria-hidden="true" className="size-4" />Create offer</summary><div className="border-t p-3"><OfferForm snapshot={snapshot} action={formAction} pending={pending} /></div></details>{offers.map((offer) => <details key={offer.id} className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{offer.nameEn} <span className="font-normal text-muted-foreground">· {offer.kind.replaceAll("_", " ")} · {offer.isActive ? "active" : "inactive"}</span></summary><div className="border-t p-3"><OfferForm offer={offer} snapshot={snapshot} action={formAction} pending={pending} /></div></details>)}</>}
      </CardContent>
    </Card>
  );
}
