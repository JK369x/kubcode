/**
 * Site navigation (owner, 2026-11-16): the four content pages are one topic,
 * grouped under "เรียนรู้"; "ราคา" stays top-level. The desktop header, the
 * phone sheet and tests read this one list.
 */
export const LEARN_LINKS = [
  { href: "/", label: "คลังทักษะ", desc: "คลิปตัวอย่างและ skill ที่โหลดไปทำต่อได้" },
  { href: "/articles", label: "บทความ", desc: "วิธีทำคลิปด้วย AI agent ทีละขั้น" },
  { href: "/tools", label: "เครื่องมือ", desc: "เครื่องมือที่ใช้ แยกตามขั้นตอนทำคลิป" },
  { href: "/community", label: "ชุมชน", desc: "คลิปที่คนอื่นทำด้วย skill ของ kubcode" },
] as const;

export const PRICING_LINK = { href: "/pricing", label: "ราคา" } as const;

/** Every main destination, in header order (learn group, then pricing). */
export const MAIN_LINKS = [...LEARN_LINKS, PRICING_LINK] as const;

/** Signed-in, may publish: the work actions shown in the header itself. */
export const WORK_LINKS = [
  { href: "/account", label: "แดชบอร์ด" },
  { href: "/account/posts", label: "โพสต์ของฉัน" },
  { href: "/account/channels", label: "ช่อง" },
] as const;

/** Is this link the current page (or a section under it)? "/" only matches itself. */
export function isCurrent(href: string, path: string | null | undefined): boolean {
  if (!path) return false;
  if (href === "/" || href === "/account") return path === href;
  return path === href || path.startsWith(`${href}/`);
}
