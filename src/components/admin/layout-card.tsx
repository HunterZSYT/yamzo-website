"use client";

import { useActionState } from "react";
import { LayoutTemplate } from "lucide-react";

import { updateHomeSectionAction } from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { ActiveAdminViewer, AdminDashboardSnapshot } from "@/lib/admin/types";

export function LayoutCard({ viewer, snapshot }: { viewer: ActiveAdminViewer; snapshot: AdminDashboardSnapshot }) {
  const [state, formAction, pending] = useActionState(updateHomeSectionAction, initialAdminActionState);
  const canManage = viewer.permissions.includes("merchandising.manage");
  const sections = snapshot.operations.homeSections;
  return (
    <Card id="layout" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="layout-title">
      <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><LayoutTemplate aria-hidden="true" className="size-4.5" /></span><div><CardTitle id="layout-title" className="text-lg font-bold">Homepage layout · হোমপেজ লেআউট</CardTitle><CardDescription className="mt-1 leading-5">Move approved sections with explicit sort positions and bilingual headings; route and checkout structure stay fixed.</CardDescription></div></div><Badge variant="outline">{sections ? `${sections.length} sections` : canManage ? "Unavailable" : "Permission required"}</Badge></div></CardHeader>
      <CardContent className="grid gap-3 pt-5">
        {state.message ? <p aria-live="polite" className={state.status === "error" ? "rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" : "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"}>{state.message}</p> : null}
        {!canManage || !sections ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Verified layout controls are unavailable.</p> : sections.map((section) => (
          <form key={section.id} action={formAction} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-6">
            <input type="hidden" name="id" value={section.id} />
            <div><p className="text-sm font-bold capitalize">{section.sectionKey.replaceAll("-", " ")}</p><p className="text-xs text-muted-foreground">{section.kind}</p></div>
            <label className="grid gap-1 text-xs font-semibold">Visible<select name="isActive" defaultValue={String(section.isActive)} disabled={pending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="true">Yes</option><option value="false">No</option></select></label>
            <label className="grid gap-1 text-xs font-semibold">Sort order<Input type="number" name="sortOrder" defaultValue={section.sortOrder} required disabled={pending} /></label>
            <div className="grid gap-1"><Label>English title</Label><Input name="titleEn" defaultValue={section.titleEn ?? ""} maxLength={160} disabled={pending} /></div>
            <div className="grid gap-1"><Label>বাংলা শিরোনাম</Label><Input name="titleBn" defaultValue={section.titleBn ?? ""} maxLength={160} disabled={pending} lang="bn" /></div>
            <Button className="self-end" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            <label className="grid gap-1 text-xs font-semibold md:col-span-2 xl:col-span-3">English subtitle<Input name="subtitleEn" defaultValue={section.subtitleEn ?? ""} maxLength={400} disabled={pending} /></label>
            <label className="grid gap-1 text-xs font-semibold md:col-span-2 xl:col-span-3">বাংলা উপশিরোনাম<Input name="subtitleBn" defaultValue={section.subtitleBn ?? ""} maxLength={400} disabled={pending} lang="bn" /></label>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
