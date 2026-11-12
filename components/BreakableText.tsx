import { Fragment, type ReactNode } from "react";

/** Long URL / path tokens (no spaces, 20+ chars) that may need to wrap. */
const LONG = /(\S{20,})/g;

/**
 * Renders prompt / command text so long URLs and paths wrap at "/", "-", "."
 * and "_" instead of in the middle of a word at narrow widths: a <wbr> goes
 * after each of those in tokens of 20+ characters. Thai and ordinary words are
 * left alone (they wrap at spaces and by the browser's Thai line breaking).
 * <wbr> adds no text, so copying (textContent) gives the exact original.
 * Pair with `white-space: pre-wrap; overflow-wrap: break-word` (not
 * `anywhere`), so a token only breaks mid-word when one segment is still
 * wider than the box.
 */
export function BreakableText({ text }: { text: string }): ReactNode {
  return text.split(LONG).map((part, i) =>
    i % 2 === 1 ? (
      <Fragment key={i}>
        {part.split(/(?<=[/\-._?&=])/).map((seg, j) => (
          <Fragment key={j}>
            {j > 0 && <wbr />}
            {seg}
          </Fragment>
        ))}
      </Fragment>
    ) : (
      part
    ),
  );
}
