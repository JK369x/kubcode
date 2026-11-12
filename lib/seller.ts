/**
 * Who sells kubcode's paid plans: the owner, as an individual (ADR 0007).
 * Shown on /contact, /refund, /terms and in the footer, where card networks
 * and Stripe expect to find it.
 *
 * PLACEHOLDERS: the owner has not given the legal name and contact email yet.
 * `tests/seller.test.ts` fails while any value below still contains
 * `PLACEHOLDER`, so the site cannot ship with them by accident.
 */
export const SELLER = {
  /** Legal name of the individual seller, as on the Stripe account. */
  name: "PLACEHOLDER_SELLER_NAME",
  /** Public support/billing email. */
  email: "PLACEHOLDER_SELLER_EMAIL",
  /** Thai wording, shown as-is. */
  kind: "บุคคลธรรมดา",
  country: "ประเทศไทย",
  /** How fast we answer, shown on /contact. */
  responseTime: "ภายใน 2 วันทำการ",
} as const;

export const isPlaceholder = (value: string) => value.includes("PLACEHOLDER");

/** A mailto link only for a real address. */
export const sellerMailto = () => (isPlaceholder(SELLER.email) ? null : `mailto:${SELLER.email}`);
