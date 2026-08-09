export const ADMIN_ORDER_STATUSES = [
  "placed",
  "pending_acceptance",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export type AdminDataAvailability =
  | "ready"
  | "unavailable"
  | "permission_required";

export type AdminRuntimeSettings = {
  sitePublished: boolean;
  liveOrdersEnabled: boolean;
  testModeEnabled: boolean;
};

export type AdminDashboardMetrics = {
  pendingLiveOrders: number | null;
  pendingTestOrders: number | null;
  liveOrdersToday: number | null;
  liveRevenueTodayMinor: number | null;
  pendingStaffRequests: number | null;
  unavailableMenuItems: number | null;
};

export type AdminOrderSummary = {
  orderId: string;
  orderReference: string;
  mode: "live" | "test";
  status: AdminOrderStatus;
  version: number;
  grandTotalMinor: number;
  currencyCode: string;
  placedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
};

export type AdminOrderContact = {
  fullName: string;
  phoneE164: string;
  sectorNumber: number;
  roadNumber: string;
  houseNumber: string;
  flatNumber: string;
};

export type AdminOrderModifier = {
  sourceOptionId: string | null;
  groupNameEn: string;
  groupNameBn: string;
  optionNameEn: string;
  optionNameBn: string;
  priceDeltaMinor: number;
};

export type AdminOrderLineItem = {
  id: string;
  sourceItemId: string | null;
  sourceItemPublicKey: string | null;
  sourceItemSlug: string | null;
  nameEn: string;
  nameBn: string;
  quantity: number;
  unitPriceMinor: number;
  modifierUnitTotalMinor: number;
  effectiveUnitPriceMinor: number;
  lineTotalMinor: number;
  customerNote: string | null;
  modifiers: AdminOrderModifier[];
};

export type AdminOrderStatusEvent = {
  id: number;
  fromStatus: AdminOrderStatus | null;
  toStatus: AdminOrderStatus;
  actorType: "customer" | "staff" | "terminal" | "system";
  note: string | null;
  createdAt: string;
};

export type AdminOrderMutationAudit = {
  id: number;
  action: "order.admin_updated" | "order.live_archived";
  fromVersion: number;
  toVersion: number;
  fromStatus: AdminOrderStatus;
  toStatus: AdminOrderStatus;
  note: string | null;
  createdAt: string;
};

/**
 * Deliberately returned only after an authorized staff member explicitly opens
 * an order. The dashboard summary must never preload this customer data.
 */
export type AdminOrderDetail = AdminOrderSummary & {
  locale: "en" | "bn";
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  customerNote: string | null;
  cancelledAt: string | null;
  contact: AdminOrderContact;
  items: AdminOrderLineItem[];
  statusEvents: AdminOrderStatusEvent[];
  mutationAudits: AdminOrderMutationAudit[];
};

export type AdminOrderMutationInput = {
  orderId: string;
  expectedVersion: number;
  toStatus: AdminOrderStatus | null;
  discountMinor: number | null;
  deliveryFeeMinor: number | null;
  note: string | null;
  items: Array<{
    sourceItemId: string | null;
    itemNameEn: string;
    itemNameBn: string;
    quantity: number;
    unitPriceMinor: number;
    customerNote: string | null;
    modifiers: Array<{
      sourceOptionId: string | null;
      groupNameEn: string;
      groupNameBn: string;
      optionNameEn: string;
      optionNameBn: string;
      priceDeltaMinor: number;
    }>;
  }> | null;
};

export type AdminOrderArrivalCursor = {
  placedAt: string;
  orderId: string;
};

/** Keyset cursor for bounded, newest-first website-order history pages. */
export type AdminOrderHistoryCursor = AdminOrderArrivalCursor;

export type AdminStaffSummary = {
  staffId: string;
  email: string;
  displayName: string;
  status: "pending" | "active" | "suspended";
  roleKeys: string[];
  approvedAt: string | null;
  createdAt: string;
};

export type AdminContentCounts = {
  availability: AdminDataAvailability;
  menuItems: number | null;
  banners: number | null;
  offers: number | null;
};

export type AdminBusinessHour = {
  dayOfWeek: number;
  intervalNumber: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
};

export type AdminBusinessHourException = {
  id: string;
  serviceDate: string;
  intervalNumber: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  reasonEn: string | null;
  reasonBn: string | null;
};

export type AdminMenuCategory = {
  id: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
};

export type AdminMenuItem = {
  id: string;
  slug: string;
  basePriceMinor: number;
  compareAtPriceMinor: number | null;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  preparationMinutes: number | null;
  sortOrder: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
};

export type AdminModifierGroup = {
  id: string;
  slug: string;
  minimumSelections: number;
  maximumSelections: number;
  presentation: "modifier" | "variant";
  isActive: boolean;
  sortOrder: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
};

export type AdminModifierOption = {
  id: string;
  groupId: string;
  priceDeltaMinor: number;
  isActive: boolean;
  sortOrder: number;
  nameEn: string;
  nameBn: string;
};

export type AdminBanner = {
  id: string;
  placement: "hero" | "announcement" | "cart";
  mediaId: string | null;
  actionUrl: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  eyebrowEn: string | null;
  eyebrowBn: string | null;
  titleEn: string;
  titleBn: string;
  bodyEn: string | null;
  bodyBn: string | null;
  actionLabelEn: string | null;
  actionLabelBn: string | null;
};

export type AdminOfferTarget = {
  targetKind: "all" | "category" | "item";
  targetId: string | null;
};

export type AdminOffer = {
  id: string;
  code: string | null;
  kind: "percent" | "fixed" | "free_delivery";
  value: number;
  maximumDiscountMinor: number | null;
  minimumSubtotalMinor: number;
  isActive: boolean;
  isStackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
  termsEn: string | null;
  termsBn: string | null;
  targets: AdminOfferTarget[];
};

export type AdminHomeSection = {
  id: string;
  sectionKey: string;
  kind: "banner" | "offers" | "categories" | "menu" | "reviews" | "custom";
  isActive: boolean;
  sortOrder: number;
  titleEn: string | null;
  titleBn: string | null;
  subtitleEn: string | null;
  subtitleBn: string | null;
};

export type AdminMetaConfiguration = {
  enabled: boolean;
  pixelId: string | null;
  tokenConfigured: boolean;
  updatedAt: string;
};

export type AdminOperationsSnapshot = {
  businessHours: AdminBusinessHour[] | null;
  businessHourExceptions: AdminBusinessHourException[] | null;
  menuCategories: AdminMenuCategory[] | null;
  menuItems: AdminMenuItem[] | null;
  modifierGroups: AdminModifierGroup[] | null;
  modifierOptions: AdminModifierOption[] | null;
  banners: AdminBanner[] | null;
  offers: AdminOffer[] | null;
  homeSections: AdminHomeSection[] | null;
  meta: AdminMetaConfiguration | null;
};

export type AdminDashboardSnapshot = {
  generatedAt: string;
  backendReady: boolean;
  runtime: AdminRuntimeSettings;
  metricsAvailability: AdminDataAvailability;
  metrics: AdminDashboardMetrics;
  orderQueueAvailability: AdminDataAvailability;
  orderQueue: AdminOrderSummary[];
  staffAvailability: AdminDataAvailability;
  staff: AdminStaffSummary[];
  content: AdminContentCounts;
  operationsAvailability: AdminDataAvailability;
  operations: AdminOperationsSnapshot;
};

/**
 * The dedicated order workspace receives a bounded server-side history rather
 * than reusing the dashboard's compact arrival summary. Order contact data is
 * intentionally absent until an authorized staff member opens a detail sheet.
 */
export type AdminOrderWorkspaceSnapshot = {
  generatedAt: string;
  availability: AdminDataAvailability;
  orders: AdminOrderSummary[];
};

export type ActiveAdminViewer = {
  staffId: string;
  email: string | null;
  roleKey: string;
  permissions: string[];
};
