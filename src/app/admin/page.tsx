import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAdminRepository } from "@/lib/admin/repository";
import type { ActiveAdminViewer } from "@/lib/admin/types";
import { getSiteAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations",
  description: "Protected Yamzo Uttara operations dashboard.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const access = await getSiteAccess();

  if (!access.viewer.isAuthenticated) {
    redirect("/login?next=/admin");
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

    return (
      <AdminAccessDenied
        state={deniedState}
        email={access.viewer.email}
      />
    );
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
  const snapshot = await repository.getDashboardSnapshot();

  return <AdminShell viewer={viewer} snapshot={snapshot} />;
}
