// Entry point: wire the list controls, theme toggle, back-to-top, then boot
// the search box and auth flow.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { render } from "./render.js";
import { initSearch } from "./search.js";
import { initAuth } from "./auth.js";
import { initFriends } from "./friends.js";
import { initCompare } from "./compare.js";

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
$("tagfilterToggle").addEventListener("click", () => {
  state.tagFilterCollapsed = !state.tagFilterCollapsed;
  $("tagfilterSection").classList.toggle("collapsed", state.tagFilterCollapsed);
});

/* ---------- Settings menu (device prefs, not user data) ---------- */
const PER_ROW_KEY = "animeTracker.perRow";
const PER_ROW_CHOICES = [2, 3, 4, 5, 6];
const settingsBtn = $("settingsBtn");
const settingsMenu = $("settingsMenu");
const perRowChoices = $("perRowChoices");

let perRow = readJSON(PER_ROW_KEY, 4);
if (!PER_ROW_CHOICES.includes(perRow)) perRow = 4;

function applyPerRow(n) {
  perRow = n;
  document.documentElement.style.setProperty("--cards-per-row", String(n));
  // Cards get narrow at 4+ per row — stack the rating bars vertically so the
  // score doesn't get clipped.
  document.body.classList.toggle("vertical-rating", n >= 4);
  for (const b of perRowChoices.children) b.classList.toggle("active", Number(b.dataset.n) === n);
}
PER_ROW_CHOICES.forEach((n) => {
  const b = document.createElement("button");
  b.textContent = String(n);
  b.dataset.n = n;
  b.onclick = () => { applyPerRow(n); writeJSON(PER_ROW_KEY, n); };
  perRowChoices.appendChild(b);
});
applyPerRow(perRow);

const SHOW_TAGS_KEY = "animeTracker.showTags";
const showTags = $("showTags");
function applyShowTags(on) {
  document.body.classList.toggle("show-tags", on);
  showTags.checked = on;
}
let showTagsOn = readJSON(SHOW_TAGS_KEY, false);
applyShowTags(showTagsOn);
showTags.addEventListener("change", (e) => {
  showTagsOn = e.target.checked;
  applyShowTags(showTagsOn);
  writeJSON(SHOW_TAGS_KEY, showTagsOn);
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsMenu.style.display = settingsMenu.style.display === "none" ? "block" : "none";
});
document.addEventListener("click", (e) => {
  if (settingsMenu.style.display !== "none" && !settingsMenu.contains(e.target)) {
    settingsMenu.style.display = "none";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") settingsMenu.style.display = "none";
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
initFriends();
initCompare();
initAuth();
