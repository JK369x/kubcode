export type Theme = "dark" | "light";
export function resolveTheme(saved: string | null): Theme {
  return saved === "light" ? "light" : "dark";
}
export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
