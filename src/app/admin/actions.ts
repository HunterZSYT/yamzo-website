"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AdminActionState } from "@/lib/admin/action-state";
import { authorizeAdminMutation } from "@/lib/admin/server-action";
import { ADMIN_ORDER_STATUSES } from "@/lib/admin/types";

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
