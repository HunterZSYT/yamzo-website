import { z } from "zod";

export type CartLine = {
  key: string;
  itemId: string;
  itemName: string;
  imageSrc: string | null;
  variantId: string | null;
  variantLabel: string | null;
  modifierOptionIds: string[];
  modifierLabels: string[];
  unitPrice: number;
  quantity: number;
};

export const checkoutSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  sector: z.string().trim().regex(/^\d{1,2}$/, "Enter a valid Uttara sector"),
  road: z.string().trim().regex(/^\d+$/, "Road number must contain digits only").max(30),
  house: z.string().trim().regex(/^\d+$/, "House number must contain digits only").max(30),
  flat: z.string().trim().min(1, "Flat number is required").max(30),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d+$/, "Enter a valid Bangladesh mobile number")
    .refine(
      (value) => /^(?:\+?8801|01)[3-9]\d{8}$/.test(value),
      "Enter a valid Bangladesh mobile number",
    ),
  notes: z.string().trim().max(300).optional().default(""),
});

export type CheckoutDetails = z.infer<typeof checkoutSchema>;

export type CreateOrderRequest = {
  customer: CheckoutDetails;
  locale: "en" | "bn";
  expectedSubtotalMinor: number;
  turnstileToken?: string;
  lines: Array<{
    menuItemId: string;
    variantId: string | null;
    modifierOptionIds: string[];
    quantity: number;
  }>;
};

export type CreateOrderResponse = {
  orderNumber: string;
  publicId: string;
  trackingToken: string;
  mode: "test" | "live";
};

export const orderStatusSchema = z.enum([
  "placed",
  "pending_acceptance",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "rejected",
  "cancelled",
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export type OrderSummary = {
  publicId: string;
  orderNumber: string;
  status: OrderStatus;
  mode: "test" | "live";
  total: number;
  placedAt: string;
  itemCount: number;
  customerName: string;
  phoneMasked: string;
};
