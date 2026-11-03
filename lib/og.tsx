import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

const fontDir = path.join(process.cwd(), "node_modules/@fontsource/anuphan/files");

/** Anuphan 600 (Thai + Latin subsets): Satori needs real font data for Thai. */
async function fonts() {
  const load = (subset: string) =>
    readFile(path.join(fontDir, `anuphan-${subset}-600-normal.woff`));
  const [thai, latin] = await Promise.all([load("thai"), load("latin")]);
  return [
    { name: "Anuphan", data: latin, weight: 600 as const, style: "normal" as const },
    { name: "Anuphan", data: thai, weight: 600 as const, style: "normal" as const },
  ];
}

/** Shared social card: kind label, page title and one line of description. */
export async function ogImage(input: { eyebrow: string; title: string; description: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#100e15",
          color: "#f5f1fb",
          fontFamily: "Anuphan",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#bb98ff" }}>{input.eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 68, lineHeight: 1.25 }}>{input.title}</div>
          <div style={{ display: "flex", fontSize: 30, color: "#b8adca", lineHeight: 1.5 }}>
            {input.description}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 30 }}>kubcode.dev</div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
