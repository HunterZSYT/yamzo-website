"use client";

import { useActionState } from "react";
import { LockKeyhole, UserRoundCheck, Users } from "lucide-react";

import { updateStaffAccessAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { AdminDashboardSnapshot } from "@/lib/admin/types";

const roles = [
  ["owner", "Owner"],
  ["admin", "Administrator"],
  ["manager", "Manager"],
  ["cashier", "Cashier"],
  ["kitchen", "Kitchen"],
  ["content_editor", "Content editor"],
] as const;

function formatRequestedAt(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
  }).format(new Date(value));
}

export function StaffAccessCard({ snapshot }: { snapshot: AdminDashboardSnapshot }) {
  const [state, formAction, pending] = useActionState(
    updateStaffAccessAction,
    initialAdminActionState,
  );
  const pendingStaff = snapshot.staff.filter((staff) => staff.status === "pending");
  const unavailable = snapshot.staffAvailability !== "ready";

  return (
    <Card id="people" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-2" aria-labelledby="people-title">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><Users aria-hidden="true" className="size-4.5" /></span>
            <div>
              <CardTitle id="people-title" className="text-lg font-bold">Users & approvals</CardTitle>
              <CardDescription className="mt-1 leading-5">Approve staff, replace their exact role, or suspend access. Customer accounts stay separate.</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{snapshot.staffAvailability === "ready" ? `${pendingStaff.length} pending` : snapshot.staffAvailability === "permission_required" ? "Restricted" : "Unavailable"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {state.message ? <p aria-live="polite" className={state.status === "error" ? "mb-3 rounded-xl bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" : "mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"}>{state.message}</p> : null}
        {unavailable ? (
          <Empty className="min-h-48 border"><EmptyHeader><EmptyMedia variant="icon"><LockKeyhole aria-hidden="true" /></EmptyMedia><EmptyTitle>{snapshot.staffAvailability === "permission_required" ? "Staff management permission required" : "Staff data is safely unavailable"}</EmptyTitle><EmptyDescription>Account names and email addresses are shown only to staff with staff.manage permission.</EmptyDescription></EmptyHeader></Empty>
        ) : snapshot.staff.length === 0 ? (
          <Empty className="min-h-48 border"><EmptyHeader><EmptyMedia variant="icon"><UserRoundCheck aria-hidden="true" /></EmptyMedia><EmptyTitle>No staff accounts yet</EmptyTitle><EmptyDescription>New staff access requests will appear here for an owner or admin to review.</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <ItemGroup>
            {snapshot.staff.slice(0, 12).map((staff) => (
              <Item key={staff.staffId} variant="outline" className="items-start gap-3">
                <ItemMedia className="grid size-9 place-items-center rounded-xl bg-muted text-primary"><Users aria-hidden="true" className="size-4" /></ItemMedia>
                <ItemContent className="min-w-48">
                  <ItemTitle>{staff.displayName}</ItemTitle>
                  <p className="break-all text-xs text-muted-foreground">{staff.email} · {staff.status === "pending" ? "requested" : "joined"} {formatRequestedAt(staff.createdAt)}</p>
                </ItemContent>
                <ItemActions className="ml-auto w-full max-w-xl justify-end">
                  <form action={formAction} className="grid w-full gap-2 sm:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_auto_auto]">
                    <input type="hidden" name="userId" value={staff.staffId} />
                    <select name="roleKey" defaultValue={staff.roleKeys[0] ?? "cashier"} disabled={pending} aria-label={`Role for ${staff.displayName}`} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm font-semibold">
                      {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <Input name="suspendedReason" disabled={pending || staff.status === "pending"} placeholder="Suspension reason" aria-label={`Suspension reason for ${staff.displayName}`} className="min-h-10" />
                    <Button name="status" value="active" size="sm" disabled={pending}>{staff.status === "pending" ? "Approve" : staff.status === "suspended" ? "Reactivate" : "Update"}</Button>
                    {staff.status === "active" ? <Button name="status" value="suspended" size="sm" variant="destructive" disabled={pending}>Suspend</Button> : null}
                  </form>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
