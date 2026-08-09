import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  AdminManagementPage,
  isAdminManagementSection,
} from "@/components/admin/admin-management-page";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminShell } from "@/components/admin/admin-shell";
import { createAdminRepository } from "@/lib/admin/repository";
import type { ActiveAdminViewer } from "@/lib/admin/types";
import { getSiteAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations | Yamzo Uttara",
  robots: { index: false, follow: false },
};

export default async function AdminManagementSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!isAdminManagementSection(section)) {
    notFound();
  }

  const access = await getSiteAccess();
  if (!access.viewer.isAuthenticated) {
    redirect(`/login?next=/admin/${section}`);
  }

  const { staff } = access.viewer;
  if (
    !staff ||
    staff.status !== "active" ||
    !staff.role_key ||
    staff.permissions.length === 0
  ) {
    return (
      <AdminAccessDenied
        state={
          staff?.status === "pending"
            ? "pending"
            : staff?.status === "suspended"
              ? "suspended"
              : "unassigned"
        }
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

  return (
    <AdminShell viewer={viewer} snapshot={snapshot} activeSection={section}>
      <AdminManagementPage section={section} viewer={viewer} snapshot={snapshot} />
    </AdminShell>
  );
}
