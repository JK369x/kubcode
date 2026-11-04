import type { Page } from "@/lib/content";

/** Credits upstream sources and shows when the page was last updated. */
export function SourceCredits({ page }: { page: Page }) {
  return (
    <div className="source-note">
      {page.sources.length > 0 && (
        <>
          ที่มา:{" "}
          {page.sources.map((s, i) => (
            <span key={s.title}>
              {i > 0 && " · "}
              {s.url ? (
                <a href={s.url} rel="noopener noreferrer" target="_blank">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
          ))}
        </>
      )}
      {page.sourceNote && <> · {page.sourceNote}</>}
      {page.kind === "tool" && <LogoCredit name={page.name} logo={page.logo} />}
      <br />
      อัปเดต <time dateTime={page.updated}>{page.updated}</time>
    </div>
  );
}

/** Where a tool's logo came from; marks are the makers', used only to name the product. */
function LogoCredit({ name, logo }: { name: string; logo: Extract<Page, { kind: "tool" }>["logo"] }) {
  return (
    <>
      <br />
      {logo.kind === "image" ? (
        <>
          โลโก้ {name} เป็นของเจ้าของผลิตภัณฑ์ ใช้เพื่ออ้างถึงผลิตภัณฑ์เท่านั้น (ไฟล์จาก{" "}
          <a href={logo.sourceUrl} rel="noopener noreferrer" target="_blank">
            {new URL(logo.sourceUrl).host.replace(/^www\./, "")}
          </a>
          {logo.guidelineUrl && (
            <>
              {" "}ตาม
              <a href={logo.guidelineUrl} rel="noopener noreferrer" target="_blank">
                แนวทางการใช้แบรนด์
              </a>
            </>
          )}
          )
        </>
      ) : (
        <>แสดงอักษรย่อแทนโลโก้ {name}: {logo.reason}</>
      )}
    </>
  );
}
