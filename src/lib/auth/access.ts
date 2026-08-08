import "server-only";

import { z } from "zod";

import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const staffAccessSchema = z.object({
  staff_id: z.string().uuid(),
  status: z.enum(["pending", "active", "suspended"]),
  role_key: z.string().min(1).nullable(),
  permissions: z.array(z.string()).default([]),
});

const siteRuntimeSchema = z.object({
  site_published: z.boolean(),
  live_orders_enabled: z.boolean(),
  test_mode_enabled: z.boolean(),
});

const orderingAvailabilitySchema = z.object({
  ordering_open: z.boolean(),
  schedule_open: z.boolean(),
  accepting_live_orders: z.boolean(),
  accepting_test_orders: z.boolean(),
  closed_reason: z.string().nullable(),
  next_opening_at: z.string().datetime({ offset: true }).nullable(),
});

export type ViewerAccess = {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  staff: z.infer<typeof staffAccessSchema> | null;
  canPreview: boolean;
};

export type SiteRuntime = z.infer<typeof siteRuntimeSchema>;
export type OrderingAvailability = Omit<
  z.infer<typeof orderingAvailabilitySchema>,
  "closed_reason"
> & {
  closed_reason_en: string | null;
  closed_reason_bn: string | null;
};

export type SiteAccess = {
  viewer: ViewerAccess;
  runtime: SiteRuntime;
  ordering: OrderingAvailability;
  backendReady: boolean;
};

const guestViewer: ViewerAccess = {
  isAuthenticated: false,
  userId: null,
  email: null,
  staff: null,
  canPreview: false,
};

const safeRuntime: SiteRuntime = {
  site_published: false,
  live_orders_enabled: false,
  test_mode_enabled: false,
};

const safeOrdering: OrderingAvailability = {
  ordering_open: false,
  schedule_open: false,
  accepting_live_orders: false,
  accepting_test_orders: false,
  closed_reason_en: "Online ordering is currently unavailable.",
  closed_reason_bn: "অনলাইন অর্ডার এখন বন্ধ আছে।",
  next_opening_at: null,
};

function firstRow(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export async function getSiteAccess(): Promise<SiteAccess> {
  if (!hasSupabaseConfig()) {
    return {
      viewer: guestViewer,
      runtime: safeRuntime,
      ordering: safeOrdering,
      backendReady: false,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    const subject = claimsData?.claims?.sub;
    const emailClaim = claimsData?.claims?.email;
    const viewer: ViewerAccess = {
      isAuthenticated: !claimsError && typeof subject === "string",
      userId: typeof subject === "string" ? subject : null,
      email: typeof emailClaim === "string" ? emailClaim : null,
      staff: null,
      canPreview: false,
    };

    if (viewer.isAuthenticated) {
      const { data: staffData } = await supabase
        .schema("api")
        .rpc("get_current_staff_access");
      const parsedStaff = staffAccessSchema.safeParse(firstRow(staffData));

      if (parsedStaff.success) {
        viewer.staff = parsedStaff.data;
        viewer.canPreview =
          parsedStaff.data.status === "active" &&
          parsedStaff.data.role_key !== null &&
          parsedStaff.data.permissions.length > 0;
      }
    }

    const [runtimeResult, orderingEnResult, orderingBnResult] =
      await Promise.all([
        supabase.schema("api").rpc("get_site_runtime"),
        supabase.schema("api").rpc("get_ordering_availability", {
          p_locale: "en",
        }),
        supabase.schema("api").rpc("get_ordering_availability", {
          p_locale: "bn",
        }),
      ]);
    const { data: runtimeData, error: runtimeError } = runtimeResult;
    const parsedRuntime = siteRuntimeSchema.safeParse(firstRow(runtimeData));
    const parsedOrderingEn = orderingAvailabilitySchema.safeParse(
      orderingEnResult.data,
    );
    const parsedOrderingBn = orderingAvailabilitySchema.safeParse(
      orderingBnResult.data,
    );
    const orderingReady =
      !orderingEnResult.error &&
      !orderingBnResult.error &&
      parsedOrderingEn.success &&
      parsedOrderingBn.success;

    return {
      viewer,
      runtime: parsedRuntime.success ? parsedRuntime.data : safeRuntime,
      ordering: orderingReady
        ? {
            ordering_open: parsedOrderingEn.data.ordering_open,
            schedule_open: parsedOrderingEn.data.schedule_open,
            accepting_live_orders:
              parsedOrderingEn.data.accepting_live_orders,
            accepting_test_orders:
              parsedOrderingEn.data.accepting_test_orders,
            closed_reason_en: parsedOrderingEn.data.closed_reason,
            closed_reason_bn: parsedOrderingBn.data.closed_reason,
            next_opening_at: parsedOrderingEn.data.next_opening_at,
          }
        : safeOrdering,
      backendReady: !runtimeError && parsedRuntime.success && orderingReady,
    };
  } catch {
    return {
      viewer: guestViewer,
      runtime: safeRuntime,
      ordering: safeOrdering,
      backendReady: false,
    };
  }
}
