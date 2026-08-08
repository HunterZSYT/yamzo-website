"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AdminActionState } from "@/lib/admin/action-state";
import { authorizeAdminMutation } from "@/lib/admin/server-action";
import { createAdminClient } from "@/lib/supabase/admin";

const booleanValue = z.enum(["true", "false"]).transform((value) => value === "true");
const uuidOrNull = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.string().uuid().nullable(),
);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const timeValue = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
);
const moneyBdt = z.coerce.number().finite().min(0).max(1_000_000);
const optionalMoneyBdt = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().finite().min(0).max(1_000_000).nullable(),
);
const sortOrder = z.coerce.number().int().min(-100_000).max(100_000);

const errorMessages: Record<string, string> = {
  SITE_MANAGE_PERMISSION_REQUIRED: "Your role cannot change store hours.",
  CATALOG_MANAGE_PERMISSION_REQUIRED: "Your role cannot edit the menu.",
  MERCHANDISING_MANAGE_PERMISSION_REQUIRED: "Your role cannot edit merchandising.",
  INTEGRATIONS_MANAGE_PERMISSION_REQUIRED: "Your role cannot edit integrations.",
  TRUSTED_ADMIN_SERVER_REQUIRED: "The trusted server connection is unavailable.",
  META_CONFIGURATION_INCOMPLETE: "Add both a Pixel ID and CAPI token before enabling Meta.",
  INVALID_META_PIXEL_ID: "Meta Pixel ID must contain digits only.",
  INVALID_META_CAPI_TOKEN: "The CAPI token format is not valid.",
  BUSINESS_HOUR_EXCEPTION_NOT_FOUND: "That schedule exception no longer exists.",
};

function failed(message: string): AdminActionState {
  return { status: "error", message };
}

function databaseMessage(message: string) {
  const match = Object.entries(errorMessages).find(([code]) => message.includes(code));
  return match?.[1] ?? "The change was not saved. Refresh and try again.";
}

function toMinorUnits(value: number) {
  return Math.round(value * 100);
}

function toDhakaTimestamp(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("INVALID_DHAKA_DATE_TIME");
  }
  const parsed = new Date(`${value}:00+06:00`);
  if (Number.isNaN(parsed.valueOf())) throw new Error("INVALID_DHAKA_DATE_TIME");
  return parsed.toISOString();
}

function refreshAdminAndStorefront() {
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setBusinessHourAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      dayOfWeek: z.coerce.number().int().min(0).max(6),
      intervalNumber: z.coerce.number().int().min(1).max(4),
      opensAt: timeValue,
      closesAt: timeValue,
      isClosed: booleanValue,
    })
    .safeParse({
      dayOfWeek: formData.get("dayOfWeek"),
      intervalNumber: formData.get("intervalNumber"),
      opensAt: formData.get("opensAt"),
      closesAt: formData.get("closesAt"),
      isClosed: formData.get("isClosed"),
    });
  if (!parsed.success) return failed("Check the weekday, status, and opening times.");
  if (!parsed.data.isClosed && (!parsed.data.opensAt || !parsed.data.closesAt)) {
    return failed("Open days require both an opening and closing time.");
  }

  const authorized = await authorizeAdminMutation("site.manage");
  if (!authorized) return failed("An active staff account with site.manage is required.");
  const { error } = await authorized.client.schema("api").rpc("set_business_hour", {
    p_day_of_week: parsed.data.dayOfWeek,
    p_interval_number: parsed.data.intervalNumber,
    p_opens_at: parsed.data.opensAt,
    p_closes_at: parsed.data.closesAt,
    p_is_closed: parsed.data.isClosed,
  });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Weekly hours updated." };
}

export async function upsertBusinessExceptionAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: uuidOrNull,
      serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      intervalNumber: z.coerce.number().int().min(1).max(4),
      opensAt: timeValue,
      closesAt: timeValue,
      isClosed: booleanValue,
      reasonEn: optionalText(240),
      reasonBn: optionalText(240),
    })
    .safeParse({
      id: formData.get("id"),
      serviceDate: formData.get("serviceDate"),
      intervalNumber: formData.get("intervalNumber"),
      opensAt: formData.get("opensAt"),
      closesAt: formData.get("closesAt"),
      isClosed: formData.get("isClosed"),
      reasonEn: formData.get("reasonEn"),
      reasonBn: formData.get("reasonBn"),
    });
  if (!parsed.success) return failed("Check the exception date and opening times.");
  if (!parsed.data.isClosed && (!parsed.data.opensAt || !parsed.data.closesAt)) {
    return failed("Open exceptions require both an opening and closing time.");
  }

  const authorized = await authorizeAdminMutation("site.manage");
  if (!authorized) return failed("An active staff account with site.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("upsert_business_hour_exception", {
      p_id: parsed.data.id,
      p_service_date: parsed.data.serviceDate,
      p_interval_number: parsed.data.intervalNumber,
      p_opens_at: parsed.data.opensAt,
      p_closes_at: parsed.data.closesAt,
      p_is_closed: parsed.data.isClosed,
      p_reason_en: parsed.data.reasonEn || null,
      p_reason_bn: parsed.data.reasonBn || null,
    });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Schedule exception saved." };
}

