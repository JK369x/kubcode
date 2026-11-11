"use client";
import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { resolveTheme, nextTheme, Theme } from "@/lib/theme";
export function ThemeToggle() {
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
  return (
    <button
      className="theme-toggle"
      // The visible word stays in the name (WCAG 2.5.3 label in name).
      aria-label={
        theme === "dark" ? "Light: เปลี่ยนเป็นธีมสว่าง" : "Dark: เปลี่ยนเป็นธีมมืด"
      }
      aria-pressed={theme === "light"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
