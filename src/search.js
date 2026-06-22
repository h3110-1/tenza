// Jikan search dropdown + adding a show to the list.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { db, id, persistShow, nextOrder } from "./db.js";
import { expandQuery } from "./abbreviations.js";
import { render } from "./render.js";

const searchInput = $("search");
const resultsBox = $("results");

let searchTimer;
let currentResults = [];   // results currently shown in the dropdown
let resultsQuery = "";     // the query those results belong to

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) { resultsBox.style.display = "none"; currentResults = []; return; }
  resultsBox.style.display = "block";
  resultsBox.innerHTML = '<div class="status">Searching…</div>';
  try {
    const term = expandQuery(q);
    const res = await fetch(
      "https://api.jikan.moe/v4/anime?sfw&limit=8&q=" + encodeURIComponent(term)
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    currentResults = json.data || [];
    resultsQuery = q;
    renderResults(currentResults);
  } catch (e) {
    currentResults = [];
    resultsBox.innerHTML = '<div class="status">Search failed — check your connection and try again.</div>';
  }
}

// Add the first result, fetching it first if the dropdown isn't current.
async function addTopResult() {
  const q = searchInput.value.trim();
  if (!q) return;
  if (!(currentResults.length && resultsQuery === q)) await runSearch();
  if (currentResults.length) addShow(currentResults[0]);
  else toast("No results to add — try a different name");
}

function renderResults(list) {
  if (!list.length) {
    resultsBox.innerHTML = '<div class="status">No results found.</div>';
    return;
  }
  resultsBox.innerHTML = "";
  list.forEach((a) => {
    const img = (a.images && a.images.jpg && a.images.jpg.image_url) || "";
    const title = a.title_english || a.title || "Untitled";
    const year = a.year || (a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || "";
    const type = a.type || "";
    const alreadyAdded = a.mal_id && state.shows.some((s) => s.malId === a.mal_id);
    const el = document.createElement("div");
    el.className = "result" + (alreadyAdded ? " added" : "");
    el.innerHTML =
      '<img src="' + img + '" alt="" onerror="this.style.visibility=\'hidden\'"/>' +
      '<div class="meta"><div class="t"></div><div class="s"></div></div>' +
      (alreadyAdded ? '<span class="added-tag">✓ Added</span>' : "");
    el.querySelector(".t").textContent = title;
    el.querySelector(".s").textContent = [type, year].filter(Boolean).join(" · ");
    if (!alreadyAdded) el.addEventListener("click", () => addShow(a));
    resultsBox.appendChild(el);
  });
}

// Build tags from Jikan's classification fields (genres, themes, demographics).
function autoTags(a) {
  const tags = [];
  [a.genres, a.themes, a.demographics].forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((item) => {
        const name = ((item && item.name) || "").trim().toLowerCase();
        if (name && !tags.includes(name)) tags.push(name);
      });
    }
  });
  return tags;
}

function addShow(a) {
  const title = a.title_english || a.title || "Untitled";
  if (a.mal_id && state.shows.some((s) => s.malId === a.mal_id)) {
    toast(title + " is already in your list");
    return;
  }
  const tags = autoTags(a);
  const s = {
    id: id(),
    malId: a.mal_id || null,
    url: a.url || (a.mal_id ? "https://myanimelist.net/anime/" + a.mal_id : ""),
    title: title,
    imageUrl: (a.images && a.images.jpg && (a.images.jpg.large_image_url || a.images.jpg.image_url)) || "",
    year: a.year || (a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || "",
    rating: 0,
    tags: tags,
    added: Date.now(),
    // Watch tracking
    status: "",                                  // "" | watching | completed | plan | onhold | dropped
    airing: !!a.airing,                          // currently broadcasting?
    airStatus: a.status || "",                   // "Currently Airing" / "Finished Airing" / "Not yet aired"
    broadcast: (a.broadcast && a.broadcast.string) || "", // e.g. "Saturdays at 23:00 (JST)"
    order: nextOrder(),
  };
  state.shows.push(s);
  persistShow(s);
  searchInput.value = "";
  resultsBox.style.display = "none";
  currentResults = [];
  resultsQuery = "";
  render();
  toast("Added " + title + (tags.length ? " · " + tags.length + " tags" : ""));
}

// Wire the search box, button, and click-away-to-close behaviour.
export function initSearch() {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 400); // debounce; Jikan rate-limits
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); addTopResult(); }
    if (e.key === "Escape") resultsBox.style.display = "none";
  });
  $("searchBtn").addEventListener("click", () => { clearTimeout(searchTimer); runSearch(); });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".add-bar")) resultsBox.style.display = "none";
  });
}
