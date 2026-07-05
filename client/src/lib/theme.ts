export type Theme = "dark" | "light";

export function getTheme(): Theme {
  try {
    return localStorage.getItem("ss_theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Apply and persist the theme. Dark is the default (no data-theme attribute). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem("ss_theme", theme);
  } catch {
    /* ignore */
  }
}
