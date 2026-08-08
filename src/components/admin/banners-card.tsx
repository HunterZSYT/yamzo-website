"use client";

import { useActionState } from "react";
import { ImageIcon, Plus } from "lucide-react";

import { upsertBannerAction } from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { ActiveAdminViewer, AdminBanner, AdminDashboardSnapshot } from "@/lib/admin/types";

function dateTimeLocal(value: string | null) {
  if (!value) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function BannerForm({ banner, action, pending }: { banner?: AdminBanner; action: (payload: FormData) => void; pending: boolean }) {
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-muted/35 p-4 md:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="id" value={banner?.id ?? ""} />
      <input type="hidden" name="mediaId" value={banner?.mediaId ?? ""} />
      <label className="grid gap-1 text-xs font-semibold">Placement<select name="placement" defaultValue={banner?.placement ?? "hero"} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="hero">Hero</option><option value="announcement">Announcement</option><option value="cart">Cart</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Active<select name="isActive" defaultValue={String(banner?.isActive ?? false)} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Sort order<Input type="number" name="sortOrder" defaultValue={banner?.sortOrder ?? 10} required disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">Action URL<Input name="actionUrl" defaultValue={banner?.actionUrl ?? ""} maxLength={500} placeholder="/menu" disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">English title<Input name="titleEn" defaultValue={banner?.titleEn ?? ""} maxLength={160} required disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">বাংলা শিরোনাম<Input name="titleBn" defaultValue={banner?.titleBn ?? ""} maxLength={160} required disabled={pending} lang="bn" /></label>
      <label className="grid gap-1 text-xs font-semibold">English eyebrow<Input name="eyebrowEn" defaultValue={banner?.eyebrowEn ?? ""} maxLength={160} disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">বাংলা ছোট শিরোনাম<Input name="eyebrowBn" defaultValue={banner?.eyebrowBn ?? ""} maxLength={160} disabled={pending} lang="bn" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">English body<textarea name="bodyEn" defaultValue={banner?.bodyEn ?? ""} maxLength={600} disabled={pending} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-semibold md:col-span-2">বাংলা বিবরণ<textarea name="bodyBn" defaultValue={banner?.bodyBn ?? ""} maxLength={600} disabled={pending} lang="bn" className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-semibold">English button label<Input name="actionLabelEn" defaultValue={banner?.actionLabelEn ?? ""} maxLength={80} disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">বাংলা বাটন লেবেল<Input name="actionLabelBn" defaultValue={banner?.actionLabelBn ?? ""} maxLength={80} disabled={pending} lang="bn" /></label>
      <label className="grid gap-1 text-xs font-semibold">Starts (Dhaka)<Input type="datetime-local" name="startsAt" defaultValue={dateTimeLocal(banner?.startsAt ?? null)} disabled={pending} /></label>
      <label className="grid gap-1 text-xs font-semibold">Ends (Dhaka)<Input type="datetime-local" name="endsAt" defaultValue={dateTimeLocal(banner?.endsAt ?? null)} disabled={pending} /></label>
      <Button className="md:col-span-2 xl:col-span-4" disabled={pending}>{pending ? "Saving…" : banner ? "Save banner" : "Create banner"}</Button>
    </form>
  );
}

export function BannersCard({ viewer, snapshot }: { viewer: ActiveAdminViewer; snapshot: AdminDashboardSnapshot }) {
  const [state, formAction, pending] = useActionState(upsertBannerAction, initialAdminActionState);
  const canManage = viewer.permissions.includes("merchandising.manage");
  const banners = snapshot.operations.banners;
  return (
    <Card id="banners" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="banners-title">
      <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><ImageIcon aria-hidden="true" className="size-4.5" /></span><div><CardTitle id="banners-title" className="text-lg font-bold">Banners · ব্যানার</CardTitle><CardDescription className="mt-1 leading-5">Create bilingual scheduled hero, announcement, and cart messages. Existing media references are preserved.</CardDescription></div></div><Badge variant="outline">{banners ? `${banners.length} configured` : canManage ? "Unavailable" : "Permission required"}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 pt-5">
        {state.message ? <p aria-live="polite" className={state.status === "error" ? "rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" : "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"}>{state.message}</p> : null}
        {!canManage || !banners ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Verified banner controls are unavailable.</p> : (
          <>
            <details className="rounded-xl border"><summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"><Plus aria-hidden="true" className="size-4" />Create banner</summary><div className="border-t p-3"><BannerForm action={formAction} pending={pending} /></div></details>
            {banners.map((banner) => <details key={banner.id} className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{banner.titleEn} <span className="font-normal text-muted-foreground">· {banner.placement} · {banner.isActive ? "active" : "inactive"}</span></summary><div className="border-t p-3"><BannerForm banner={banner} action={formAction} pending={pending} /></div></details>)}
          </>
        )}
      </CardContent>
    </Card>
  );
}
