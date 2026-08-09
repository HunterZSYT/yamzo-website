"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AdminActionState } from "@/lib/admin/action-state";
import { authorizeAdminMutation } from "@/lib/admin/server-action";
import {
  adminOrderArchiveInputSchema,
  adminOrderArrivalCursorSchema,
  adminOrderArrivalResponseSchema,
  adminOrderMutationInputSchema,
  adminOrderMutationResponseSchema,
  adminTestOrderDeleteInputSchema,
  parseAdminOrderDetail,
  toAdminOrderMutationPayload,
} from "@/lib/admin/order-contract";
import { ADMIN_ORDER_STATUSES } from "@/lib/admin/types";
import type {
  AdminOrderArrivalCursor,
  AdminOrderDetail,
  AdminOrderHistoryCursor,
  AdminOrderSummary,
} from "@/lib/admin/types";

const booleanValue = z.enum(["true", "false"]).transform((value) => value === "true");

const runtimeSchema = z
  .object({
    published: booleanValue,
    liveOrdersEnabled: booleanValue,
    testMode: booleanValue,
  })
  .refine((value) => !(value.liveOrdersEnabled && value.testMode), {
    message: "Live orders and test mode cannot be enabled together.",
  });

const staffSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
  roleKey: z.enum([
    "owner",
    "admin",
    "manager",
    "cashier",
    "kitchen",
    "content_editor",
  ]),
  suspendedReason: z.string().trim().max(240).optional().default(""),
});

const orderTransitionSchema = z.object({
  orderId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  toStatus: z.enum(ADMIN_ORDER_STATUSES),
  note: z.string().trim().max(500).optional().default(""),
});

const adminErrorMessages: Record<string, string> = {
  SITE_MANAGE_PERMISSION_REQUIRED: "Your role cannot change website controls.",
  STAFF_MANAGE_PERMISSION_REQUIRED: "Your role cannot manage staff access.",
  LIVE_AND_TEST_MODE_ARE_MUTUALLY_EXCLUSIVE:
    "Live orders and test mode cannot be enabled together.",
  LAST_ACTIVE_OWNER_REQUIRED: "The final active owner cannot be demoted or suspended.",
  SUSPENSION_REASON_REQUIRED: "Add a short reason before suspending this account.",
  STAFF_REQUEST_NOT_FOUND: "That staff request no longer exists.",
  ORDER_TRANSITION_PERMISSION_REQUIRED: "Your role cannot update order status.",
  ORDER_VERSION_CONFLICT: "This order changed elsewhere. Refresh before trying again.",
  INVALID_ORDER_STATUS_TRANSITION: "That status change is not allowed from the current state.",
  ORDER_NOT_FOUND: "That order no longer exists.",
  ORDER_ALREADY_ARCHIVED: "This live order is already archived.",
  LIVE_ORDER_NOT_FOUND: "That live order no longer exists.",
  LIVE_ARCHIVE_NOTE_REQUIRED: "Add a short archive reason for this live order.",
  ORDER_VERSION_MUST_INCREMENT: "This order changed elsewhere. Refresh before trying again.",
  INVALID_ORDER_UPDATE_REQUEST: "Check the order update and try again.",
  INVALID_ORDER_ITEMS: "One or more order items are invalid.",
  INVALID_ORDER_ADJUSTMENT: "Check the discount or delivery fee.",
  ORDER_TOTAL_TOO_LARGE: "That order total is outside the safe limit.",
  NO_ORDER_CHANGE_REQUESTED: "Make a change before saving this order.",
  TEST_ORDER_DELETE_PERMISSION_REQUIRED:
    "Your role cannot permanently delete test orders.",
  TEST_ORDER_NOT_FOUND: "That test order no longer exists.",
  DELETE_CONFIRMATION_MISMATCH: "Type the exact delete confirmation before continuing.",
  SAFE_DELETE_REASON_REQUIRED: "Choose a safe reason for deleting the test order.",
};

function failed(message: string): AdminActionState {
  return { status: "error", message };
}

function databaseMessage(message: string) {
  const match = Object.entries(adminErrorMessages).find(([code]) =>
    message.includes(code),
  );
  return match?.[1] ?? "The change was not saved. Refresh and try again.";
}

export async function updateRuntimeModesAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = runtimeSchema.safeParse({
    published: formData.get("published"),
    liveOrdersEnabled: formData.get("liveOrdersEnabled"),
    testMode: formData.get("testMode"),
  });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the controls.");

  const authorized = await authorizeAdminMutation("site.manage");
  if (!authorized) return failed("An active staff account with site.manage is required.");

  const { error } = await authorized.client.schema("api").rpc(
    "set_site_runtime_modes",
    {
      p_published: parsed.data.published,
      p_live_orders_enabled: parsed.data.liveOrdersEnabled,
      p_test_mode: parsed.data.testMode,
    },
  );
  if (error) return failed(databaseMessage(error.message));

  revalidatePath("/");
  revalidatePath("/admin");
  return { status: "success", message: "Website controls updated." };
}

