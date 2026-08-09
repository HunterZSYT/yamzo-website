import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <main
      className="min-h-screen bg-[#f5fbff] pb-16 text-[#06334f]"
      aria-busy="true"
      aria-label="Loading your Yamzo account"
    >
      <header className="border-b border-sky-100 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 pt-7 sm:px-6 sm:pt-10 lg:px-8">
        <Card className="border-0 bg-[#06334f] shadow-[0_22px_58px_rgba(8,42,68,.18)]">
          <CardContent className="flex items-center gap-4 p-6 sm:p-8">
            <Skeleton className="size-14 rounded-2xl bg-white/15" />
            <div className="grid flex-1 gap-3">
              <Skeleton className="h-3 w-32 bg-white/15" />
              <Skeleton className="h-8 max-w-sm bg-white/20" />
              <Skeleton className="h-4 w-52 bg-white/15" />
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <div className="grid gap-6">
            <AccountCardSkeleton rows={3} />
            <AccountCardSkeleton rows={2} />
            <AccountCardSkeleton rows={2} />
          </div>
          <aside className="grid content-start gap-6">
            <AccountCardSkeleton rows={4} />
            <AccountCardSkeleton rows={4} />
            <AccountCardSkeleton rows={2} />
          </aside>
        </div>
      </div>
      <p className="sr-only" role="status">
        Loading your Yamzo account.
      </p>
    </main>
  );
}

function AccountCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="border-sky-100 bg-white shadow-sm">
      <CardHeader className="border-b border-sky-100">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-5">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
