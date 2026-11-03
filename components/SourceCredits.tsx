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
      <br />
      อัปเดต <time dateTime={page.updated}>{page.updated}</time>
    </div>
  );
}
