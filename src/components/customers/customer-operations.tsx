"use client";

import { useActionState } from "react";
import {
  CircleAlert,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import {
  cancelCustomerCampaignAction,
  createCustomerCampaignAction,
  sendCustomerCampaignAction,
  syncCustomerAudienceAction,
  updateCustomerCampaignAction,
} from "@/app/admin/customer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type {
  CustomerCampaign,
  CustomerDirectory,
  MarketingSnapshot,
} from "@/lib/customers/schemas";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function campaignStatusLabel(status: CustomerCampaign["status"]) {
  return status.replaceAll("_", " ");
}

function SyncStatusBadge({ state }: { state: CustomerDirectory["customers"][number]["contact_sync_state"] }) {
  const copy = {
    synced: { label: "Synced", variant: "default" as const },
    pending: { label: "Needs sync", variant: "secondary" as const },
    attention: { label: "Needs attention", variant: "destructive" as const },
    not_opted_in: { label: "Not opted in", variant: "outline" as const },
  }[state];

  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function ActionNotice({
  state,
}: {
  state: { status: "idle" | "success" | "error"; message: string };
}) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={
        state.status === "error"
          ? "rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
          : "rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
      }
    >
      {state.message}
    </p>
  );
}

function CustomerMetrics({ snapshot }: { snapshot: MarketingSnapshot }) {
  const metrics = [
    {
      label: "Consented customers",
      value: snapshot.consented_account_count,
      icon: UsersRound,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Audience synced",
      value: snapshot.synced_contact_count,
      icon: ShieldCheck,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Needs audience sync",
      value: snapshot.pending_sync_count,
      icon: RefreshCw,
      tone: "bg-amber-50 text-amber-700",
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label} size="sm" className="rounded-2xl bg-white shadow-sm">
          <CardContent className="flex items-center gap-3">
            <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>
              <Icon aria-hidden="true" className="size-4.5" />
            </span>
            <div>
              <p className="text-xl font-black tracking-[-0.04em]">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CampaignCard({
  campaign,
  messagingConfigured,
}: {
  campaign: CustomerCampaign;
  messagingConfigured: boolean;
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateCustomerCampaignAction,
    initialAdminActionState,
  );
  const [sendState, sendAction, sendPending] = useActionState(
    sendCustomerCampaignAction,
    initialAdminActionState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelCustomerCampaignAction,
    initialAdminActionState,
  );
  const editable = campaign.status === "draft" || campaign.status === "failed";

  return (
    <Card className="rounded-2xl bg-white shadow-sm">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{campaign.name}</CardTitle>
            <CardDescription className="mt-1">
              {campaign.recipient_count} consented recipient{campaign.recipient_count === 1 ? "" : "s"} · last updated {formatDate(campaign.updated_at)}
            </CardDescription>
          </div>
          <Badge variant={campaign.status === "sent" ? "default" : campaign.status === "failed" ? "destructive" : "outline"} className="capitalize">
            {campaignStatusLabel(campaign.status)}
          </Badge>
        </div>
      </CardHeader>
      {editable ? (
        <>
          <form action={updateAction}>
            <CardContent className="grid gap-4 pt-5">
            <ActionNotice state={updateState} />
            {campaign.last_error_code ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                The last delivery attempt needs attention. Update the draft, sync the audience, then retry.
              </p>
            ) : null}
            <input type="hidden" name="id" value={campaign.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`campaign-name-${campaign.id}`}>Campaign name</Label>
                <Input id={`campaign-name-${campaign.id}`} name="name" defaultValue={campaign.name} maxLength={120} required disabled={updatePending || sendPending || cancelPending} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`campaign-subject-${campaign.id}`}>Email subject</Label>
                <Input id={`campaign-subject-${campaign.id}`} name="subject" defaultValue={campaign.subject} maxLength={180} required disabled={updatePending || sendPending || cancelPending} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`campaign-preview-${campaign.id}`}>Preview text (optional)</Label>
              <Input id={`campaign-preview-${campaign.id}`} name="previewText" defaultValue={campaign.preview_text ?? ""} maxLength={250} disabled={updatePending || sendPending || cancelPending} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`campaign-body-${campaign.id}`}>Message</Label>
              <Textarea id={`campaign-body-${campaign.id}`} name="bodyText" defaultValue={campaign.body_text} maxLength={12_000} required className="min-h-40" disabled={updatePending || sendPending || cancelPending} />
              <p className="text-xs leading-5 text-muted-foreground">Plain text is rendered safely. Every broadcast includes a Resend unsubscribe link.</p>
            </div>
            <Button type="submit" variant="outline" disabled={updatePending || sendPending || cancelPending}>
              {updatePending ? "Saving…" : "Save draft"}
            </Button>
            </CardContent>
          </form>
          <CardFooter className="flex flex-wrap gap-2">
            <form action={sendAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" disabled={!messagingConfigured || updatePending || sendPending || cancelPending}>
                <Send aria-hidden="true" />
                {sendPending ? "Sending…" : "Sync and send"}
              </Button>
            </form>
            <form action={cancelAction} className="sm:ml-auto">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" variant="ghost" disabled={updatePending || sendPending || cancelPending}>
                {cancelPending ? "Cancelling…" : "Cancel campaign"}
              </Button>
            </form>
            <div className="w-full"><ActionNotice state={sendState} /><ActionNotice state={cancelState} /></div>
          </CardFooter>
        </>
      ) : (
        <CardContent className="pt-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {campaign.status === "sent"
              ? `Sent ${formatDate(campaign.sent_at)}. The delivery record is retained for auditing.`
              : "This campaign is currently being delivered. Refresh before taking any further action."}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function CampaignWorkspace({
  snapshot,
  messagingConfigured,
}: {
  snapshot: MarketingSnapshot;
  messagingConfigured: boolean;
}) {
  const [createState, createAction, createPending] = useActionState(
    createCustomerCampaignAction,
    initialAdminActionState,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    syncCustomerAudienceAction,
    initialAdminActionState,
  );

  return (
    <div className="grid gap-5">
      <Card className="rounded-2xl bg-white shadow-sm">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary"><Mail aria-hidden="true" className="size-4.5" /></span>
              <div>
                <CardTitle>Email audience</CardTitle>
                <CardDescription className="mt-1">Only customers who explicitly opted in are synchronized to Resend. An opt-out is honored before every send.</CardDescription>
              </div>
            </div>
            <Badge variant={messagingConfigured ? "default" : "outline"}>{messagingConfigured ? "Server ready" : "Setup required"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5">
          <ActionNotice state={syncState} />
          {!messagingConfigured ? (
            <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Add the server-only Resend key, customer segment ID, and verified sender before audience sync or delivery can run.</p>
          ) : null}
          <p className="text-sm leading-6 text-muted-foreground">Sync before a campaign to bring new opt-ins in and honor customers who have withdrawn consent. Future WhatsApp outreach will need separate opt-in and provider setup.</p>
        </CardContent>
        <CardFooter>
          <form action={syncAction}>
            <Button type="submit" variant="outline" disabled={!messagingConfigured || syncPending}>
              <RefreshCw aria-hidden="true" className={syncPending ? "animate-spin" : undefined} />
              {syncPending ? "Syncing audience…" : "Sync consented audience"}
            </Button>
          </form>
        </CardFooter>
      </Card>

      <Card className="rounded-2xl bg-white shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Create email campaign</CardTitle>
          <CardDescription>Draft first, review it, then use “Sync and send” to deliver to the current consented audience.</CardDescription>
        </CardHeader>
        <form action={createAction}>
          <CardContent className="grid gap-4 pt-5">
            <ActionNotice state={createState} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="new-campaign-name">Campaign name</Label><Input id="new-campaign-name" name="name" maxLength={120} placeholder="Weekend seafood offer" required disabled={createPending} /></div>
              <div className="grid gap-2"><Label htmlFor="new-campaign-subject">Email subject</Label><Input id="new-campaign-subject" name="subject" maxLength={180} placeholder="Your Yamzo weekend offer" required disabled={createPending} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="new-campaign-preview">Preview text (optional)</Label><Input id="new-campaign-preview" name="previewText" maxLength={250} disabled={createPending} /></div>
            <div className="grid gap-2"><Label htmlFor="new-campaign-body">Message</Label><Textarea id="new-campaign-body" name="bodyText" maxLength={12_000} required className="min-h-40" placeholder="Write a clear offer for customers who chose to hear from Yamzo…" disabled={createPending} /></div>
          </CardContent>
          <CardFooter><Button type="submit" disabled={createPending}>{createPending ? "Creating…" : "Create draft"}</Button></CardFooter>
        </form>
      </Card>

      <div className="grid gap-4">
        <div><h2 className="text-lg font-black tracking-[-0.03em]">Campaigns</h2><p className="mt-1 text-sm text-muted-foreground">The latest 50 consent-first campaign records.</p></div>
        {snapshot.campaigns.length > 0 ? snapshot.campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} messagingConfigured={messagingConfigured} />) : <Card className="rounded-2xl border-dashed bg-white shadow-sm"><CardContent className="py-10 text-center text-sm text-muted-foreground">No customer campaigns yet. Create a draft when an offer is ready.</CardContent></Card>}
      </div>
    </div>
  );
}

function customersHref(query: string, page: number) {
  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  if (page > 1) parameters.set("page", String(page));
  const queryString = parameters.toString();
  return queryString ? `/admin/customers?${queryString}` : "/admin/customers";
}

function DirectoryWorkspace({
  directory,
  query,
  page,
}: {
  directory: CustomerDirectory | null;
  query: string;
  page: number;
}) {
  if (!directory) {
    return <Card className="rounded-2xl bg-white shadow-sm"><CardContent className="flex gap-3 py-8 text-sm text-muted-foreground"><CircleAlert aria-hidden="true" className="size-5 shrink-0 text-amber-600" />Customer directory data is unavailable until the protected customer migrations are applied and the backend is reachable.</CardContent></Card>;
  }

  const canGoBack = page > 1;
  const canGoForward = page * 50 < directory.total_count;
  return (
    <Card className="rounded-2xl bg-white shadow-sm">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Customer directory</CardTitle><CardDescription className="mt-1">{directory.total_count} account{directory.total_count === 1 ? "" : "s"}. Customer delivery addresses and raw phone values remain in protected account/order workflows.</CardDescription></div>
          <Badge variant="outline">Page {page}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <form action="/admin/customers" method="get" className="flex flex-col gap-2 sm:flex-row">
          <Label className="sr-only" htmlFor="customer-search">Search customers</Label>
          <Input id="customer-search" name="q" defaultValue={query} maxLength={120} placeholder="Search name or email" className="min-h-11" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Table>
          <TableCaption className="sr-only">Protected Yamzo customer account directory</TableCaption>
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Orders</TableHead><TableHead>Contact</TableHead><TableHead>Audience</TableHead><TableHead>Last activity</TableHead></TableRow></TableHeader>
          <TableBody>
            {directory.customers.map((customer) => (
              <TableRow key={customer.user_id}>
                <TableCell className="min-w-56 whitespace-normal"><div className="font-bold">{customer.display_name || "Unnamed customer"}</div><div className="mt-0.5 break-all text-xs text-muted-foreground">{customer.email ?? "Email unavailable"}</div></TableCell>
                <TableCell><div className="flex items-center gap-1.5 font-semibold"><ShoppingBag aria-hidden="true" className="size-3.5 text-muted-foreground" />{customer.order_count}</div><div className="mt-1 text-xs capitalize text-muted-foreground">{customer.last_order_status?.replaceAll("_", " ") ?? "No orders"}</div></TableCell>
                <TableCell><div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone aria-hidden="true" className="size-3.5" />{customer.phone_count} saved</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3.5" />{customer.address_count} address{customer.address_count === 1 ? "" : "es"}</div></TableCell>
                <TableCell><SyncStatusBadge state={customer.contact_sync_state} /><div className="mt-1 text-xs text-muted-foreground">{customer.marketing_consent_at ? "Opted in" : "No marketing consent"}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground"><div>{formatDate(customer.last_order_at)}</div><div className="mt-1">Signed in: {formatDate(customer.last_sign_in_at)}</div></TableCell>
              </TableRow>
            ))}
            {directory.customers.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No customers match this search.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-between gap-3"><p className="text-xs text-muted-foreground">Page {page} of {Math.max(1, Math.ceil(directory.total_count / 50))}</p><div className="flex gap-2"><Button asChild variant="outline" disabled={!canGoBack}><Link aria-disabled={!canGoBack} href={customersHref(query, Math.max(1, page - 1))}>Previous</Link></Button><Button asChild variant="outline" disabled={!canGoForward}><Link aria-disabled={!canGoForward} href={customersHref(query, page + 1)}>Next</Link></Button></div></CardFooter>
    </Card>
  );
}

export function CustomerOperations({
  snapshot,
  directory,
  query,
  page,
  messagingConfigured,
}: {
  snapshot: MarketingSnapshot | null;
  directory: CustomerDirectory | null;
  query: string;
  page: number;
  messagingConfigured: boolean;
}) {
  const safeSnapshot: MarketingSnapshot = snapshot ?? {
    consented_account_count: 0,
    synced_contact_count: 0,
    pending_sync_count: 0,
    campaigns: [],
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Customer operations</p><h1 className="mt-1 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Customers, consent, and care.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage account context and consented customer outreach separately from the live order queue.</p></div>
      </div>

      {snapshot ? <div className="mt-6"><CustomerMetrics snapshot={safeSnapshot} /></div> : <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><CircleAlert aria-hidden="true" className="size-5 shrink-0" />Customer campaign data is unavailable until the Customers migration is applied.</div>}

      <Tabs defaultValue="directory" className="mt-6 gap-5">
        <TabsList variant="line" aria-label="Customer workspace sections"><TabsTrigger value="directory"><UsersRound aria-hidden="true" />Directory</TabsTrigger><TabsTrigger value="campaigns"><Mail aria-hidden="true" />Email campaigns</TabsTrigger></TabsList>
        <TabsContent value="directory"><DirectoryWorkspace directory={directory} query={query} page={page} /></TabsContent>
        <TabsContent value="campaigns"><CampaignWorkspace snapshot={safeSnapshot} messagingConfigured={messagingConfigured} /></TabsContent>
      </Tabs>
    </div>
  );
}
