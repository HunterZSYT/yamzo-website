import {
  BellRing,
  CircleDollarSign,
  ClipboardList,
  TestTube2,
  UserRoundCheck,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDashboardSnapshot } from "@/lib/admin/types";

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-BD").format(value);
}
function formatMoney(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function AdminOverview({
  snapshot,
}: {
  snapshot: AdminDashboardSnapshot;
}) {
  const metrics = [
    {
      label: "Awaiting acceptance",
      value: formatCount(snapshot.metrics.pendingLiveOrders),
      note: "Live website orders",
      icon: BellRing,
      tone: "bg-[#e5f7ff] text-[#00689d]",
    },
    {
      label: "Orders today",
      value: formatCount(snapshot.metrics.liveOrdersToday),
      note: "Live mode only",
      icon: ClipboardList,
      tone: "bg-[#edf8ef] text-[#23713d]",
    },
    {
      label: "Delivered revenue",
      value: formatMoney(snapshot.metrics.liveRevenueTodayMinor),
      note: "Today, test orders excluded",
      icon: CircleDollarSign,
      tone: "bg-[#fff4dd] text-[#8b5500]",
    },
    {
      label: "Staff approvals",
      value: formatCount(snapshot.metrics.pendingStaffRequests),
      note: "Pending account requests",
      icon: UserRoundCheck,
      tone: "bg-[#f4edff] text-[#6d3ab2]",
    },
  ] as const;

  return (
    <section id="overview" aria-labelledby="overview-title" className="scroll-mt-32">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
            Operations center
          </p>
          <h1
            id="overview-title"
            className="mt-1 text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl"
          >
            Good service starts here.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Monitor Yamzo Uttara orders and prepare storefront content from one
            protected workspace.
          </p>
        </div>
        <Badge
          variant={
            snapshot.runtime.testModeEnabled
              ? "secondary"
              : snapshot.runtime.liveOrdersEnabled
                ? "default"
                : "outline"
          }
          className="h-7 px-3"
        >
          {snapshot.runtime.testModeEnabled
            ? "Test mode"
            : snapshot.runtime.liveOrdersEnabled
              ? "Live ordering"
              : "Ordering paused"}
        </Badge>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon, tone }) => (
          <Card key={label} className="gap-3 rounded-2xl bg-white shadow-sm">
            <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-3">
              <div>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">
                  {value}
                </CardTitle>
              </div>
              <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>
                <Icon aria-hidden="true" className="size-4.5" />
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-foreground/10">
          <TestTube2 aria-hidden="true" className="size-4 text-[#8b5500]" />
          <span className="text-muted-foreground">Pending test orders</span>
          <strong className="ml-auto">
            {formatCount(snapshot.metrics.pendingTestOrders)}
          </strong>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-foreground/10">
          <UtensilsCrossed aria-hidden="true" className="size-4 text-primary" />
          <span className="text-muted-foreground">Unavailable menu items</span>
          <strong className="ml-auto">
            {formatCount(snapshot.metrics.unavailableMenuItems)}
          </strong>
        </div>
      </div>
    </section>
  );
}
