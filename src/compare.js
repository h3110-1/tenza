// "Who has this?" — for a selected show, find which of your friends also have
// it on their list and show their watch status and rating. Friends' shows are
// readable thanks to the shows.view "isFriend" permission rule, so a query by
// MyAnimeList id comes back already scoped to you + your friends.
import { state, $, STATUS_BY_KEY } from "./state.js";
import { db } from "./db.js";

let unsub = null;
let currentKey = null; // identifies the open query, so stale responses are ignored

function stop() {
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
}

function close() {
  stop();
  currentKey = null;
  $("compareOverlay").style.display = "none";
}

export function openCompare(show) {
  $("compareTitle").textContent = show.title;
  const body = $("compareBody");
  body.innerHTML = '<div class="friend-empty">Checking your friends’ lists…</div>';
  $("compareOverlay").style.display = "flex";

  // Match by MyAnimeList id (stable across users); fall back to the exact title
  // for the rare show that was stored without one.
  const where = show.malId != null && show.malId !== ""
    ? { malId: show.malId }
    : { title: show.title };
  const key = JSON.stringify(where);
  currentKey = key;

  stop();
  unsub = db.subscribeQuery({ shows: { $: { where } } }, (resp) => {
    if (currentKey !== key) return; // superseded by a newer open()
    if (resp.error) {
      body.innerHTML = '<div class="friend-empty">Couldn’t load — ' +
        (resp.error.message || "try again") + "</div>";
      return;
    }
    if (!resp.data) return;
    renderMatches(resp.data.shows || []);
  });
}

function renderMatches(rows) {
  const body = $("compareBody");
  const myId = state.currentUser ? state.currentUser.id : null;
  const nameById = new Map(state.friends.map((f) => [f.id, f.username]));

  const mapped = rows
    .filter((r) => r.ownerId && (r.ownerId === myId || nameById.has(r.ownerId)))
    .map((r) => ({
      isMe: r.ownerId === myId,
      username: r.ownerId === myId ? "You" : nameById.get(r.ownerId),
      status: r.status || "",
      rating: typeof r.rating === "number" ? r.rating : 0,
    }));

  // Your own copy is pinned at the top as a reference; friends follow, ranked.
  const me = mapped.find((m) => m.isMe) || null;
  const friends = mapped
    .filter((m) => !m.isMe)
    .sort((a, b) => b.rating - a.rating || a.username.localeCompare(b.username));

  if (!me && !friends.length) {
    body.innerHTML = '<div class="friend-empty">' +
      (state.friends.length
        ? "None of your friends have this on their list yet."
        : "Add some friends to compare lists.") +
      "</div>";
    return;
  }

  body.innerHTML = "";
  const count = document.createElement("div");
  count.className = "compare-count";
  count.textContent = friends.length
    ? friends.length + (friends.length === 1 ? " friend has this" : " friends have this")
    : "None of your friends have this yet";
  body.appendChild(count);

  if (me) body.appendChild(matchRow(me));
  friends.forEach((m) => body.appendChild(matchRow(m)));
}

function matchRow(m) {
  const row = document.createElement("div");
  row.className = "friend-row" + (m.isMe ? " is-me" : "");

  const name = document.createElement("span");
  name.className = "friend-name";
  name.textContent = m.username;

  const meta = document.createElement("div");
  meta.className = "compare-meta";

  const st = STATUS_BY_KEY[m.status];
  const badge = document.createElement("span");
  badge.className = "compare-status" + (m.status ? "" : " none");
  badge.textContent = m.status ? (st ? st.label : m.status) : "No status";
  if (st) { badge.style.color = st.color; badge.style.borderLeftColor = st.color; }
  meta.appendChild(badge);

  const rating = document.createElement("span");
  rating.className = "compare-rating" + (m.rating > 0 ? " set" : "");
  rating.textContent = m.rating > 0 ? fmt(m.rating) + "/10" : "Unrated";
  meta.appendChild(rating);

  row.appendChild(name);
  row.appendChild(meta);
  return row;
}

function fmt(v) { return Number.isInteger(v) ? v + "" : v.toFixed(1); }

export function initCompare() {
  $("compareClose").addEventListener("click", close);
  $("compareOverlay").addEventListener("click", (e) => { if (e.target.id === "compareOverlay") close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("compareOverlay").style.display !== "none") close();
  });
}