export async function deleteBusinessExceptionAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return failed("That exception could not be identified.");
  const authorized = await authorizeAdminMutation("site.manage");
  if (!authorized) return failed("An active staff account with site.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("delete_business_hour_exception", { p_id: parsed.data });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Schedule exception removed." };
}

export async function updateMenuCategoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      isActive: booleanValue,
      isFeatured: booleanValue,
      sortOrder,
      nameEn: z.string().trim().min(1).max(100),
      nameBn: z.string().trim().min(1).max(100),
      descriptionEn: optionalText(500),
      descriptionBn: optionalText(500),
    })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
      isFeatured: formData.get("isFeatured"),
      sortOrder: formData.get("sortOrder"),
      nameEn: formData.get("nameEn"),
      nameBn: formData.get("nameBn"),
      descriptionEn: formData.get("descriptionEn"),
      descriptionBn: formData.get("descriptionBn"),
    });
  if (!parsed.success) return failed("Check the category fields.");
  const authorized = await authorizeAdminMutation("catalog.manage");
  if (!authorized) return failed("An active staff account with catalog.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("update_menu_category_admin", {
      p_category_id: parsed.data.id,
      p_is_active: parsed.data.isActive,
      p_is_featured: parsed.data.isFeatured,
      p_sort_order: parsed.data.sortOrder,
      p_name_en: parsed.data.nameEn,
      p_name_bn: parsed.data.nameBn,
      p_description_en: parsed.data.descriptionEn || null,
      p_description_bn: parsed.data.descriptionBn || null,
    });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Menu category updated." };
}

export async function updateMenuItemAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      isActive: booleanValue,
      isAvailable: booleanValue,
      isFeatured: booleanValue,
      basePriceBdt: moneyBdt,
      compareAtPriceBdt: optionalMoneyBdt,
      preparationMinutes: z.preprocess(
        (value) => (value === "" || value === null ? null : value),
        z.coerce.number().int().min(1).max(240).nullable(),
      ),
      sortOrder,
      nameEn: z.string().trim().min(1).max(160),
      nameBn: z.string().trim().min(1).max(160),
      descriptionEn: optionalText(1200),
      descriptionBn: optionalText(1200),
    })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
      isAvailable: formData.get("isAvailable"),
      isFeatured: formData.get("isFeatured"),
      basePriceBdt: formData.get("basePriceBdt"),
      compareAtPriceBdt: formData.get("compareAtPriceBdt"),
      preparationMinutes: formData.get("preparationMinutes"),
      sortOrder: formData.get("sortOrder"),
      nameEn: formData.get("nameEn"),
      nameBn: formData.get("nameBn"),
      descriptionEn: formData.get("descriptionEn"),
      descriptionBn: formData.get("descriptionBn"),
    });
  if (!parsed.success) return failed("Check the item name, price, and availability.");

  const basePriceMinor = toMinorUnits(parsed.data.basePriceBdt);
  const compareAtPriceMinor = parsed.data.compareAtPriceBdt === null
    ? null
    : toMinorUnits(parsed.data.compareAtPriceBdt);
  if (compareAtPriceMinor !== null && compareAtPriceMinor <= basePriceMinor) {
    return failed("Compare-at price must be higher than the current price.");
  }

  const authorized = await authorizeAdminMutation("catalog.manage");
  if (!authorized) return failed("An active staff account with catalog.manage is required.");
  const { error } = await authorized.client.schema("api").rpc("update_menu_item_admin", {
    p_item_id: parsed.data.id,
    p_is_active: parsed.data.isActive,
    p_is_available: parsed.data.isAvailable,
    p_is_featured: parsed.data.isFeatured,
    p_base_price_minor: basePriceMinor,
    p_compare_at_price_minor: compareAtPriceMinor,
    p_preparation_minutes: parsed.data.preparationMinutes,
    p_sort_order: parsed.data.sortOrder,
    p_name_en: parsed.data.nameEn,
    p_name_bn: parsed.data.nameBn,
    p_description_en: parsed.data.descriptionEn || null,
    p_description_bn: parsed.data.descriptionBn || null,
  });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Menu item updated." };
}

