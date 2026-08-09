import "server-only";

import { z } from "zod";

import type { SiteRuntime } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

import {
  ADMIN_ORDER_STATUSES,
  type ActiveAdminViewer,
  type AdminContentCounts,
  type AdminDashboardSnapshot,
  type AdminOperationsSnapshot,
  type AdminOrderSummary,
  type AdminOrderWorkspaceSnapshot,
  type AdminStaffSummary,
} from "./types";

const dashboardSchema = z.object({
  runtime: z.object({
    site_published: z.boolean(),
    live_orders_enabled: z.boolean(),
    test_mode_enabled: z.boolean(),
  }),
  pending_live_orders: z.number().int().nonnegative().nullable(),
  pending_test_orders: z.number().int().nonnegative().nullable(),
  live_orders_today: z.number().int().nonnegative().nullable(),
  live_revenue_today_minor: z.number().int().nonnegative().nullable(),
  pending_staff_requests: z.number().int().nonnegative().nullable(),
  unavailable_menu_items: z.number().int().nonnegative().nullable(),
});

const orderSchema = z.object({
  order_id: z.string().uuid(),
  order_reference: z.string().min(1).max(80),
  mode: z.enum(["live", "test"]),
  status: z.enum(ADMIN_ORDER_STATUSES),
  version: z.number().int().nonnegative(),
  grand_total_minor: z.number().int().nonnegative(),
  currency_code: z.string().min(3).max(8),
  placed_at: z.string().datetime({ offset: true }),
  accepted_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  archived_at: z.string().datetime({ offset: true }).nullable().optional().default(null),
});

