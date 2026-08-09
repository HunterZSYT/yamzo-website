"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Globe2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import type {
  AccountAddress,
  AccountOrder,
  AccountSnapshot,
} from "@/lib/account/contracts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AccountClientProps = {
  email: string;
  snapshot: AccountSnapshot | null;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type AddressDraft = {
  id: string | null;
  label: string;
  sector: string;
  road: string;
  house: string;
  flat: string;
  makeDefault: boolean;
};

const emptyAddress: AddressDraft = {
  id: null,
  label: "Home",
  sector: "",
  road: "",
  house: "",
  flat: "",
  makeDefault: true,
};

const terminalStatuses = new Set(["delivered", "rejected", "cancelled"]);

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  return value.startsWith("+880") ? `0${value.slice(4)}` : value;
}

function userFacingRpcError(message: string) {
  if (message.includes("INVALID_PHONE_NUMBER")) {
    return "Enter a valid Bangladesh mobile number.";
  }
  if (message.includes("CUSTOMER_PHONE_LIMIT_REACHED")) {
    return "You can save up to five phone numbers.";
  }
  if (message.includes("CUSTOMER_ADDRESS_LIMIT_REACHED")) {
    return "You can save up to five delivery addresses.";
  }
  if (message.includes("INVALID_DELIVERY_ADDRESS")) {
    return "Check the delivery address and try again.";
  }
  if (message.includes("INVALID_DISPLAY_NAME")) {
    return "Enter a name between 2 and 120 characters.";
  }
  if (message.includes("RATE_LIMITED")) {
    return "Too many changes at once. Please wait a moment and try again.";
  }
  return "That change could not be saved. Please try again.";
}

function statusLabel(status: AccountOrder["status"]) {
  return status.replaceAll("_", " ");
}

function statusTone(status: AccountOrder["status"]) {
  if (status === "delivered") return "bg-emerald-50 text-emerald-800";
  if (status === "rejected" || status === "cancelled") {
    return "bg-rose-50 text-rose-800";
  }
  return "bg-sky-50 text-sky-800";
}

function initialFor(email: string, displayName: string | null) {
  const source = displayName?.trim() || email;
  return source.slice(0, 1).toUpperCase();
}

