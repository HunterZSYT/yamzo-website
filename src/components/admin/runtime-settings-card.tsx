"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Globe2, Radio, Settings2, TestTube2 } from "lucide-react";

import { updateRuntimeModesAction } from "@/app/admin/actions";
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
import { Switch } from "@/components/ui/switch";
import type {
  ActiveAdminViewer,
  AdminDashboardSnapshot,
} from "@/lib/admin/types";
import { initialAdminActionState } from "@/lib/admin/action-state";

const settings = [
  {
    key: "sitePublished",
    title: "Public website",
    description: "Replace the coming-soon gate for public visitors.",
    icon: Globe2,
  },
  {
    key: "liveOrdersEnabled",
    title: "Live orders",
    description: "Allow real orders to reach the Yamzo POS queue.",
    icon: Radio,
  },
  {
    key: "testModeEnabled",
    title: "Test mode",
    description: "Keep staff test orders outside live reports and revenue.",
    icon: TestTube2,
  },
] as const;

export function RuntimeSettingsCard({
  viewer,
  snapshot,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  const canManage = viewer.permissions.includes("site.manage");
  const [state, formAction, pending] = useActionState(
    updateRuntimeModesAction,
    initialAdminActionState,
  );
  const [modes, setModes] = useState(snapshot.runtime);

  const updateMode = (key: keyof typeof modes, checked: boolean) => {
    setModes((current) => ({
      ...current,
      [key]: checked,
      ...(key === "liveOrdersEnabled" && checked
        ? { testModeEnabled: false }
        : {}),
      ...(key === "testModeEnabled" && checked
        ? { liveOrdersEnabled: false }
        : {}),
    }));
  };

  return (
    <Card
      id="settings"
      className="scroll-mt-32 rounded-2xl bg-white shadow-sm"
      aria-labelledby="runtime-settings-title"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-primary">
            <Settings2 aria-hidden="true" className="size-4.5" />
          </span>
          <Badge variant="outline">
            {canManage ? "Editable" : "Permission required"}
          </Badge>
        </div>
        <CardTitle id="runtime-settings-title" className="mt-3 text-lg font-bold">
          Website controls
        </CardTitle>
        <CardDescription className="leading-5">
          Current launch and ordering mode from Supabase.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
      <CardContent className="grid gap-2">
        <input type="hidden" name="published" value={String(modes.sitePublished)} />
        <input type="hidden" name="liveOrdersEnabled" value={String(modes.liveOrdersEnabled)} />
        <input type="hidden" name="testMode" value={String(modes.testModeEnabled)} />
        {settings.map(({ key, title, description, icon: Icon }) => (
          <div
            key={key}
            className="flex min-h-16 items-center gap-3 rounded-xl border border-border/80 px-3 py-2.5"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                {description}
              </p>
            </div>
            <Switch
              checked={modes[key]}
              disabled={!canManage || pending}
              onCheckedChange={(checked) => updateMode(key, checked)}
              aria-label={`${title}: ${modes[key] ? "on" : "off"}`}
            />
          </div>
        ))}

        <div className="mt-2 flex gap-2 rounded-xl bg-[#fff7df] p-3 text-[#684500]">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs leading-5">
            Live orders and test mode are mutually exclusive. Every change is
            authorized on the server and recorded in the operations audit log.
          </p>
        </div>
        {state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs font-semibold text-destructive" : "text-xs font-semibold text-emerald-700"}>{state.message}</p> : null}
      </CardContent>
      <CardFooter>
        <Button disabled={!canManage || pending} className="min-h-10 w-full">
          {pending ? "Saving…" : "Save runtime settings"}
        </Button>
      </CardFooter>
      </form>
    </Card>
  );
}