const staffSchema = z.object({
  staff_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().min(1).max(120),
  status: z.enum(["pending", "active", "suspended"]),
  role_keys: z.array(z.string().min(1).max(80)),
  approved_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

const idRowsSchema = z.array(z.object({ id: z.string().uuid() }));

const operationsSchema = z.object({
  business_hours: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        interval_number: z.number().int().min(1).max(4),
        opens_at: z.string().nullable(),
        closes_at: z.string().nullable(),
        is_closed: z.boolean(),
      }),
    )
    .nullable(),
  business_hour_exceptions: z
    .array(
      z.object({
        id: z.string().uuid(),
        service_date: z.string(),
        interval_number: z.number().int().min(1).max(4),
        opens_at: z.string().nullable(),
        closes_at: z.string().nullable(),
        is_closed: z.boolean(),
        reason_en: z.string().nullable(),
        reason_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  menu_categories: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        is_active: z.boolean(),
        is_featured: z.boolean(),
        sort_order: z.number().int(),
        name_en: z.string().nullable(),
        name_bn: z.string().nullable(),
        description_en: z.string().nullable(),
        description_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  menu_items: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        base_price_minor: z.number().int().nonnegative(),
        compare_at_price_minor: z.number().int().nonnegative().nullable(),
        is_active: z.boolean(),
        is_available: z.boolean(),
        is_featured: z.boolean(),
        preparation_minutes: z.number().int().nullable(),
        sort_order: z.number().int(),
        name_en: z.string().nullable(),
        name_bn: z.string().nullable(),
        description_en: z.string().nullable(),
        description_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  modifier_groups: z
    .array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        minimum_selections: z.number().int(),
        maximum_selections: z.number().int(),
        presentation: z.enum(["modifier", "variant"]),
        is_active: z.boolean(),
        sort_order: z.number().int(),
        name_en: z.string().nullable(),
        name_bn: z.string().nullable(),
        description_en: z.string().nullable(),
        description_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  modifier_options: z
    .array(
      z.object({
        id: z.string().uuid(),
        group_id: z.string().uuid(),
        price_delta_minor: z.number().int().nonnegative(),
        is_active: z.boolean(),
        sort_order: z.number().int(),
        name_en: z.string().nullable(),
        name_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  banners: z
    .array(
      z.object({
        id: z.string().uuid(),
        placement: z.enum(["hero", "announcement", "cart"]),
        media_id: z.string().uuid().nullable(),
        action_url: z.string().nullable(),
        is_active: z.boolean(),
        starts_at: z.string().datetime({ offset: true }).nullable(),
        ends_at: z.string().datetime({ offset: true }).nullable(),
        sort_order: z.number().int(),
        eyebrow_en: z.string().nullable(),
        eyebrow_bn: z.string().nullable(),
        title_en: z.string().nullable(),
        title_bn: z.string().nullable(),
        body_en: z.string().nullable(),
        body_bn: z.string().nullable(),
        action_label_en: z.string().nullable(),
        action_label_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  offers: z
    .array(
      z.object({
        id: z.string().uuid(),
        code: z.string().nullable(),
        kind: z.enum(["percent", "fixed", "free_delivery"]),
        value: z.number().int(),
        maximum_discount_minor: z.number().int().nonnegative().nullable(),
        minimum_subtotal_minor: z.number().int().nonnegative(),
        is_active: z.boolean(),
        is_stackable: z.boolean(),
        starts_at: z.string().datetime({ offset: true }).nullable(),
        ends_at: z.string().datetime({ offset: true }).nullable(),
        priority: z.number().int(),
        name_en: z.string().nullable(),
        name_bn: z.string().nullable(),
        description_en: z.string().nullable(),
        description_bn: z.string().nullable(),
        terms_en: z.string().nullable(),
        terms_bn: z.string().nullable(),
        targets: z.array(
          z.object({
            target_kind: z.enum(["all", "category", "item"]),
            target_id: z.string().uuid().nullable(),
          }),
        ),
      }),
    )
    .nullable(),
  home_sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        section_key: z.string(),
        kind: z.enum(["banner", "offers", "categories", "menu", "reviews", "custom"]),
        is_active: z.boolean(),
        sort_order: z.number().int(),
        title_en: z.string().nullable(),
        title_bn: z.string().nullable(),
        subtitle_en: z.string().nullable(),
        subtitle_bn: z.string().nullable(),
      }),
    )
    .nullable(),
  meta: z
    .object({
      enabled: z.boolean(),
      pixel_id: z.string().nullable(),
      token_configured: z.boolean(),
      updated_at: z.string().datetime({ offset: true }),
    })
    .nullable(),
});

const emptyOperations: AdminOperationsSnapshot = {
  businessHours: null,
  businessHourExceptions: null,
  menuCategories: null,
  menuItems: null,
  modifierGroups: null,
  modifierOptions: null,
  banners: null,
  offers: null,
  homeSections: null,
  meta: null,
};

type RepositoryContext = {
  viewer: ActiveAdminViewer;
  runtime: SiteRuntime;
  backendReady: boolean;
};

export interface AdminRepository {
  getDashboardSnapshot(): Promise<AdminDashboardSnapshot>;
  getOrderWorkspaceSnapshot(): Promise<AdminOrderWorkspaceSnapshot>;
}

function hasPermission(viewer: ActiveAdminViewer, permission: string) {
  return viewer.permissions.includes(permission);
}

function uniqueCount(value: unknown): number | null {
  const parsed = idRowsSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return new Set(parsed.data.map((row) => row.id)).size;
}

function mapOrders(value: unknown): AdminOrderSummary[] | null {
  const parsed = z.array(orderSchema).safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.map((order) => ({
    orderId: order.order_id,
    orderReference: order.order_reference,
    mode: order.mode,
    status: order.status,
    version: order.version,
    grandTotalMinor: order.grand_total_minor,
    currencyCode: order.currency_code,
    placedAt: order.placed_at,
    acceptedAt: order.accepted_at,
    completedAt: order.completed_at,
    archivedAt: order.archived_at,
  }));
}

function mapStaff(value: unknown): AdminStaffSummary[] | null {
  const parsed = z.array(staffSchema).safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.map((staff) => ({
    staffId: staff.staff_id,
    email: staff.email,
    displayName: staff.display_name,
    status: staff.status,
    roleKeys: staff.role_keys,
    approvedAt: staff.approved_at,
    createdAt: staff.created_at,
  }));
}

function mapOperations(value: unknown): AdminOperationsSnapshot | null {
  const parsed = operationsSchema.safeParse(value);
  if (!parsed.success) return null;

  const data = parsed.data;
  return {
    businessHours: data.business_hours?.map((row) => ({
      dayOfWeek: row.day_of_week,
      intervalNumber: row.interval_number,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      isClosed: row.is_closed,
    })) ?? null,
    businessHourExceptions: data.business_hour_exceptions?.map((row) => ({
      id: row.id,
      serviceDate: row.service_date,
      intervalNumber: row.interval_number,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      isClosed: row.is_closed,
      reasonEn: row.reason_en,
      reasonBn: row.reason_bn,
    })) ?? null,
    menuCategories: data.menu_categories?.map((row) => ({
      id: row.id,
      slug: row.slug,
      isActive: row.is_active,
      isFeatured: row.is_featured,
      sortOrder: row.sort_order,
      nameEn: row.name_en ?? row.slug,
      nameBn: row.name_bn ?? row.name_en ?? row.slug,
      descriptionEn: row.description_en,
      descriptionBn: row.description_bn,
    })) ?? null,
    menuItems: data.menu_items?.map((row) => ({
      id: row.id,
      slug: row.slug,
      basePriceMinor: row.base_price_minor,
      compareAtPriceMinor: row.compare_at_price_minor,
      isActive: row.is_active,
      isAvailable: row.is_available,
      isFeatured: row.is_featured,
      preparationMinutes: row.preparation_minutes,
      sortOrder: row.sort_order,
      nameEn: row.name_en ?? row.slug,
      nameBn: row.name_bn ?? row.name_en ?? row.slug,
      descriptionEn: row.description_en,
      descriptionBn: row.description_bn,
    })) ?? null,
    modifierGroups: data.modifier_groups?.map((row) => ({
      id: row.id,
      slug: row.slug,
      minimumSelections: row.minimum_selections,
      maximumSelections: row.maximum_selections,
      presentation: row.presentation,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      nameEn: row.name_en ?? row.slug,
      nameBn: row.name_bn ?? row.name_en ?? row.slug,
      descriptionEn: row.description_en,
      descriptionBn: row.description_bn,
    })) ?? null,
    modifierOptions: data.modifier_options?.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      priceDeltaMinor: row.price_delta_minor,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      nameEn: row.name_en ?? row.id,
      nameBn: row.name_bn ?? row.name_en ?? row.id,
    })) ?? null,
    banners: data.banners?.map((row) => ({
      id: row.id,
      placement: row.placement,
      mediaId: row.media_id,
      actionUrl: row.action_url,
      isActive: row.is_active,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      sortOrder: row.sort_order,
      eyebrowEn: row.eyebrow_en,
      eyebrowBn: row.eyebrow_bn,
      titleEn: row.title_en ?? "Untitled banner",
      titleBn: row.title_bn ?? row.title_en ?? "Untitled banner",
      bodyEn: row.body_en,
      bodyBn: row.body_bn,
      actionLabelEn: row.action_label_en,
      actionLabelBn: row.action_label_bn,
    })) ?? null,
    offers: data.offers?.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind,
      value: row.value,
      maximumDiscountMinor: row.maximum_discount_minor,
      minimumSubtotalMinor: row.minimum_subtotal_minor,
      isActive: row.is_active,
      isStackable: row.is_stackable,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      priority: row.priority,
      nameEn: row.name_en ?? row.code ?? "Untitled offer",
      nameBn: row.name_bn ?? row.name_en ?? row.code ?? "Untitled offer",
      descriptionEn: row.description_en,
      descriptionBn: row.description_bn,
      termsEn: row.terms_en,
      termsBn: row.terms_bn,
      targets: row.targets.map((target) => ({
        targetKind: target.target_kind,
        targetId: target.target_id,
      })),
    })) ?? null,
    homeSections: data.home_sections?.map((row) => ({
      id: row.id,
      sectionKey: row.section_key,
      kind: row.kind,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      titleEn: row.title_en,
      titleBn: row.title_bn,
      subtitleEn: row.subtitle_en,
      subtitleBn: row.subtitle_bn,
    })) ?? null,
    meta: data.meta
      ? {
          enabled: data.meta.enabled,
          pixelId: data.meta.pixel_id,
          tokenConfigured: data.meta.token_configured,
          updatedAt: data.meta.updated_at,
        }
      : null,
  };
}

