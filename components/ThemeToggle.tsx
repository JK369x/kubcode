"use client";
import { useEffect, useState } from "react";
import { resolveTheme, nextTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Theme switch (owner, 2026-11-16: "a nicer compact toggle").
 * - `icon` (header, far right): a 40px round button, sun ↔ moon morph.
 * - `row` (phone sheet): the same icon with a visible label.
 * aria-pressed = light theme on; the name says what it does. The visible
 * word in `row` starts the accessible name (WCAG 2.5.3). The morph is CSS
 * only and does not run under prefers-reduced-motion.
 */
export function ThemeToggle({ variant = "icon", className }: { variant?: "icon" | "row"; className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(resolveTheme(document.documentElement.dataset.theme || null));
  }, []);
  function toggle() {
    const next = nextTheme(theme);
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("jk-theme", next);
    } catch {
      /* preference remains in this tab */
    }
  }
  const label = theme === "dark" ? "Light: เปลี่ยนเป็นธีมสว่าง" : "Dark: เปลี่ยนเป็นธีมมืด";
  return (
    <button
      type="button"
      className={cn("theme-switch", variant === "row" && "theme-switch-row", className)}
      data-theme-now={theme}
      aria-label={label}
      aria-pressed={theme === "light"}
      title={variant === "icon" ? label.split(": ")[1] : undefined}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="theme-switch-icon">
        {/* Moon mask: slides in over the sun's disc to make a crescent. */}
        <mask id="theme-switch-moon">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="theme-switch-bite" cx="24" cy="4" r="7" fill="#000" />
        </mask>
        <circle className="theme-switch-disc" cx="12" cy="12" r="5" fill="currentColor" mask="url(#theme-switch-moon)" />
        <g className="theme-switch-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="1.5" x2="12" y2="3.5" />
          <line x1="12" y1="20.5" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="3.5" y2="12" />
          <line x1="20.5" y1="12" x2="22.5" y2="12" />
          <line x1="4.6" y1="4.6" x2="6" y2="6" />
          <line x1="18" y1="18" x2="19.4" y2="19.4" />
          <line x1="4.6" y1="19.4" x2="6" y2="18" />
          <line x1="18" y1="6" x2="19.4" y2="4.6" />
        </g>
      </svg>
      {variant === "row" && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}