export async function updateModifierGroupAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      isActive: booleanValue,
      minimumSelections: z.coerce.number().int().min(0).max(20),
      maximumSelections: z.coerce.number().int().min(1).max(20),
      presentation: z.enum(["modifier", "variant"]),
      sortOrder,
      nameEn: z.string().trim().min(1).max(120),
      nameBn: z.string().trim().min(1).max(120),
      descriptionEn: optionalText(500),
      descriptionBn: optionalText(500),
    })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
      minimumSelections: formData.get("minimumSelections"),
      maximumSelections: formData.get("maximumSelections"),
      presentation: formData.get("presentation"),
      sortOrder: formData.get("sortOrder"),
      nameEn: formData.get("nameEn"),
      nameBn: formData.get("nameBn"),
      descriptionEn: formData.get("descriptionEn"),
      descriptionBn: formData.get("descriptionBn"),
    });
  if (!parsed.success) return failed("Check the modifier group fields.");
  if (parsed.data.minimumSelections > parsed.data.maximumSelections) {
    return failed("Minimum selections cannot exceed maximum selections.");
  }
  if (
    parsed.data.presentation === "variant" &&
    (parsed.data.minimumSelections !== 1 || parsed.data.maximumSelections !== 1)
  ) {
    return failed("Variant groups must require exactly one choice.");
  }
  const authorized = await authorizeAdminMutation("catalog.manage");
  if (!authorized) return failed("An active staff account with catalog.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("update_modifier_group_admin", {
      p_group_id: parsed.data.id,
      p_is_active: parsed.data.isActive,
      p_minimum_selections: parsed.data.minimumSelections,
      p_maximum_selections: parsed.data.maximumSelections,
      p_presentation: parsed.data.presentation,
      p_sort_order: parsed.data.sortOrder,
      p_name_en: parsed.data.nameEn,
      p_name_bn: parsed.data.nameBn,
      p_description_en: parsed.data.descriptionEn || null,
      p_description_bn: parsed.data.descriptionBn || null,
    });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Modifier group updated." };
}

export async function updateModifierOptionAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      isActive: booleanValue,
      priceDeltaBdt: moneyBdt,
      sortOrder,
      nameEn: z.string().trim().min(1).max(120),
      nameBn: z.string().trim().min(1).max(120),
    })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
      priceDeltaBdt: formData.get("priceDeltaBdt"),
      sortOrder: formData.get("sortOrder"),
      nameEn: formData.get("nameEn"),
      nameBn: formData.get("nameBn"),
    });
  if (!parsed.success) return failed("Check the modifier option fields.");
  const authorized = await authorizeAdminMutation("catalog.manage");
  if (!authorized) return failed("An active staff account with catalog.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("update_modifier_option_admin", {
      p_option_id: parsed.data.id,
      p_is_active: parsed.data.isActive,
      p_price_delta_minor: toMinorUnits(parsed.data.priceDeltaBdt),
      p_sort_order: parsed.data.sortOrder,
      p_name_en: parsed.data.nameEn,
      p_name_bn: parsed.data.nameBn,
    });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Modifier option updated." };
}