async function loadContentCounts(): Promise<AdminContentCounts> {
  try {
    const supabase = await createClient();
    const api = supabase.schema("api");
    const [menuResult, bannersResult, offersResult] = await Promise.all([
      api.from("storefront_items").select("id").limit(500),
      api.from("storefront_banners").select("id").limit(100),
      api.from("storefront_offers").select("id").limit(100),
    ]);

    const menuItems = menuResult.error ? null : uniqueCount(menuResult.data);
    const banners = bannersResult.error ? null : uniqueCount(bannersResult.data);
    const offers = offersResult.error ? null : uniqueCount(offersResult.data);
    const hasAnyResult = [menuItems, banners, offers].some(
      (count) => count !== null,
    );

    return {
      availability: hasAnyResult ? "ready" : "unavailable",
      menuItems,
      banners,
      offers,
    };
  } catch {
    return {
      availability: "unavailable",
      menuItems: null,
      banners: null,
      offers: null,
    };
  }
}

class SupabaseAdminRepository implements AdminRepository {
  constructor(private readonly context: RepositoryContext) {}

  async getOrderWorkspaceSnapshot(): Promise<AdminOrderWorkspaceSnapshot> {
    const canReadOrders = hasPermission(this.context.viewer, "orders.read");
    const generatedAt = new Date().toISOString();

    if (!canReadOrders) {
      return {
        generatedAt,
        availability: "permission_required",
        orders: [],
      };
    }

    if (!this.context.backendReady) {
      return {
        generatedAt,
        availability: "unavailable",
        orders: [],
      };
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .schema("api")
        .rpc("list_website_orders_for_operations", {
          p_status: null,
          p_mode: null,
          p_include_archived: true,
          p_limit: 100,
        });
      const orders = error ? null : mapOrders(data);

      return {
        generatedAt,
        availability: orders ? "ready" : "unavailable",
        orders: orders ?? [],
      };
    } catch {
      return {
        generatedAt,
        availability: "unavailable",
        orders: [],
      };
    }
  }

