"use client";

import { useActionState } from "react";
import { EyeOff, KeyRound, LockKeyhole, Megaphone } from "lucide-react";

import { updateMetaConfigurationAction } from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { AdminMetaConfiguration } from "@/lib/admin/types";

export function MetaConfigurationCard({ canManage, configuration }: { canManage: boolean; configuration: AdminMetaConfiguration | null }) {
  const [state, formAction, pending] = useActionState(updateMetaConfigurationAction, initialAdminActionState);
  const ready = canManage && configuration !== null;
  return (
    <Card id="meta" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="meta-title">
      <CardHeader className="border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><Megaphone aria-hidden="true" className="size-4.5" /></span><div><CardTitle id="meta-title" className="text-lg font-bold">Meta Pixel & Conversions API</CardTitle><CardDescription className="mt-1 leading-5">The Pixel ID is public configuration. The CAPI token uses a service-only Vault mutation and is never read back into this page.</CardDescription></div></div><Badge variant="outline">{ready ? configuration.enabled ? "Enabled" : configuration.tokenConfigured ? "Ready, disabled" : "Not configured" : "Permission required"}</Badge></div></CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-5 pt-5 lg:grid-cols-2">
          {state.message ? <p aria-live="polite" className={state.status === "error" ? "rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive lg:col-span-2" : "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 lg:col-span-2"}>{state.message}</p> : null}
          <div className="grid content-start gap-2"><Label htmlFor="meta-enabled">Integration status</Label><select id="meta-enabled" name="enabled" defaultValue={String(configuration?.enabled ?? false)} disabled={!ready || pending} className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold"><option value="false">Disabled</option><option value="true">Enabled</option></select><p className="text-xs leading-5 text-muted-foreground">Enabling fails closed until both required values are configured.</p></div>
          <div className="grid content-start gap-2"><Label htmlFor="meta-pixel-id">Meta Pixel ID</Label><div className="relative"><Megaphone aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="meta-pixel-id" name="pixelId" inputMode="numeric" pattern="[0-9]{5,32}" maxLength={32} defaultValue={configuration?.pixelId ?? ""} className="h-11 pl-10" placeholder="Digits only" autoComplete="off" disabled={!ready || pending} /></div><p className="text-xs leading-5 text-muted-foreground">Public browser identifier; storefront loading remains consent-gated.</p></div>
          <div className="grid content-start gap-2"><Label htmlFor="meta-capi-token">New Conversions API token</Label><div className="relative"><KeyRound aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="meta-capi-token" name="capiToken" type="password" minLength={20} maxLength={2048} className="h-11 pr-10 pl-10" placeholder={configuration?.tokenConfigured ? "Leave blank to keep saved token" : "Paste token once"} autoComplete="new-password" spellCheck={false} disabled={!ready || pending} /><EyeOff aria-hidden="true" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" /></div><p className="text-xs leading-5 text-muted-foreground">Saved value is write-only. Status: {configuration?.tokenConfigured ? "token configured" : "no token configured"}.</p></div>
          <div className="grid content-start gap-2"><Label htmlFor="meta-clear-token">Saved token</Label><select id="meta-clear-token" name="clearToken" defaultValue="false" disabled={!ready || pending || !configuration?.tokenConfigured} className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold"><option value="false">Keep saved token</option><option value="true">Permanently remove token</option></select><p className="text-xs leading-5 text-muted-foreground">Removing the token automatically prevents an incomplete enabled configuration.</p></div>
          <div className="flex gap-3 rounded-xl bg-muted/70 p-4 lg:col-span-2"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-xs leading-5 text-muted-foreground">Requires the Supabase Vault extension and the server-only <code>SUPABASE_SECRET_KEY</code>. Audit events record only status, Pixel ID, and whether the token changed—never token plaintext.</p></div>
        </CardContent>
        <CardFooter><Button disabled={!ready || pending} className="min-h-10 w-full sm:w-auto">{pending ? "Saving securely…" : "Save Meta configuration"}</Button></CardFooter>
      </form>
    </Card>
  );
}
