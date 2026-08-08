import { ArrowLeft, Clock3, LockKeyhole, LogOut, ShieldX } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

type AccessState = "pending" | "suspended" | "unassigned";

const copy: Record<
  AccessState,
  { title: string; description: string; icon: typeof Clock3 }
> = {
  pending: {
    title: "Approval is still pending",
    description:
      "An owner or administrator must approve this staff account before the operations dashboard can be opened.",
    icon: Clock3,
  },
  suspended: {
    title: "Staff access is suspended",
    description:
      "This account cannot open Yamzo operations. Contact the account owner if access should be restored.",
    icon: ShieldX,
  },
  unassigned: {
    title: "Staff access is not assigned",
    description:
      "You are signed in, but this account does not have a Yamzo staff profile. Ask an owner to add and approve it.",
    icon: LockKeyhole,
  },
};

export function AdminAccessDenied({
  state,
  email,
}: {
  state: AccessState;
  email: string | null;
}) {
  const message = copy[state];
  const Icon = message.icon;

  return (
    <main className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top_right,rgba(34,168,221,0.18),transparent_34%),var(--background)] p-4">
      <section
        className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-[0_1.5rem_5rem_rgba(8,42,68,0.12)] ring-1 ring-foreground/10 sm:p-8"
        aria-labelledby="admin-access-title"
      >
        <div className="grid size-12 place-items-center rounded-2xl bg-muted text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-5 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
          Yamzo operations
        </p>
        <h1
          id="admin-access-title"
          className="mt-2 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl"
        >
          {message.title}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {message.description}
        </p>
        {email ? (
          <p className="mt-5 rounded-xl bg-muted/70 px-4 py-3 text-sm">
            Signed in as <span className="font-semibold">{email}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="min-h-11 sm:flex-1">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Back to website
            </Link>
          </Button>
          <form action={signOut} className="sm:flex-1">
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="min-h-11 w-full"
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
