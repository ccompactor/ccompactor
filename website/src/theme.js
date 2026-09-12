// Theme preference: `light`, `dark`, or `auto`.
//
// `auto` is a stored *preference*, never an applied state — it is resolved
// against the OS and then kept in step by a matchMedia listener, so the
// document always carries a concrete `data-theme` and the stylesheet needs one
// dark block rather than a media query that fights the explicit choice.
//
// The same resolution runs inline in index.html before first paint; keep the
// two in step.

export const THEME_KEY = "sctxx-theme";

export const PREFERENCES = ["light", "dark", "auto"];

/** The stored preference, defaulting to `auto`. */
export function readPreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return PREFERENCES.includes(stored) ? stored : "auto";
  } catch {
    // Private mode, or storage disabled: following the OS is still right.
    return "auto";
  }
}

/** The theme a preference means right now. */
export function resolve(preference) {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Write `data-theme` on <html> and remember the preference. */
export function apply(preference) {
  const theme = resolve(preference);
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  return theme;
}

/**
 * Call `onChange` whenever the OS switches appearance, while `auto` is active.
 * Returns an unsubscribe function.
 */
export function watchSystem(onChange) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
