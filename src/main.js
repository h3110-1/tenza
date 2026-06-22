// Entry point: wire the list controls, theme toggle, back-to-top, then boot
// the search box and auth flow.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { render } from "./render.js";
import { initSearch } from "./search.js";
import { initAuth } from "./auth.js";

/* ---------- Local prefs (theme only — a device preference, not user data) ---------- */
const memStore = {};
let storageWarned = false;
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw);
  } catch (e) { /* storage blocked — fall through to the in-memory mirror */ }
  return key in memStore ? memStore[key] : fallback;
}
function writeJSON(key, val) {
  memStore[key] = val;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    if (!storageWarned) {
      storageWarned = true;
      toast("Heads up: this browser is blocking saved storage, so your theme won't persist.");
    }
  }
}

/* ---------- List controls ---------- */
$("sort").addEventListener("change", (e) => { state.sortMode = e.target.value; render(); });
$("listFilter").addEventListener("input", (e) => { state.listFilter = e.target.value.trim(); render(); });
$("unratedToggle").addEventListener("click", () => {
  state.unratedCollapsed = !state.unratedCollapsed;
  $("unratedSection").classList.toggle("collapsed", state.unratedCollapsed);
});

/* ---------- Back to top ---------- */
const backToTop = $("backToTop");
window.addEventListener("scroll", () => {
  backToTop.classList.toggle("show", window.scrollY > 400);
}, { passive: true });
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ---------- Theme ---------- */
const THEME_KEY = "animeTracker.theme";
function applyTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  const btn = $("themeToggle");
  btn.textContent = theme === "light" ? "🌙 Dark" : "☀️ Light";
  btn.title = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
}
let theme = readJSON(THEME_KEY, "dark");
applyTheme(theme);
$("themeToggle").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  writeJSON(THEME_KEY, theme);
  applyTheme(theme);
});

/* ---------- Boot ---------- */
initSearch();
initAuth();
