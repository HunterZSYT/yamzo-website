import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOrderWorkspace } from "@/components/admin/order-workspace";
import { createAdminRepository } from "@/lib/admin/repository";
import type { ActiveAdminViewer } from "@/lib/admin/types";
import { getSiteAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders | Operations",
  description: "Protected Yamzo Uttara website-order workspace.",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const [access, params] = await Promise.all([getSiteAccess(), searchParams]);

  if (!access.viewer.isAuthenticated) {
    redirect("/login?next=/admin/orders");
  }

  const { staff } = access.viewer;
  if (
    !staff ||
    staff.status !== "active" ||
    !staff.role_key ||
    staff.permissions.length === 0
  ) {
    const deniedState =
      staff?.status === "pending"
        ? "pending"
        : staff?.status === "suspended"
          ? "suspended"
          : "unassigned";

    return <AdminAccessDenied state={deniedState} email={access.viewer.email} />;
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
  const [snapshot, orderWorkspace] = await Promise.all([
    repository.getDashboardSnapshot(),
    repository.getOrderWorkspaceSnapshot(),
  ]);
  const initialOrderId =
    typeof params.order === "string" && /^[0-9a-f-]{36}$/i.test(params.order)
      ? params.order
      : null;

  return (
    <AdminShell viewer={viewer} snapshot={snapshot} activeSection="orders">
      <AdminOrderWorkspace
        viewer={viewer}
        snapshot={orderWorkspace}
        initialOrderId={initialOrderId}
      />
    </AdminShell>
  );
}
