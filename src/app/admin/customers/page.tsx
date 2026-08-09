import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminShell } from "@/components/admin/admin-shell";
import { CustomerOperations } from "@/components/customers/customer-operations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminRepository } from "@/lib/admin/repository";
import type { ActiveAdminViewer } from "@/lib/admin/types";
import { getSiteAccess } from "@/lib/auth/access";
import {
  customerDirectorySchema,
  marketingSnapshotSchema,
} from "@/lib/customers/schemas";
import { isCustomerMessagingConfigured } from "@/lib/customers/messaging";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers | Yamzo Operations",
  description: "Protected Yamzo customer operations workspace.",
  robots: { index: false, follow: false },
};

function asString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function requestedPage(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 201
    ? parsed
    : 1;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const access = await getSiteAccess();
  if (!access.viewer.isAuthenticated) redirect("/login?next=/admin/customers");

  const { staff } = access.viewer;
  if (!staff || staff.status !== "active" || !staff.role_key || staff.permissions.length === 0) {
    return <AdminAccessDenied state={staff?.status === "pending" ? "pending" : staff?.status === "suspended" ? "suspended" : "unassigned"} email={access.viewer.email} />;
  }

  const viewer: ActiveAdminViewer = {
    staffId: staff.staff_id,
    email: access.viewer.email,
    roleKey: staff.role_key,
    permissions: staff.permissions,
  };
  const repository = createAdminRepository({
    viewer,
    runtime: access.runtime,
    backendReady: access.backendReady,
  });
  const shellSnapshot = await repository.getDashboardSnapshot();

  if (!staff.permissions.includes("customers.manage")) {
    return (
      <AdminShell viewer={viewer} snapshot={shellSnapshot} activeSection="customers">
        <Card className="mx-auto w-full max-w-lg rounded-3xl bg-white shadow-xl">
          <CardHeader><CardTitle>Customer operations are restricted</CardTitle></CardHeader>
          <CardContent className="grid gap-5"><p className="text-sm leading-6 text-muted-foreground">Your active staff role does not include customer management. Ask an owner to review access if you need this workspace.</p><Button asChild><Link href="/admin">Back to operations</Link></Button></CardContent>
        </Card>
      </AdminShell>
    );
  }

  const parameters = await searchParams;
  const query = asString(parameters.q).trim().slice(0, 120);
  const page = requestedPage(asString(parameters.page));
  const client = await createClient();
  const [marketingResult, directoryResult] = await Promise.all([
    client.schema("api").rpc("get_marketing_snapshot"),
    client.schema("api").rpc("get_customer_directory", {
      p_search: query || null,
      p_limit: 50,
      p_offset: (page - 1) * 50,
    }),
  ]);

  const marketing = marketingResult.error
    ? null
    : marketingSnapshotSchema.safeParse(marketingResult.data).data ?? null;
  const directory = directoryResult.error
    ? null
    : customerDirectorySchema.safeParse(directoryResult.data).data ?? null;

  return (
    <AdminShell viewer={viewer} snapshot={shellSnapshot} activeSection="customers">
      <CustomerOperations
        snapshot={marketing}
        directory={directory}
        query={query}
        page={page}
        messagingConfigured={isCustomerMessagingConfigured()}
      />
    </AdminShell>
  );
}