export async function updateStaffAccessAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = staffSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    roleKey: formData.get("roleKey"),
    suspendedReason: formData.get("suspendedReason"),
  });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the staff change.");

  if (parsed.data.status === "suspended" && parsed.data.suspendedReason.length < 2) {
    return failed("Add a short reason before suspending this account.");
  }

  const authorized = await authorizeAdminMutation("staff.manage");
  if (!authorized) return failed("An active staff account with staff.manage is required.");

  const { error } = await authorized.client.schema("api").rpc("set_staff_access", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_role_key: parsed.data.roleKey,
    p_suspended_reason:
      parsed.data.status === "suspended" ? parsed.data.suspendedReason : null,
  });
  if (error) return failed(databaseMessage(error.message));

  revalidatePath("/admin");
  return {
    status: "success",
    message:
      parsed.data.status === "active"
        ? "Staff access updated."
        : "Staff account suspended.",
  };
}

export async function transitionOrderAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = orderTransitionSchema.safeParse({
    orderId: formData.get("orderId"),
    expectedVersion: formData.get("expectedVersion"),
    toStatus: formData.get("toStatus"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the status change.");
  }

  const authorized = await authorizeAdminMutation("orders.transition");
  if (!authorized) {
    return failed("An active staff account with orders.transition is required.");
  }

  const { error } = await authorized.client.schema("api").rpc("transition_order", {
    p_order_id: parsed.data.orderId,
    p_to_status: parsed.data.toStatus,
    p_expected_version: parsed.data.expectedVersion,
    p_note: parsed.data.note || null,
    p_terminal_id: null,
    p_claim_token: null,
  });
  if (error) return failed(databaseMessage(error.message));

  revalidatePath("/admin");
  return { status: "success", message: "Order status updated." };
}

export type AdminOrderDetailActionResult =
  | { status: "success"; detail: AdminOrderDetail }
  | { status: "error"; message: string };

export type AdminOrderArrivalActionResult =
  | {
      status: "success";
      arrivals: Array<{
        orderId: string;
        orderReference: string;
        mode: "live" | "test";
        status: (typeof ADMIN_ORDER_STATUSES)[number];
        version: number;
        grandTotalMinor: number;
        currencyCode: string;
        placedAt: string;
        acceptedAt: string | null;
        completedAt: string | null;
        archivedAt: string | null;
      }>;
    }
  | { status: "error"; message: string };

export type AdminOrderMutationActionResult =
  | {
      status: "success";
      message: string;
      orderId: string;
      version: number;
    }
  | { status: "error"; message: string };

function actionFailure(message: string) {
  return { status: "error" as const, message };
}

function mapOrderSummary(order: {
  order_id: string;
  order_reference: string;
  mode: "live" | "test";
  status: (typeof ADMIN_ORDER_STATUSES)[number];
  version: number;
  grand_total_minor: number;
  currency_code: string;
  placed_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
}): AdminOrderSummary {
  return {
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
  };
}

export async function getAdminOrderDetailAction(
  orderId: string,
): Promise<AdminOrderDetailActionResult> {
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return actionFailure("That order reference is invalid.");

  const authorized = await authorizeAdminMutation("orders.read");
  if (!authorized) {
    return actionFailure("An active staff account with orders.read is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("get_admin_order_detail", { p_order_id: parsedOrderId.data });
  if (error) return actionFailure(databaseMessage(error.message));

  const detail = parseAdminOrderDetail(data);
  if (!detail) return actionFailure("The protected order details could not be verified.");
  return { status: "success", detail };
}

export async function getAdminOrderArrivalsAction(
  cursor: AdminOrderArrivalCursor | null,
): Promise<AdminOrderArrivalActionResult> {
  const parsedCursor = cursor === null
    ? { success: true as const, data: null }
    : adminOrderArrivalCursorSchema.safeParse(cursor);
  if (!parsedCursor.success) return actionFailure("The order-arrival cursor is invalid.");

  const authorized = await authorizeAdminMutation("orders.read");
  if (!authorized) {
    return actionFailure("An active staff account with orders.read is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("list_order_arrivals_for_operations", {
      p_after_placed_at: parsedCursor.data?.placedAt ?? null,
      p_after_order_id: parsedCursor.data?.orderId ?? null,
      p_limit: 20,
    });
  if (error) return actionFailure(databaseMessage(error.message));

  const arrivals = adminOrderArrivalResponseSchema.safeParse(data);
  if (!arrivals.success) return actionFailure("The order-arrival queue could not be verified.");
  return {
    status: "success",
    arrivals: arrivals.data.map(mapOrderSummary),
  };
}

export type AdminOrderHistoryActionResult =
  | { status: "success"; orders: AdminOrderSummary[] }
  | { status: "error"; message: string };

export async function getAdminOrderHistoryPageAction(
  cursor: AdminOrderHistoryCursor | null,
): Promise<AdminOrderHistoryActionResult> {
  const parsedCursor = cursor === null
    ? { success: true as const, data: null }
    : adminOrderArrivalCursorSchema.safeParse(cursor);
  if (!parsedCursor.success) return actionFailure("The order-history cursor is invalid.");

  const authorized = await authorizeAdminMutation("orders.read");
  if (!authorized) {
    return actionFailure("An active staff account with orders.read is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("list_website_orders_for_operations", {
      p_status: null,
      p_mode: null,
      p_include_archived: true,
      p_before_placed_at: parsedCursor.data?.placedAt ?? null,
      p_before_order_id: parsedCursor.data?.orderId ?? null,
      p_limit: 100,
    });
  if (error) return actionFailure(databaseMessage(error.message));

  const orders = adminOrderArrivalResponseSchema.safeParse(data);
  if (!orders.success) return actionFailure("The order history could not be verified.");
  return { status: "success", orders: orders.data.map(mapOrderSummary) };
}

export async function updateWebsiteOrderAction(
  input: unknown,
): Promise<AdminOrderMutationActionResult> {
  const parsed = adminOrderMutationInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure(parsed.error.issues[0]?.message ?? "Check the order update.");
  }

  const authorized = await authorizeAdminMutation("orders.manage");
  if (!authorized) {
    return actionFailure("An active staff account with orders.manage is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("admin_update_website_order", toAdminOrderMutationPayload(parsed.data));
  if (error) return actionFailure(databaseMessage(error.message));

  const result = adminOrderMutationResponseSchema.safeParse(data);
  if (!result.success) return actionFailure("The order update could not be verified.");

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/order-status");
  return {
    status: "success",
    message: "Order saved. The POS mirror will receive the next version.",
    orderId: result.data.order_id,
    version: result.data.version,
  };
}

export async function archiveLiveWebsiteOrderAction(
  input: unknown,
): Promise<AdminOrderMutationActionResult> {
  const parsed = adminOrderArchiveInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure(parsed.error.issues[0]?.message ?? "Check the archive request.");
  }

  const authorized = await authorizeAdminMutation("orders.manage");
  if (!authorized) {
    return actionFailure("An active staff account with orders.manage is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("archive_live_website_order", {
      p_order_id: parsed.data.orderId,
      p_expected_version: parsed.data.expectedVersion,
      p_note: parsed.data.note,
    });
  if (error) return actionFailure(databaseMessage(error.message));

  const result = adminOrderMutationResponseSchema.safeParse(data);
  if (!result.success || !result.data.archived_at) {
    return actionFailure("The live-order archive could not be verified.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/order-status");
  return {
    status: "success",
    message: "Live order cancelled and archived. Its audit history remains available.",
    orderId: result.data.order_id,
    version: result.data.version,
  };
}

export async function hardDeleteTestOrderAction(
  input: unknown,
): Promise<AdminOrderMutationActionResult> {
  const parsed = adminTestOrderDeleteInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionFailure(parsed.error.issues[0]?.message ?? "Check the test-order deletion.");
  }
  if (parsed.data.confirmation !== `DELETE ${parsed.data.expectedReference}`) {
    return actionFailure("Type the exact delete confirmation before continuing.");
  }

  const authorized = await authorizeAdminMutation("orders.test_delete");
  if (!authorized) {
    return actionFailure("An active staff account with orders.test_delete is required.");
  }

  const { data, error } = await authorized.client
    .schema("api")
    .rpc("hard_delete_test_order", {
      p_order_id: parsed.data.orderId,
      p_expected_reference: parsed.data.expectedReference,
      p_reason_code: parsed.data.reasonCode,
      p_confirmation: parsed.data.confirmation,
    });
  if (error || data !== true) {
    return actionFailure(error ? databaseMessage(error.message) : "The test order was not deleted.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  return {
    status: "success",
    message: "Test order permanently deleted. Its non-PII tombstone remains audited.",
    orderId: parsed.data.orderId,
    version: 0,
  };
}