export async function upsertBannerAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: uuidOrNull,
      mediaId: uuidOrNull,
      placement: z.enum(["hero", "announcement", "cart"]),
      actionUrl: optionalText(500),
      isActive: booleanValue,
      sortOrder,
      eyebrowEn: optionalText(160),
      eyebrowBn: optionalText(160),
      titleEn: z.string().trim().min(1).max(160),
      titleBn: z.string().trim().min(1).max(160),
      bodyEn: optionalText(600),
      bodyBn: optionalText(600),
      actionLabelEn: optionalText(80),
      actionLabelBn: optionalText(80),
    })
    .safeParse({
      id: formData.get("id"),
      mediaId: formData.get("mediaId"),
      placement: formData.get("placement"),
      actionUrl: formData.get("actionUrl"),
      isActive: formData.get("isActive"),
      sortOrder: formData.get("sortOrder"),
      eyebrowEn: formData.get("eyebrowEn"),
      eyebrowBn: formData.get("eyebrowBn"),
      titleEn: formData.get("titleEn"),
      titleBn: formData.get("titleBn"),
      bodyEn: formData.get("bodyEn"),
      bodyBn: formData.get("bodyBn"),
      actionLabelEn: formData.get("actionLabelEn"),
      actionLabelBn: formData.get("actionLabelBn"),
    });
  if (!parsed.success) return failed("Check the banner fields.");

  let startsAt: string | null;
  let endsAt: string | null;
  try {
    startsAt = toDhakaTimestamp(formData.get("startsAt"));
    endsAt = toDhakaTimestamp(formData.get("endsAt"));
  } catch {
    return failed("Use valid Asia/Dhaka start and end times.");
  }
  if (startsAt && endsAt && endsAt <= startsAt) return failed("Banner end time must be later than its start time.");

  const authorized = await authorizeAdminMutation("merchandising.manage");
  if (!authorized) return failed("An active staff account with merchandising.manage is required.");
  const { error } = await authorized.client.schema("api").rpc("upsert_banner_admin", {
    p_id: parsed.data.id,
    p_placement: parsed.data.placement,
    p_media_id: parsed.data.mediaId,
    p_action_url: parsed.data.actionUrl || null,
    p_is_active: parsed.data.isActive,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_sort_order: parsed.data.sortOrder,
    p_eyebrow_en: parsed.data.eyebrowEn || null,
    p_eyebrow_bn: parsed.data.eyebrowBn || null,
    p_title_en: parsed.data.titleEn,
    p_title_bn: parsed.data.titleBn,
    p_body_en: parsed.data.bodyEn || null,
    p_body_bn: parsed.data.bodyBn || null,
    p_action_label_en: parsed.data.actionLabelEn || null,
    p_action_label_bn: parsed.data.actionLabelBn || null,
  });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Banner saved." };
}

export async function upsertOfferAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: uuidOrNull,
      code: optionalText(32),
      kind: z.enum(["percent", "fixed", "free_delivery"]),
      valueDisplay: moneyBdt,
      maximumDiscountBdt: optionalMoneyBdt,
      minimumSubtotalBdt: moneyBdt,
      isActive: booleanValue,
      isStackable: booleanValue,
      priority: sortOrder,
      targetKind: z.enum(["all", "category", "item"]),
      targetId: uuidOrNull,
      nameEn: z.string().trim().min(1).max(160),
      nameBn: z.string().trim().min(1).max(160),
      descriptionEn: optionalText(800),
      descriptionBn: optionalText(800),
      termsEn: optionalText(2000),
      termsBn: optionalText(2000),
    })
    .safeParse({
      id: formData.get("id"),
      code: formData.get("code"),
      kind: formData.get("kind"),
      valueDisplay: formData.get("valueDisplay"),
      maximumDiscountBdt: formData.get("maximumDiscountBdt"),
      minimumSubtotalBdt: formData.get("minimumSubtotalBdt"),
      isActive: formData.get("isActive"),
      isStackable: formData.get("isStackable"),
      priority: formData.get("priority"),
      targetKind: formData.get("targetKind"),
      targetId: formData.get("targetId"),
      nameEn: formData.get("nameEn"),
      nameBn: formData.get("nameBn"),
      descriptionEn: formData.get("descriptionEn"),
      descriptionBn: formData.get("descriptionBn"),
      termsEn: formData.get("termsEn"),
      termsBn: formData.get("termsBn"),
    });
  if (!parsed.success) return failed("Check the offer fields.");
  if (parsed.data.targetKind === "all" && parsed.data.targetId !== null) return failed("All-menu offers cannot have a target ID.");
  if (parsed.data.targetKind !== "all" && parsed.data.targetId === null) return failed("Choose a category or item target.");

  let startsAt: string | null;
  let endsAt: string | null;
  try {
    startsAt = toDhakaTimestamp(formData.get("startsAt"));
    endsAt = toDhakaTimestamp(formData.get("endsAt"));
  } catch {
    return failed("Use valid Asia/Dhaka start and end times.");
  }
  if (startsAt && endsAt && endsAt <= startsAt) return failed("Offer end time must be later than its start time.");

  const value = parsed.data.kind === "percent"
    ? Math.round(parsed.data.valueDisplay * 100)
    : parsed.data.kind === "fixed"
      ? toMinorUnits(parsed.data.valueDisplay)
      : 0;
  if (parsed.data.kind === "percent" && (value < 1 || value > 10_000)) {
    return failed("Percent offers must be between 0.01% and 100%.");
  }

  const authorized = await authorizeAdminMutation("merchandising.manage");
  if (!authorized) return failed("An active staff account with merchandising.manage is required.");
  const { error } = await authorized.client.schema("api").rpc("upsert_offer_admin", {
    p_id: parsed.data.id,
    p_code: parsed.data.code || null,
    p_kind: parsed.data.kind,
    p_value: value,
    p_maximum_discount_minor: parsed.data.maximumDiscountBdt === null
      ? null
      : toMinorUnits(parsed.data.maximumDiscountBdt),
    p_minimum_subtotal_minor: toMinorUnits(parsed.data.minimumSubtotalBdt),
    p_is_active: parsed.data.isActive,
    p_is_stackable: parsed.data.isStackable,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_priority: parsed.data.priority,
    p_target_kind: parsed.data.targetKind,
    p_target_id: parsed.data.targetId,
    p_name_en: parsed.data.nameEn,
    p_name_bn: parsed.data.nameBn,
    p_description_en: parsed.data.descriptionEn || null,
    p_description_bn: parsed.data.descriptionBn || null,
    p_terms_en: parsed.data.termsEn || null,
    p_terms_bn: parsed.data.termsBn || null,
  });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Offer saved." };
}

