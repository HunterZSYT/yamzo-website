import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <main className="auth-page" aria-busy="true" aria-label="Loading sign in">
      <div className="auth-page-wash" aria-hidden="true" />
      <Card className="auth-card gap-0 py-0">
        <CardHeader className="auth-card-header">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-2xl" />
            <div className="grid gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-60" />
            </div>
          </div>
          <Skeleton className="mt-6 h-12 w-full" />
        </CardHeader>
        <CardContent className="auth-card-content grid gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>
      <p className="sr-only" role="status">
        Loading secure sign in.
      </p>
    </main>
  );
}
