"use client";

import { useActionState } from "react";
import { CalendarClock, Clock3, Trash2 } from "lucide-react";

import {
  deleteBusinessExceptionAction,
  setBusinessHourAction,
  upsertBusinessExceptionAction,
} from "@/app/admin/content-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAdminActionState } from "@/lib/admin/action-state";
import type { ActiveAdminViewer, AdminDashboardSnapshot } from "@/lib/admin/types";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function shortTime(value: string | null, fallback: string) {
  return value?.slice(0, 5) ?? fallback;
}

function ActionMessage({ state }: { state: typeof initialAdminActionState }) {
  return state.message ? (
    <p
      aria-live="polite"
      className={state.status === "error" ? "text-xs font-semibold text-destructive" : "text-xs font-semibold text-emerald-700"}
    >
      {state.message}
    </p>
  ) : null;
}

export function BusinessHoursCard({
  viewer,
  snapshot,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  const [hoursState, hoursAction, hoursPending] = useActionState(
    setBusinessHourAction,
    initialAdminActionState,
  );
  const [exceptionState, exceptionAction, exceptionPending] = useActionState(
    upsertBusinessExceptionAction,
    initialAdminActionState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteBusinessExceptionAction,
    initialAdminActionState,
  );
  const canManage = viewer.permissions.includes("site.manage");
  const hours = snapshot.operations.businessHours;
  const exceptions = snapshot.operations.businessHourExceptions;

  return (
    <Card id="hours" className="scroll-mt-32 rounded-2xl bg-white shadow-sm xl:col-span-4" aria-labelledby="hours-title">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-primary"><Clock3 aria-hidden="true" className="size-4.5" /></span>
            <div>
              <CardTitle id="hours-title" className="text-lg font-bold">Business hours · ব্যবসার সময়</CardTitle>
              <CardDescription className="mt-1 leading-5">Weekly intervals and one-off exceptions are interpreted in Asia/Dhaka, including overnight service.</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{canManage ? "Dhaka time" : "Permission required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5">
        {!canManage || !hours ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">Verified schedule controls are unavailable for this account.</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4 text-primary" /><h3 className="text-sm font-bold">Weekly schedule</h3></div>
            <ActionMessage state={hoursState} />
            <div className="grid gap-2 lg:grid-cols-2">
              {days.flatMap((day, dayOfWeek) => {
                const intervals = hours.filter((row) => row.dayOfWeek === dayOfWeek);
                const rows = intervals.length > 0 ? intervals : [{ dayOfWeek, intervalNumber: 1, opensAt: null, closesAt: null, isClosed: true }];
                return rows.map((interval) => (
                  <form key={`${day}-${interval.intervalNumber}`} action={hoursAction} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[8rem_1fr_1fr_8rem_auto] sm:items-end">
                    <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
                    <input type="hidden" name="intervalNumber" value={interval.intervalNumber} />
                    <p className="pb-2 text-sm font-bold">{day}<span className="block text-xs font-normal text-muted-foreground">Interval {interval.intervalNumber}</span></p>
                    <label className="grid gap-1 text-xs font-semibold">Opens<Input type="time" name="opensAt" defaultValue={shortTime(interval.opensAt, "11:00")} disabled={hoursPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">Closes<Input type="time" name="closesAt" defaultValue={shortTime(interval.closesAt, "23:00")} disabled={hoursPending} /></label>
                    <label className="grid gap-1 text-xs font-semibold">Status<select name="isClosed" defaultValue={String(interval.isClosed)} disabled={hoursPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="false">Open</option><option value="true">Closed</option></select></label>
                    <Button size="sm" disabled={hoursPending}>{hoursPending ? "Saving…" : "Save"}</Button>
                  </form>
                ));
              })}
            </div>
            <details className="rounded-xl border border-dashed">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">Add or replace interval 2–4</summary>
              <form action={hoursAction} className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-6">
                <label className="grid gap-1 text-xs font-semibold">Day<select name="dayOfWeek" defaultValue="5" disabled={hoursPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold">Interval<select name="intervalNumber" defaultValue="2" disabled={hoursPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
                <label className="grid gap-1 text-xs font-semibold">Opens<Input type="time" name="opensAt" defaultValue="11:00" disabled={hoursPending} /></label>
                <label className="grid gap-1 text-xs font-semibold">Closes<Input type="time" name="closesAt" defaultValue="23:00" disabled={hoursPending} /></label>
                <label className="grid gap-1 text-xs font-semibold">Status<select name="isClosed" defaultValue="false" disabled={hoursPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="false">Open</option><option value="true">Closed</option></select></label>
                <Button className="self-end" disabled={hoursPending}>{hoursPending ? "Saving…" : "Save interval"}</Button>
              </form>
            </details>
          </div>
        )}

        {canManage && exceptions ? (
          <div className="grid gap-3 border-t pt-5">
            <h3 className="text-sm font-bold">Special date exception · বিশেষ দিনের সময়</h3>
            <ActionMessage state={exceptionState} />
            <form action={exceptionAction} className="grid gap-3 rounded-xl bg-muted/45 p-4 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="intervalNumber" value="1" />
              <div className="grid gap-1.5"><Label htmlFor="exception-date">Service date</Label><Input id="exception-date" type="date" name="serviceDate" required disabled={exceptionPending} /></div>
              <div className="grid gap-1.5"><Label htmlFor="exception-status">Status</Label><select id="exception-status" name="isClosed" defaultValue="true" disabled={exceptionPending} className="min-h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="true">Closed all day</option><option value="false">Special opening</option></select></div>
              <div className="grid gap-1.5"><Label htmlFor="exception-opens">Opens</Label><Input id="exception-opens" type="time" name="opensAt" defaultValue="11:00" disabled={exceptionPending} /></div>
              <div className="grid gap-1.5"><Label htmlFor="exception-closes">Closes</Label><Input id="exception-closes" type="time" name="closesAt" defaultValue="23:00" disabled={exceptionPending} /></div>
              <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="reason-en">Reason (English)</Label><Input id="reason-en" name="reasonEn" maxLength={240} placeholder="Eid holiday" disabled={exceptionPending} /></div>
              <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="reason-bn">কারণ (বাংলা)</Label><Input id="reason-bn" name="reasonBn" maxLength={240} placeholder="ঈদের ছুটি" disabled={exceptionPending} /></div>
              <Button className="md:col-span-2 xl:col-span-4" disabled={exceptionPending}>{exceptionPending ? "Saving…" : "Add exception"}</Button>
            </form>
            <ActionMessage state={deleteState} />
            {exceptions.length > 0 ? (
              <ul className="grid gap-2">
                {exceptions.map((exception) => (
                  <li key={exception.id} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                    <strong>{exception.serviceDate}</strong>
                    <Badge variant={exception.isClosed ? "secondary" : "outline"}>{exception.isClosed ? "Closed" : `${shortTime(exception.opensAt, "—")}–${shortTime(exception.closesAt, "—")}`}</Badge>
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">{exception.reasonEn ?? exception.reasonBn ?? "No reason added"}</span>
                    <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Remove the exception for ${exception.serviceDate}?`)) event.preventDefault(); }}>
                      <input type="hidden" name="id" value={exception.id} />
                      <Button type="submit" size="sm" variant="destructive" disabled={deletePending}><Trash2 aria-hidden="true" />Remove<span className="sr-only"> exception for {exception.serviceDate}</span></Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No date-specific exceptions.</p>}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