export function AccountClient({ email, snapshot }: AccountClientProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(snapshot?.display_name ?? "");
  const [preferredLocale, setPreferredLocale] = useState<"en" | "bn">(
    snapshot?.preferred_locale ?? "en",
  );
  const [phone, setPhone] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("Mobile");
  const [phonePrimary, setPhonePrimary] = useState(true);
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionEmail, setDeletionEmail] = useState("");
  const [deletionPhrase, setDeletionPhrase] = useState("");

  if (!snapshot) {
    return (
      <main className="min-h-screen bg-[#f5fbff] px-4 py-8 text-[#06334f] sm:px-6 sm:py-12">
        <Card className="mx-auto max-w-xl border-sky-100 bg-white shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <Empty className="min-h-56 border-sky-200 bg-sky-50/45">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-amber-50 text-amber-700">
                  <ShieldAlert aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Your profile is temporarily unavailable</EmptyTitle>
                <EmptyDescription>
                  We could not safely load your saved account details. Refresh
                  and try again.
                </EmptyDescription>
              </EmptyHeader>
              <Button asChild className="min-h-11">
                <Link href="/">Back to Yamzo</Link>
              </Button>
            </Empty>
          </CardContent>
        </Card>
      </main>
    );
  }

  const ongoingOrders = snapshot.orders.filter(
    (order) => !terminalStatuses.has(order.status),
  );
  const orderHistory = snapshot.orders.filter((order) =>
    terminalStatuses.has(order.status),
  );
  const marketingEnabled = Boolean(snapshot.marketing_consent_at);
  const isBusy = (action: string) => pendingAction === action;

  async function runRpc(
    action: string,
    execute: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
    afterSuccess?: () => void,
  ) {
    setPendingAction(action);
    setNotice(null);

    try {
      const { error } = await execute();
      if (error) {
        setNotice({ tone: "error", message: userFacingRpcError(error.message) });
        return;
      }

      afterSuccess?.();
      setNotice({ tone: "success", message: success });
      router.refresh();
    } catch {
      setNotice({
        tone: "error",
        message: "That change could not be saved. Please try again.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runRpc(
      "profile",
      () =>
        createClient()
          .schema("api")
          .rpc("update_my_account_profile", {
            p_display_name: displayName.trim(),
            p_preferred_locale: preferredLocale,
          }),
      "Profile saved.",
    );
  }

  function savePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = phone.replace(/\D/g, "");
    if (!/^(?:01[3-9]\d{8}|8801[3-9]\d{8})$/.test(normalized)) {
      setNotice({ tone: "error", message: "Enter a valid Bangladesh mobile number." });
      return;
    }

    void runRpc(
      "phone-save",
      () =>
        createClient()
          .schema("api")
          .rpc("save_my_phone", {
            p_phone: normalized,
            p_label: phoneLabel.trim(),
            p_make_primary: phonePrimary,
          }),
      "Phone number saved.",
      () => {
        setPhone("");
        setPhoneLabel("Mobile");
        setPhonePrimary(false);
      },
    );
  }

  function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sector = address.sector.replace(/\D/g, "");
    const road = address.road.replace(/\D/g, "");
    const house = address.house.replace(/\D/g, "");
    if (
      !/^\d{1,2}$/.test(sector) ||
      !/^\d{1,40}$/.test(road) ||
      !/^\d{1,40}$/.test(house) ||
      address.flat.trim().length === 0
    ) {
      setNotice({ tone: "error", message: "Sector, road, and house must use digits only. Flat number is required." });
      return;
    }

    void runRpc(
      "address-save",
      () =>
        createClient()
          .schema("api")
          .rpc("save_my_delivery_address", {
            p_address_id: address.id,
            p_label: address.label.trim(),
            p_sector_number: Number(sector),
            p_road_number: road,
            p_house_number: house,
            p_flat_number: address.flat.trim(),
            p_make_default: address.makeDefault,
          }),
      address.id ? "Delivery address updated." : "Delivery address saved.",
      () => setAddress(emptyAddress),
    );
  }

  function editAddress(selected: AccountAddress) {
    setAddress({
      id: selected.id,
      label: selected.label,
      sector: String(selected.sector_number),
      road: selected.road_number,
      house: selected.house_number,
      flat: selected.flat_number,
      makeDefault: selected.is_default,
    });
    document.getElementById("saved-address-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void (async () => {
      setPendingAction("account-delete");
      setNotice(null);
      try {
        const response = await fetch("/api/account", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: deletionEmail.trim(),
            confirmation: deletionPhrase,
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (!response.ok) {
          setNotice({
            tone: "error",
            message: result?.message ?? "We could not delete that account. Please try again.",
          });
          return;
        }

        await createClient().auth.signOut();
        router.replace("/");
        router.refresh();
      } catch {
        setNotice({
          tone: "error",
          message: "We could not delete that account. Please try again.",
        });
      } finally {
        setPendingAction(null);
      }
    })();
  }

  function signOut() {
    void (async () => {
      setPendingAction("sign-out");
      setNotice(null);
      try {
        const { error } = await createClient().auth.signOut();
        if (error) {
          setNotice({
            tone: "error",
            message: "We could not sign you out. Please try again.",
          });
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {
        setNotice({
          tone: "error",
          message: "We could not sign you out. Please try again.",
        });
      } finally {
        setPendingAction(null);
      }
    })();
  }

  return (
    <main
      className="min-h-screen bg-[#f5fbff] pb-16 text-[#06334f]"
      aria-busy={pendingAction !== null || undefined}
    >
      <header className="border-b border-sky-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" className="min-h-11 px-2 font-bold">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Back to Yamzo
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 border-sky-100 bg-white">
            <Link href="/order-status">
              <ClipboardList aria-hidden="true" />
              Track orders
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-7 sm:px-6 sm:pt-10 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl bg-[#06334f] px-5 py-6 text-white shadow-[0_22px_58px_rgba(8,42,68,.18)] sm:px-8 sm:py-8">
          <div className="absolute -right-24 -top-28 size-64 rounded-full bg-sky-300/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/12 text-xl font-black ring-1 ring-white/20">
                {initialFor(email, snapshot.display_name)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-sky-200">Your Yamzo account</p>
                <h1 className="mt-1 truncate text-2xl font-black tracking-[-.045em] sm:text-3xl">
                  {snapshot.display_name || "Welcome to Yamzo"}
                </h1>
                <p className="mt-1 truncate text-sm text-sky-100/75">{email}</p>
              </div>
            </div>
            <Badge className="w-fit border-0 bg-emerald-100 text-emerald-950">
              <CheckCircle2 aria-hidden="true" />
              Secure account
            </Badge>
          </div>
        </section>

        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-5 rounded-2xl px-4 py-3 text-sm font-semibold",
              notice.tone === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-50 text-emerald-800",
            )}
          >
            {notice.message}
          </p>
        ) : null}

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <div className="grid items-start gap-6">
            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader className="border-b border-sky-100">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary">
                    <UserRound aria-hidden="true" className="size-4.5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg font-bold">Profile details</CardTitle>
                    <CardDescription className="mt-1 leading-5">
                      Keep your name and language preference ready for a faster checkout.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <form onSubmit={saveProfile} aria-busy={isBusy("profile") || undefined}>
                <CardContent className="pt-5">
                  <FieldGroup className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="account-display-name">Full name</FieldLabel>
                      <Input
                        id="account-display-name"
                        value={displayName}
                        autoComplete="name"
                        minLength={2}
                        maxLength={120}
                        required
                        disabled={isBusy("profile")}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="account-email">Email address</FieldLabel>
                      <InputGroup className="h-10 bg-muted">
                        <InputGroupAddon aria-hidden="true">
                          <Mail />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="account-email"
                          value={email}
                          readOnly
                          aria-readonly="true"
                        />
                      </InputGroup>
                      <FieldDescription>
                        Email is managed by secure sign-in and cannot be edited here.
                      </FieldDescription>
                    </Field>
                    <Field className="sm:max-w-xs">
                      <FieldLabel htmlFor="account-locale">Preferred language</FieldLabel>
                      <Select
                        value={preferredLocale}
                        onValueChange={(value) => setPreferredLocale(value as "en" | "bn")}
                        disabled={isBusy("profile")}
                      >
                        <SelectTrigger id="account-locale" className="h-10 w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="bn">বাংলা</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button type="submit" disabled={isBusy("profile")} className="min-h-10">
                    {isBusy("profile") ? <Spinner aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                    Save profile
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader className="border-b border-sky-100">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary">
                    <ShoppingBag aria-hidden="true" className="size-4.5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg font-bold">Current orders</CardTitle>
                    <CardDescription className="mt-1 leading-5">Live updates are shown from the same secure website order record.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {ongoingOrders.length === 0 ? (
                  <Empty className="min-h-40 border-sky-200 bg-sky-50/45">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="bg-white text-primary">
                        <ShoppingBag aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No ongoing orders right now</EmptyTitle>
                      <EmptyDescription>
                        New website orders will appear here with their live status.
                      </EmptyDescription>
                    </EmptyHeader>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/order-status">Track an order</Link>
                    </Button>
                  </Empty>
                ) : (
                  <div className="grid gap-3">
                    {ongoingOrders.map((order) => <OrderRow key={order.order_reference} order={order} />)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader className="border-b border-sky-100">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary">
                    <ClipboardList aria-hidden="true" className="size-4.5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg font-bold">Order history</CardTitle>
                    <CardDescription className="mt-1 leading-5">Your signed-in account keeps up to 100 recent website orders together.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {orderHistory.length === 0 ? (
                  <Empty className="min-h-36 border-sky-200 bg-sky-50/45">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="bg-white text-primary">
                        <ClipboardList aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>Your order history is waiting</EmptyTitle>
                      <EmptyDescription>
                        Completed and cancelled website orders will stay here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid gap-3">
                    {orderHistory.map((order) => <OrderRow key={order.order_reference} order={order} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="grid content-start gap-6">
            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary">
                    <Phone aria-hidden="true" className="size-4.5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg font-bold">Saved phones</CardTitle>
                    <CardDescription className="mt-1 leading-5">Keep up to five Bangladesh mobile numbers. Your primary number is used first at checkout.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {snapshot.phones.length ? (
                  <div className="grid gap-2">
                    {snapshot.phones.map((savedPhone) => (
                      <div key={savedPhone.id} className="flex items-center gap-2 rounded-xl border border-sky-100 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{formatPhone(savedPhone.phone_e164)}</p>
                          <p className="text-xs text-muted-foreground">{savedPhone.label}</p>
                        </div>
                        {savedPhone.is_primary ? <Badge variant="secondary">Primary</Badge> : <Button type="button" size="xs" variant="outline" disabled={isBusy(`phone-primary-${savedPhone.id}`)} onClick={() => void runRpc(`phone-primary-${savedPhone.id}`, () => createClient().schema("api").rpc("save_my_phone", { p_phone: savedPhone.phone_e164, p_label: savedPhone.label, p_make_primary: true }), "Primary phone updated.")}>Make primary</Button>}
                        <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${formatPhone(savedPhone.phone_e164)}`} disabled={isBusy(`phone-remove-${savedPhone.id}`)} onClick={() => void runRpc(`phone-remove-${savedPhone.id}`, () => createClient().schema("api").rpc("remove_my_phone", { p_phone_id: savedPhone.id }), "Phone number removed.")}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <form onSubmit={savePhone} className="grid gap-3 rounded-2xl bg-sky-50/65 p-3" aria-busy={isBusy("phone-save") || undefined}>
                  <div className="grid gap-2">
                    <Label htmlFor="account-phone">Phone number</Label>
                    <Input id="account-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="01712345678" value={phone} maxLength={13} required disabled={isBusy("phone-save")} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 13))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="account-phone-label">Label</Label>
                    <Input id="account-phone-label" value={phoneLabel} maxLength={40} required disabled={isBusy("phone-save")} onChange={(event) => setPhoneLabel(event.target.value)} placeholder="Mobile" />
                  </div>
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-semibold">
                    Make this my primary phone
                    <Switch checked={phonePrimary} disabled={isBusy("phone-save")} onCheckedChange={setPhonePrimary} aria-label="Make this my primary phone" />
                  </label>
                  <Button type="submit" disabled={isBusy("phone-save")} className="min-h-10 w-full">
                    {isBusy("phone-save") ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}
                    Save phone
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card id="saved-address-form" className="scroll-mt-6 rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary">
                    <MapPin aria-hidden="true" className="size-4.5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg font-bold">Saved addresses</CardTitle>
                    <CardDescription className="mt-1 leading-5">Keep up to five Uttara addresses ready. Road and house numbers accept digits only.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {snapshot.addresses.length ? <div className="grid gap-2">{snapshot.addresses.map((savedAddress) => <div key={savedAddress.id} className="rounded-xl border border-sky-100 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{savedAddress.label}</p>{savedAddress.is_default ? <Badge variant="secondary">Default</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">House {savedAddress.house_number}, Road {savedAddress.road_number}, Sector {savedAddress.sector_number}, Flat {savedAddress.flat_number}</p></div><Button type="button" size="icon-xs" variant="ghost" aria-label={`Edit ${savedAddress.label} address`} onClick={() => editAddress(savedAddress)}><Pencil aria-hidden="true" /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${savedAddress.label} address`} disabled={isBusy(`address-remove-${savedAddress.id}`)} onClick={() => void runRpc(`address-remove-${savedAddress.id}`, () => createClient().schema("api").rpc("remove_my_delivery_address", { p_address_id: savedAddress.id }), "Delivery address removed.")}><Trash2 aria-hidden="true" /></Button></div></div>)}</div> : null}
                <form onSubmit={saveAddress} className="grid gap-3 rounded-2xl bg-sky-50/65 p-3" aria-busy={isBusy("address-save") || undefined}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{address.id ? "Edit delivery address" : "Add delivery address"}</p>{address.id ? <Button type="button" size="xs" variant="ghost" onClick={() => setAddress(emptyAddress)}>Cancel edit</Button> : null}</div>
                  <div className="grid gap-2"><Label htmlFor="account-address-label">Label</Label><Input id="account-address-label" value={address.label} maxLength={40} required disabled={isBusy("address-save")} onChange={(event) => setAddress((current) => ({ ...current, label: event.target.value }))} placeholder="Home" /></div>
                  <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="account-sector">Sector</Label><Input id="account-sector" inputMode="numeric" value={address.sector} maxLength={2} required disabled={isBusy("address-save")} onChange={(event) => setAddress((current) => ({ ...current, sector: event.target.value.replace(/\D/g, "").slice(0, 2) }))} /></div><div className="grid gap-2"><Label htmlFor="account-road">Road</Label><Input id="account-road" inputMode="numeric" value={address.road} maxLength={40} required disabled={isBusy("address-save")} onChange={(event) => setAddress((current) => ({ ...current, road: event.target.value.replace(/\D/g, "").slice(0, 40) }))} /></div><div className="grid gap-2"><Label htmlFor="account-house">House</Label><Input id="account-house" inputMode="numeric" value={address.house} maxLength={40} required disabled={isBusy("address-save")} onChange={(event) => setAddress((current) => ({ ...current, house: event.target.value.replace(/\D/g, "").slice(0, 40) }))} /></div><div className="grid gap-2"><Label htmlFor="account-flat">Flat</Label><Input id="account-flat" value={address.flat} maxLength={40} required disabled={isBusy("address-save")} onChange={(event) => setAddress((current) => ({ ...current, flat: event.target.value }))} /></div></div>
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-semibold">Use as my default address<Switch checked={address.makeDefault} disabled={isBusy("address-save")} onCheckedChange={(checked) => setAddress((current) => ({ ...current, makeDefault: checked }))} aria-label="Use as my default delivery address" /></label>
                  <Button type="submit" disabled={isBusy("address-save")} className="min-h-10 w-full">{isBusy("address-save") ? <Spinner aria-hidden="true" /> : address.id ? <CheckCircle2 aria-hidden="true" /> : <Plus aria-hidden="true" />}{address.id ? "Update address" : "Save address"}</Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-primary"><Globe2 aria-hidden="true" className="size-4.5" /></span><div><CardTitle className="text-lg font-bold">Offers & updates</CardTitle><CardDescription className="mt-1 leading-5">Choose whether Yamzo may send promotional email. Order updates stay separate.</CardDescription></div></div>
              </CardHeader>
              <CardContent>
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/65 p-3 text-sm"><span><span className="block font-bold">Email offers</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Only opt-in account email may be included in future campaigns.</span></span><Switch checked={marketingEnabled} disabled={isBusy("marketing-consent")} onCheckedChange={(checked) => void runRpc("marketing-consent", () => createClient().schema("api").rpc("set_my_marketing_consent", { p_enabled: checked }), checked ? "You are subscribed to Yamzo email offers." : "You are unsubscribed from Yamzo email offers.")} aria-label="Receive Yamzo promotional email offers" /></label>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-rose-100 bg-white shadow-sm">
              <CardHeader><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-700"><ShieldAlert aria-hidden="true" className="size-4.5" /></span><div><CardTitle className="text-lg font-bold">Account security</CardTitle><CardDescription className="mt-1 leading-5">Sign out on a shared device or permanently delete this customer account.</CardDescription></div></div></CardHeader>
              <CardContent className="grid gap-3"><Button type="button" variant="outline" className="min-h-10 w-full" disabled={isBusy("sign-out")} onClick={signOut}>{isBusy("sign-out") ? <Spinner aria-hidden="true" /> : null}Sign out</Button><AlertDialog open={deletionOpen} onOpenChange={setDeletionOpen}><AlertDialogTrigger asChild><Button type="button" variant="destructive" className="min-h-10 w-full">Delete account</Button></AlertDialogTrigger><AlertDialogContent className="max-w-md"><AlertDialogHeader><AlertDialogTitle>Delete this Yamzo account?</AlertDialogTitle><AlertDialogDescription>This is irreversible. Saved profile data, phones, addresses, and marketing consent will be removed. Existing order records stay retained for restaurant operations and legal obligations.</AlertDialogDescription></AlertDialogHeader><form onSubmit={deleteAccount} className="grid gap-4" aria-busy={isBusy("account-delete") || undefined}><div className="grid gap-2"><Label htmlFor="delete-account-email">Type your account email</Label><Input id="delete-account-email" type="email" autoComplete="email" value={deletionEmail} onChange={(event) => setDeletionEmail(event.target.value)} required disabled={isBusy("account-delete")} /></div><div className="grid gap-2"><Label htmlFor="delete-account-confirmation">Type DELETE</Label><Input id="delete-account-confirmation" value={deletionPhrase} onChange={(event) => setDeletionPhrase(event.target.value)} required disabled={isBusy("account-delete")} /></div><AlertDialogFooter><AlertDialogCancel type="button" disabled={isBusy("account-delete")}>Keep account</AlertDialogCancel><Button type="submit" variant="destructive" disabled={isBusy("account-delete") || deletionEmail.trim().toLowerCase() !== email.toLowerCase() || deletionPhrase !== "DELETE"}>{isBusy("account-delete") ? <Spinner aria-hidden="true" /> : <Trash2 aria-hidden="true" />}Delete permanently</Button></AlertDialogFooter></form></AlertDialogContent></AlertDialog></CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function OrderRow({ order }: { order: AccountOrder }) {
  return (
    <Link href={`/order-status?order=${encodeURIComponent(order.order_reference)}`} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 transition-colors hover:border-sky-200 hover:bg-sky-50/50">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-primary"><ShoppingBag aria-hidden="true" className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">#{order.order_reference.slice(3)}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(order.placed_at)} · {order.item_count} item{order.item_count === 1 ? "" : "s"}</span></span>
      <span className="flex shrink-0 flex-col items-end gap-1"><Badge className={cn("border-0 capitalize", statusTone(order.status))}>{statusLabel(order.status)}</Badge><span className="text-xs font-bold text-muted-foreground">{formatMoney(order.grand_total_minor)}</span></span>
    </Link>
  );
}
