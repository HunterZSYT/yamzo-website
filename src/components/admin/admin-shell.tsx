import {
  BadgePercent,
  Clock3,
  ExternalLink,
  ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings2,
  ShoppingBag,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ActiveAdminViewer,
  AdminDashboardSnapshot,
} from "@/lib/admin/types";

import { AdminManagementSections } from "./management-sections";
import { AdminOrderQueue } from "./order-queue";
import { AdminOverview } from "./overview";
import { RuntimeSettingsCard } from "./runtime-settings-card";

const navigation = [
  { key: "overview", href: "#overview", label: "Overview", icon: LayoutDashboard },
  { key: "orders", href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { key: "menu", href: "#menu", label: "Menu", icon: UtensilsCrossed },
  { key: "banners", href: "#banners", label: "Banners", icon: ImageIcon },
  { key: "offers", href: "#offers", label: "Offers", icon: BadgePercent },
  { key: "hours", href: "#hours", label: "Hours", icon: Clock3 },
  { key: "people", href: "#people", label: "People", icon: Users },
  { key: "customers", href: "/admin/customers", label: "Customers", icon: Users },
  { key: "meta", href: "#meta", label: "Meta", icon: Megaphone },
  { key: "settings", href: "#settings", label: "Settings", icon: Settings2 },
] as const;

type AdminShellSection = "overview" | "orders" | "customers";

export function AdminShell({
  viewer,
  snapshot,
  children,
  activeSection = "overview",
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
  children?: ReactNode;
  activeSection?: AdminShellSection;
}) {
  return (
    <div className="min-h-svh bg-[#f3f8fb] text-foreground">
      <a
        href="#admin-content"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to dashboard content
      </a>
      <div className="mx-auto grid min-h-svh max-w-[112rem] lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border/80 bg-white/85 px-4 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
          <Link
            href="/admin"
            className="flex min-h-12 items-center gap-3 rounded-2xl px-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid size-11 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-foreground/10">
              <Image
                src="/brand/yamzo-logo.png"
                alt=""
                width={52}
                height={52}
                className="size-12 object-contain"
              />
            </span>
            <span>
              <strong className="block text-sm font-extrabold tracking-[-0.03em]">
                Yamzo Uttara
              </strong>
              <span className="text-xs text-muted-foreground">Operations</span>
            </span>
          </Link>

          <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Admin sections">
            {navigation.map(({ href, label, icon: Icon, ...item }) => (
              <Link
                key={href}
                href={href}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  item.key === activeSection
                    ? "bg-muted text-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="rounded-2xl bg-muted/70 p-3 ring-1 ring-foreground/5">
            <p className="truncate text-xs font-bold">{viewer.email ?? "Staff account"}</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground">
              {viewer.roleKey.replaceAll("_", " ")}
            </p>
            <form action={signOut} className="mt-3">
              <Button type="submit" variant="ghost" className="min-h-10 w-full justify-start">
                <LogOut aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border/80 bg-white/88 backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/admin" className="flex items-center gap-2 lg:hidden">
                <Image
                  src="/brand/yamzo-logo.png"
                  alt="Yamzo"
                  width={40}
                  height={40}
                  className="size-10 rounded-xl bg-white object-contain ring-1 ring-foreground/10"
                />
                <span className="text-sm font-extrabold">Operations</span>
              </Link>
              <div className="hidden items-center gap-2 lg:flex">
                <Badge
                  variant={snapshot.backendReady ? "default" : "destructive"}
                  className="h-6"
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${
                      snapshot.backendReady ? "bg-white" : "bg-destructive"
                    }`}
                  />
                  {snapshot.backendReady ? "Backend connected" : "Safe mode"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Asia/Dhaka
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="lg" className="min-h-11">
                  <Link
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View website"
                  >
                    <span className="hidden sm:inline">View website</span>
                    <ExternalLink aria-hidden="true" />
                  </Link>
                </Button>
                <form action={signOut} className="lg:hidden">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Sign out"
                  >
                    <LogOut aria-hidden="true" />
                  </Button>
                </form>
              </div>
            </div>
            <nav
              className="flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-2 lg:hidden"
              aria-label="Admin sections"
            >
              {navigation.map(({ href, label, icon: Icon, ...item }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                    item.key === activeSection
                      ? "bg-muted text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {label}
                </Link>
              ))}
            </nav>
          </header>

          <main
            id="admin-content"
            className="mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
          >
            {!snapshot.backendReady ? (
              <div
                className="mb-6 flex items-start gap-3 rounded-2xl border border-[#e2a422]/30 bg-[#fff7df] p-4 text-[#684500]"
                role="status"
              >
                <Settings2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-bold">Read-only safe mode is active</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">
                    Operational data could not be verified. Runtime controls and all
                    write actions remain locked.
                  </p>
                </div>
              </div>
            ) : null}

            {children ?? (
              <>
                <AdminOverview snapshot={snapshot} />

                <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(21rem,0.75fr)]">
                  <AdminOrderQueue viewer={viewer} snapshot={snapshot} />
                  <RuntimeSettingsCard viewer={viewer} snapshot={snapshot} />
                </div>

                <AdminManagementSections viewer={viewer} snapshot={snapshot} />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
