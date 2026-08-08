"use client";

import { useActionState } from "react";
import { SlidersHorizontal, UtensilsCrossed } from "lucide-react";

import {
  updateMenuCategoryAction,
  updateMenuItemAction,
  updateModifierGroupAction,
  updateModifierOptionAction,
} from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { ActiveAdminViewer, AdminDashboardSnapshot } from "@/lib/admin/types";

function BooleanSelect({ name, value, label, disabled }: { name: string; value: boolean; label: string; disabled: boolean }) {
  return <label className="grid gap-1 text-xs font-semibold">{label}<select name={name} defaultValue={String(value)} disabled={disabled} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="true">Yes</option><option value="false">No</option></select></label>;
}

function Message({ state }: { state: typeof initialAdminActionState }) {
  return state.message ? <p aria-live="polite" className={state.status === "error" ? "rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" : "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"}>{state.message}</p> : null;
}

export function MenuManagementCard({ viewer, snapshot }: { viewer: ActiveAdminViewer; snapshot: AdminDashboardSnapshot }) {
  const [categoryState, categoryAction, categoryPending] = useActionState(updateMenuCategoryAction, initialAdminActionState);
  const [itemState, itemAction, itemPending] = useActionState(updateMenuItemAction, initialAdminActionState);
  const [groupState, groupAction, groupPending] = useActionState(updateModifierGroupAction, initialAdminActionState);
  const [optionState, optionAction, optionPending] = useActionState(updateModifierOptionAction, initialAdminActionState);
  const canManage = viewer.permissions.includes("catalog.manage");
  const { menuCategories, menuItems, modifierGroups, modifierOptions } = snapshot.operations;
  const ready = canManage && menuCategories && menuItems && modifierGroups && modifierOptions;

  return (
    <Card id="menu" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="menu-admin-title">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><UtensilsCrossed aria-hidden="true" className="size-4.5" /></span><div><CardTitle id="menu-admin-title" className="text-lg font-bold">Menu management · মেনু ব্যবস্থাপনা</CardTitle><CardDescription className="mt-1 leading-5">Control bilingual names, published visibility, ordering availability, authoritative prices, and modifier rules.</CardDescription></div></div>
          <Badge variant="outline">{ready ? `${menuItems.length} items` : canManage ? "Unavailable" : "Permission required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        {!ready ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Verified catalog controls are unavailable. No fallback writes are enabled.</p> : (
          <>
            <details className="rounded-xl border" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">Items ({menuItems.length})</summary>
              <div className="grid gap-3 border-t p-3">
                <Message state={itemState} />
                {menuItems.map((item) => (
                  <details key={item.id} className="rounded-xl bg-muted/35">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{item.nameEn} <span className="font-normal text-muted-foreground">· ৳{item.basePriceMinor / 100} · {item.isActive ? item.isAvailable ? "Available" : "Unavailable" : "Hidden"}</span></summary>
                    <form action={itemAction} className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-4">
                      <input type="hidden" name="id" value={item.id} />
                      <label className="grid gap-1 text-xs font-semibold">English name<Input name="nameEn" defaultValue={item.nameEn} maxLength={160} required disabled={itemPending} /></label>
                      <label className="grid gap-1 text-xs font-semibold">বাংলা নাম<Input name="nameBn" defaultValue={item.nameBn} maxLength={160} required disabled={itemPending} lang="bn" /></label>
                      <label className="grid gap-1 text-xs font-semibold">Price (BDT)<Input type="number" name="basePriceBdt" min="0" step="0.01" defaultValue={item.basePriceMinor / 100} required disabled={itemPending} inputMode="decimal" /></label>
                      <label className="grid gap-1 text-xs font-semibold">Compare-at (BDT)<Input type="number" name="compareAtPriceBdt" min="0" step="0.01" defaultValue={item.compareAtPriceMinor === null ? "" : item.compareAtPriceMinor / 100} disabled={itemPending} inputMode="decimal" /></label>
                      <BooleanSelect name="isActive" value={item.isActive} label="Visible" disabled={itemPending} />
                      <BooleanSelect name="isAvailable" value={item.isAvailable} label="Orderable" disabled={itemPending} />
                      <BooleanSelect name="isFeatured" value={item.isFeatured} label="Featured" disabled={itemPending} />
                      <label className="grid gap-1 text-xs font-semibold">Sort order<Input type="number" name="sortOrder" defaultValue={item.sortOrder} required disabled={itemPending} /></label>
                      <label className="grid gap-1 text-xs font-semibold">Prep minutes<Input type="number" name="preparationMinutes" min="1" max="240" defaultValue={item.preparationMinutes ?? ""} disabled={itemPending} /></label>
                      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">English description<textarea name="descriptionEn" defaultValue={item.descriptionEn ?? ""} maxLength={1200} disabled={itemPending} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
                      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">বাংলা বিবরণ<textarea name="descriptionBn" defaultValue={item.descriptionBn ?? ""} maxLength={1200} disabled={itemPending} lang="bn" className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm" /></label>
                      <Button className="sm:col-span-2 xl:col-span-4" disabled={itemPending}>{itemPending ? "Saving…" : "Save item"}</Button>
                    </form>
                  </details>
                ))}
              </div>
            </details>

            <details className="rounded-xl border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">Categories ({menuCategories.length})</summary>
              <div className="grid gap-3 border-t p-3">
                <Message state={categoryState} />
                {menuCategories.map((category) => (
                  <form key={category.id} action={categoryAction} className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="id" value={category.id} />
                    <label className="grid gap-1 text-xs font-semibold">English name<Input name="nameEn" defaultValue={category.nameEn} required maxLength={100} disabled={categoryPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">বাংলা নাম<Input name="nameBn" defaultValue={category.nameBn} required maxLength={100} disabled={categoryPending} lang="bn" /></label>
                    <BooleanSelect name="isActive" value={category.isActive} label="Visible" disabled={categoryPending} />
                    <BooleanSelect name="isFeatured" value={category.isFeatured} label="Featured" disabled={categoryPending} />
                    <label className="grid gap-1 text-xs font-semibold">Sort order<Input type="number" name="sortOrder" defaultValue={category.sortOrder} required disabled={categoryPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">English description<Input name="descriptionEn" defaultValue={category.descriptionEn ?? ""} maxLength={500} disabled={categoryPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">বাংলা বিবরণ<Input name="descriptionBn" defaultValue={category.descriptionBn ?? ""} maxLength={500} disabled={categoryPending} lang="bn" /></label>
                    <Button disabled={categoryPending}>{categoryPending ? "Saving…" : "Save category"}</Button>
                  </form>
                ))}
              </div>
            </details>

            <details className="rounded-xl border">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"><SlidersHorizontal aria-hidden="true" className="size-4" />Modifier groups ({modifierGroups.length})</summary>
              <div className="grid gap-3 border-t p-3">
                <Message state={groupState} />
                {modifierGroups.map((group) => (
                  <form key={group.id} action={groupAction} className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="id" value={group.id} />
                    <label className="grid gap-1 text-xs font-semibold">English name<Input name="nameEn" defaultValue={group.nameEn} required maxLength={120} disabled={groupPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">বাংলা নাম<Input name="nameBn" defaultValue={group.nameBn} required maxLength={120} disabled={groupPending} lang="bn" /></label>
                    <BooleanSelect name="isActive" value={group.isActive} label="Active" disabled={groupPending} />
                    <label className="grid gap-1 text-xs font-semibold">Presentation<select name="presentation" defaultValue={group.presentation} disabled={groupPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="modifier">Modifier</option><option value="variant">Required variant</option></select></label>
                    <label className="grid gap-1 text-xs font-semibold">Minimum<Input type="number" name="minimumSelections" min="0" max="20" defaultValue={group.minimumSelections} required disabled={groupPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">Maximum<Input type="number" name="maximumSelections" min="1" max="20" defaultValue={group.maximumSelections} required disabled={groupPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">Sort order<Input type="number" name="sortOrder" defaultValue={group.sortOrder} required disabled={groupPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">English description<Input name="descriptionEn" defaultValue={group.descriptionEn ?? ""} maxLength={500} disabled={groupPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold sm:col-span-2">বাংলা বিবরণ<Input name="descriptionBn" defaultValue={group.descriptionBn ?? ""} maxLength={500} disabled={groupPending} lang="bn" /></label>
                    <Button disabled={groupPending}>{groupPending ? "Saving…" : "Save group"}</Button>
                  </form>
                ))}
              </div>
            </details>

            <details className="rounded-xl border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">Modifier options ({modifierOptions.length})</summary>
              <div className="grid gap-3 border-t p-3">
                <Message state={optionState} />
                {modifierOptions.map((option) => {
                  const group = modifierGroups.find((candidate) => candidate.id === option.groupId);
                  return (
                    <form key={option.id} action={optionAction} className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2 xl:grid-cols-6">
                      <input type="hidden" name="id" value={option.id} />
                      <p className="self-end pb-2 text-xs font-semibold text-muted-foreground">{group?.nameEn ?? "Unknown group"}</p>
                      <label className="grid gap-1 text-xs font-semibold">English name<Input name="nameEn" defaultValue={option.nameEn} required maxLength={120} disabled={optionPending} /></label>
                      <label className="grid gap-1 text-xs font-semibold">বাংলা নাম<Input name="nameBn" defaultValue={option.nameBn} required maxLength={120} disabled={optionPending} lang="bn" /></label>
                      <BooleanSelect name="isActive" value={option.isActive} label="Active" disabled={optionPending} />
                      <label className="grid gap-1 text-xs font-semibold">Price delta (BDT)<Input type="number" name="priceDeltaBdt" min="0" step="0.01" defaultValue={option.priceDeltaMinor / 100} required disabled={optionPending} /></label>
                      <label className="grid gap-1 text-xs font-semibold">Sort<Input type="number" name="sortOrder" defaultValue={option.sortOrder} required disabled={optionPending} /></label>
                      <Button className="sm:col-span-2 xl:col-span-6" disabled={optionPending}>{optionPending ? "Saving…" : "Save option"}</Button>
                    </form>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
