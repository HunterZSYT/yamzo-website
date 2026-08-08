import type {
  ActiveAdminViewer,
  AdminDashboardSnapshot,
} from "@/lib/admin/types";

import { BannersCard } from "./banners-card";
import { BusinessHoursCard } from "./business-hours-card";
import { LayoutCard } from "./layout-card";
import { MenuManagementCard } from "./menu-management-card";
import { MetaConfigurationCard } from "./meta-configuration-card";
import { OffersCard } from "./offers-card";
import { StaffAccessCard } from "./staff-access-card";

export function AdminManagementSections({
  viewer,
  snapshot,
}: {
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  return (
    <section className="mt-8" aria-labelledby="management-title">
      <div>
        <p className="text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
          Storefront management
        </p>
        <h2
          id="management-title"
          className="mt-1 text-2xl font-extrabold tracking-[-0.04em]"
        >
          Content, access and integrations
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Permission-checked server actions call narrow, audited database contracts.
          Storefront copy is bilingual; secrets remain write-only.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MenuManagementCard viewer={viewer} snapshot={snapshot} />
        <BannersCard viewer={viewer} snapshot={snapshot} />
        <OffersCard viewer={viewer} snapshot={snapshot} />
        <BusinessHoursCard viewer={viewer} snapshot={snapshot} />
        <LayoutCard viewer={viewer} snapshot={snapshot} />
        <StaffAccessCard snapshot={snapshot} />
        <MetaConfigurationCard
          canManage={viewer.permissions.includes("integrations.manage")}
          configuration={snapshot.operations.meta}
        />
      </div>
    </section>
  );
}