export async function updateHomeSectionAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      isActive: booleanValue,
      sortOrder,
      titleEn: optionalText(160),
      titleBn: optionalText(160),
      subtitleEn: optionalText(400),
      subtitleBn: optionalText(400),
    })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
      sortOrder: formData.get("sortOrder"),
      titleEn: formData.get("titleEn"),
      titleBn: formData.get("titleBn"),
      subtitleEn: formData.get("subtitleEn"),
      subtitleBn: formData.get("subtitleBn"),
    });
  if (!parsed.success) return failed("Check the homepage section fields.");
  const authorized = await authorizeAdminMutation("merchandising.manage");
  if (!authorized) return failed("An active staff account with merchandising.manage is required.");
  const { error } = await authorized.client
    .schema("api")
    .rpc("update_home_section_admin", {
      p_section_id: parsed.data.id,
      p_is_active: parsed.data.isActive,
      p_sort_order: parsed.data.sortOrder,
      p_title_en: parsed.data.titleEn || null,
      p_title_bn: parsed.data.titleBn || null,
      p_subtitle_en: parsed.data.subtitleEn || null,
      p_subtitle_bn: parsed.data.subtitleBn || null,
    });
  if (error) return failed(databaseMessage(error.message));
  refreshAdminAndStorefront();
  return { status: "success", message: "Homepage section updated." };
}

export async function updateMetaConfigurationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = z
    .object({
      enabled: booleanValue,
      pixelId: z.string().trim().max(32).optional().default(""),
      capiToken: z.string().max(2048).optional().default(""),
      clearToken: booleanValue,
    })
    .safeParse({
      enabled: formData.get("enabled"),
      pixelId: formData.get("pixelId"),
      capiToken: formData.get("capiToken"),
      clearToken: formData.get("clearToken"),
    });
  if (!parsed.success) return failed("Check the Meta configuration fields.");
  if (parsed.data.pixelId && !/^\d{5,32}$/.test(parsed.data.pixelId)) {
    return failed("Meta Pixel ID must contain 5 to 32 digits.");
  }
  if (parsed.data.capiToken && (parsed.data.capiToken.length < 20 || /\s/.test(parsed.data.capiToken))) {
    return failed("The CAPI token format is not valid.");
  }

  const authorized = await authorizeAdminMutation("integrations.manage");
  if (!authorized) return failed("An active staff account with integrations.manage is required.");

  try {
    const serviceClient = createAdminClient();
    const { error } = await serviceClient.schema("api").rpc(
      "set_meta_integration_server",
      {
        p_actor_id: authorized.actorId,
        p_enabled: parsed.data.enabled,
        p_pixel_id: parsed.data.pixelId || null,
        p_capi_token: parsed.data.capiToken || null,
        p_clear_token: parsed.data.clearToken,
      },
    );
    if (error) return failed(databaseMessage(error.message));
  } catch {
    return failed("The server-only Supabase secret key is not configured.");
  }

  revalidatePath("/admin");
  return {
    status: "success",
    message: parsed.data.capiToken
      ? "Meta configuration saved; the token is now write-only."
      : "Meta configuration saved.",
  };
}
