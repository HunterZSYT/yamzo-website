import { Badge } from "@/components/ui/badge";
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
import { RuntimeSettingsCard } from "./runtime-settings-card";
import { StaffAccessCard } from "./staff-access-card";

export const adminManagementSections = [
  "menu",
  "banners",
  "offers",
  "hours",
  "people",
  "meta",
  "settings",
] as const;

export type AdminManagementSection = (typeof adminManagementSections)[number];

const sectionCopy: Record<
  AdminManagementSection,
  { eyebrow: string; title: string; description: string }
> = {
  menu: {
    eyebrow: "Catalog control",
    title: "Menu",
    description:
      "Keep items, categories, prices, availability, and modifier rules accurate for customers and the kitchen.",
  },
  banners: {
    eyebrow: "Storefront control",
    title: "Banners",
    description:
      "Publish focused, bilingual announcements without mixing them into day-to-day order operations.",
  },
  offers: {
    eyebrow: "Storefront control",
    title: "Offers",
    description:
      "Manage customer-facing offers from their own focused workspace.",
  },
  hours: {
    eyebrow: "Availability control",
    title: "Business hours",
    description:
      "Set normal service intervals and one-off exceptions in Asia/Dhaka time.",
  },
  people: {
    eyebrow: "Access control",
    title: "People",
    description:
      "Review staff access and roles separately from customer data and operational orders.",
  },
  meta: {
    eyebrow: "Integration control",
    title: "Meta",
    description:
      "Manage the consent-aware Pixel and write-only Conversions API configuration.",
  },
  settings: {
    eyebrow: "Operations control",
    title: "Settings",
    description:
      "Control public publishing, ordering mode, and homepage section presentation in one focused screen.",
  },
};

export function isAdminManagementSection(
  value: string,
): value is AdminManagementSection {
  return adminManagementSections.includes(value as AdminManagementSection);
}

export function AdminManagementPage({
  section,
  viewer,
  snapshot,
}: {
  section: AdminManagementSection;
  viewer: ActiveAdminViewer;
  snapshot: AdminDashboardSnapshot;
}) {
  const copy = sectionCopy[section];

  return (
    <section className="space-y-6" aria-labelledby="management-page-title">
      <header className="max-w-3xl space-y-3">
        <Badge variant="outline" className="w-fit font-semibold tracking-wide uppercase">
          {copy.eyebrow}
        </Badge>
        <div className="space-y-2">
          <h1
            id="management-page-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {copy.title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {copy.description}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-6">
        {section === "menu" ? (
          <MenuManagementCard viewer={viewer} snapshot={snapshot} />
        ) : null}
        {section === "banners" ? (
          <BannersCard viewer={viewer} snapshot={snapshot} />
        ) : null}
        {section === "offers" ? (
          <OffersCard viewer={viewer} snapshot={snapshot} />
        ) : null}
        {section === "hours" ? (
          <BusinessHoursCard viewer={viewer} snapshot={snapshot} />
        ) : null}
        {section === "people" ? <StaffAccessCard snapshot={snapshot} /> : null}
        {section === "meta" ? (
          <MetaConfigurationCard
            canManage={viewer.permissions.includes("integrations.manage")}
            configuration={snapshot.operations.meta}
          />
        ) : null}
        {section === "settings" ? (
          <>
            <RuntimeSettingsCard viewer={viewer} snapshot={snapshot} />
            <LayoutCard viewer={viewer} snapshot={snapshot} />
          </>
        ) : null}
      </div>
    </section>
  );
}
