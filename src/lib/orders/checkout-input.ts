export const numericCheckoutFields = ["sector", "road", "house"] as const;

export type NumericCheckoutField = (typeof numericCheckoutFields)[number];

export function isNumericCheckoutField(value: string): value is NumericCheckoutField {
  return numericCheckoutFields.includes(value as NumericCheckoutField);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Keep the optional international prefix used for Bangladesh mobile numbers,
 * while removing spaces, punctuation, and any non-numeric input.
 */
export function normalizeBangladeshPhoneInput(value: string): string {
  const permitted = value.replace(/[^\d+]/g, "");
  const digits = permitted.replace(/\+/g, "");

  return permitted.startsWith("+") ? `+${digits}` : digits;
}

export function normalizeCheckoutInput(
  field: string,
  value: string,
): string {
  if (isNumericCheckoutField(field)) return digitsOnly(value);
  if (field === "phone") return normalizeBangladeshPhoneInput(value);

  return value;
}
