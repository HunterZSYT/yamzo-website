import type { OrderSummary } from "@/lib/orders/types";

import type {
  OrderHistoryRow,
  TrackedOrderRpcResponse,
} from "./api-contract";

function orderNumber(reference: string): string {
  return reference.startsWith("YZ-") ? reference.slice(3) : reference;
}

export function presentTrackedOrder(
  order: TrackedOrderRpcResponse,
): OrderSummary {
  return {
    publicId: order.order_reference,
    orderNumber: orderNumber(order.order_reference),
    status: order.status,
    mode: order.mode,
    total: order.grand_total_minor / 100,
    placedAt: order.placed_at,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    customerName: "Yamzo customer",
    phoneMasked: "Private",
  };
}

export function presentHistoryOrder(order: OrderHistoryRow): OrderSummary {
  return {
    publicId: order.order_reference,
    orderNumber: orderNumber(order.order_reference),
    status: order.status,
    mode: order.mode,
    total: order.grand_total_minor / 100,
    placedAt: order.placed_at,
    itemCount: order.item_count,
    customerName: "Account order",
    phoneMasked: "Saved account",
  };
}
