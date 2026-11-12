import { SELLER, sellerMailto } from "@/lib/seller";

/** Seller name + email as a definition list (used on /contact and /refund). */
export function SellerContact() {
  const mailto = sellerMailto();
  return (
    <dl className="seller-contact">
      <dt>ผู้ขาย</dt>
      <dd>
        {SELLER.name} ({SELLER.kind}, {SELLER.country})
      </dd>
      <dt>อีเมล</dt>
      <dd>{mailto ? <a href={mailto}>{SELLER.email}</a> : SELLER.email}</dd>
      <dt>ระยะเวลาตอบกลับ</dt>
      <dd>{SELLER.responseTime}</dd>
    </dl>
  );
}