  async getDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    const safeRuntime = {
      sitePublished: this.context.runtime.site_published,
      liveOrdersEnabled: this.context.runtime.live_orders_enabled,
      testModeEnabled: this.context.runtime.test_mode_enabled,
    };
    const safeMetrics = {
      pendingLiveOrders: null,
      pendingTestOrders: null,
      liveOrdersToday: null,
      liveRevenueTodayMinor: null,
      pendingStaffRequests: null,
      unavailableMenuItems: null,
    };
    const canReadOrders = hasPermission(this.context.viewer, "orders.read");
    const canManageStaff = hasPermission(this.context.viewer, "staff.manage");

    if (!this.context.backendReady) {
      return {
        generatedAt: new Date().toISOString(),
        backendReady: false,
        runtime: safeRuntime,
        metricsAvailability: "unavailable",
        metrics: safeMetrics,
        orderQueueAvailability: canReadOrders
          ? "unavailable"
          : "permission_required",
        orderQueue: [],
        staffAvailability: canManageStaff
          ? "unavailable"
          : "permission_required",
        staff: [],
        content: {
          availability: "unavailable",
          menuItems: null,
          banners: null,
          offers: null,
        },
        operationsAvailability: "unavailable",
        operations: emptyOperations,
      };
    }

    try {
      const supabase = await createClient();
      const api = supabase.schema("api");
      const dashboardPromise = api.rpc("get_admin_dashboard");
      const ordersPromise = canReadOrders
        ? api.rpc("list_orders_for_operations", {
            p_status: null,
            p_mode: null,
            p_limit: 50,
          })
        : Promise.resolve({ data: null, error: null });
      const staffPromise = canManageStaff
        ? api.rpc("list_staff_access")
        : Promise.resolve({ data: null, error: null });
      const operationsPromise = api.rpc("get_admin_operations_snapshot");

      const [dashboardResult, ordersResult, staffResult, operationsResult, content] =
        await Promise.all([
          dashboardPromise,
          ordersPromise,
          staffPromise,
          operationsPromise,
          loadContentCounts(),
        ]);

      const dashboard = dashboardResult.error
        ? null
        : dashboardSchema.safeParse(dashboardResult.data);
      const orders = ordersResult.error ? null : mapOrders(ordersResult.data);
      const staff = staffResult.error ? null : mapStaff(staffResult.data);
      const operations = operationsResult.error
        ? null
        : mapOperations(operationsResult.data);
      const validDashboard = dashboard?.success ? dashboard.data : null;

      return {
        generatedAt: new Date().toISOString(),
        backendReady: Boolean(validDashboard),
        runtime: validDashboard
          ? {
              sitePublished: validDashboard.runtime.site_published,
              liveOrdersEnabled: validDashboard.runtime.live_orders_enabled,
              testModeEnabled: validDashboard.runtime.test_mode_enabled,
            }
          : safeRuntime,
        metricsAvailability: validDashboard ? "ready" : "unavailable",
        metrics: validDashboard
          ? {
              pendingLiveOrders: validDashboard.pending_live_orders,
              pendingTestOrders: validDashboard.pending_test_orders,
              liveOrdersToday: validDashboard.live_orders_today,
              liveRevenueTodayMinor:
                validDashboard.live_revenue_today_minor,
              pendingStaffRequests: validDashboard.pending_staff_requests,
              unavailableMenuItems: validDashboard.unavailable_menu_items,
            }
          : safeMetrics,
        orderQueueAvailability: canReadOrders
          ? orders
            ? "ready"
            : "unavailable"
          : "permission_required",
        orderQueue: orders ?? [],
        staffAvailability: canManageStaff
          ? staff
            ? "ready"
            : "unavailable"
          : "permission_required",
        staff: staff ?? [],
        content,
        operationsAvailability: operations ? "ready" : "unavailable",
        operations: operations ?? emptyOperations,
      };
    } catch {
      return {
        generatedAt: new Date().toISOString(),
        backendReady: false,
        runtime: safeRuntime,
        metricsAvailability: "unavailable",
        metrics: safeMetrics,
        orderQueueAvailability: canReadOrders
          ? "unavailable"
          : "permission_required",
        orderQueue: [],
        staffAvailability: canManageStaff
          ? "unavailable"
          : "permission_required",
        staff: [],
        content: {
          availability: "unavailable",
          menuItems: null,
          banners: null,
          offers: null,
        },
        operationsAvailability: "unavailable",
        operations: emptyOperations,
      };
    }
  }
}

export function createAdminRepository(
  context: RepositoryContext,
): AdminRepository {
  return new SupabaseAdminRepository(context);
}
