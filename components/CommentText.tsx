import { Fragment } from "react";

const LINK = /(\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+)/gi;

/**
 * Plain-text comment body: React escapes everything, newlines become <br>,
 * and only http(s)/www links become anchors marked as user-generated.
 */
export function CommentText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(LINK).map((part, j) =>
            j % 2 === 1 ? (
              <a
                key={j}
                href={part.startsWith("www.") ? `https://${part}` : part}
                rel="ugc nofollow noopener"
                target="_blank"
              >
                {part}
              </a>
            ) : (
              part
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}
