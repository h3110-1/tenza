// Rendering the collection: grid, cards, rating control, tags, status, drag.
// When viewing a friend's list (state.viewingFriend set), everything renders
// read-only — no add/remove/rate/reorder controls.
import { state, $, STATUSES, STATUS_BY_KEY } from "./state.js";
import { toast, toastUndo } from "./toast.js";
import { db, persist, persistShow } from "./db.js";
import { expandQuery } from "./abbreviations.js";

const grid = $("grid");

// The list currently on screen: a friend's when viewing, otherwise our own.
function currentList() {
  return state.viewingFriend ? state.viewShows : state.shows;
}
function isReadOnly() {
  return !!state.viewingFriend;
}

function allTags() {
  const set = new Set();
  currentList().forEach((s) => s.tags.forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function sortedShows() {
  let list = currentList().slice();
  if (state.activeStatusFilter) list = list.filter((s) => s.status === state.activeStatusFilter);
  if (state.activeTagFilter) list = list.filter((s) => s.tags.includes(state.activeTagFilter));
  if (state.listFilter) {
    const q = state.listFilter.toLowerCase();
    const expanded = expandQuery(state.listFilter).toLowerCase(); // e.g. "jjk" -> "jujutsu kaisen"
    const terms = expanded === q ? [q] : [q, expanded];
    list = list.filter((s) => {
      const hay = s.title.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  }
  if (state.sortMode === "rating") list.sort((a, b) => b.rating - a.rating);
  else if (state.sortMode === "title") list.sort((a, b) => a.title.localeCompare(b.title));
  else if (state.sortMode === "added") list.sort((a, b) => b.added - a.added);
  return list; // "manual" keeps array order (which is `order` order)
}

function renderStatusFilter() {
  const box = $("statusfilter");
  box.innerHTML = "";
  const list = currentList();
  // No statuses set anywhere yet → hide the bar entirely.
  if (!list.some((s) => s.status)) return;

  const counts = {};
  list.forEach((s) => { if (s.status) counts[s.status] = (counts[s.status] || 0) + 1; });

  const makePill = (key, label, color, count, active) => {
    const b = document.createElement("button");
    b.className = "spill" + (active ? " active" : "");
    const dot = color ? '<span class="dot" style="background:' + color + '"></span>' : "";
    b.innerHTML = dot + label + ' <span class="cnt">' + count + "</span>";
    b.onclick = () => {
      state.activeStatusFilter = active ? null : key;
      render();
    };
    return b;
  };

  box.appendChild(makePill(null, "All", "", list.length, !state.activeStatusFilter));
  STATUSES.forEach((st) => {
    if (counts[st.key]) {
      box.appendChild(makePill(st.key, st.label, st.color, counts[st.key], state.activeStatusFilter === st.key));
    }
  });
}

function renderTagFilter() {
  const box = $("tagfilter");
  box.innerHTML = "";
  const tags = allTags();
  if (!tags.length) return;
  tags.forEach((t) => {
    const b = document.createElement("button");
    b.className = "ghost" + (state.activeTagFilter === t ? " active" : "");
    b.textContent = "#" + t;
    b.onclick = () => { state.activeTagFilter = state.activeTagFilter === t ? null : t; render(); };
    box.appendChild(b);
  });
  if (state.activeTagFilter) {
    const clear = document.createElement("button");
    clear.className = "ghost";
    clear.textContent = "Clear filter ✕";
    clear.onclick = () => { state.activeTagFilter = null; render(); };
    box.appendChild(clear);
  }
}

export function render() {
  renderStatusFilter();
  renderTagFilter();
  const readOnly = isReadOnly();
  const list = sortedShows();
  const rated = list.filter((s) => s.rating > 0);
  const unrated = list.filter((s) => !s.rating);

  const total = currentList().length;
  const shown = rated.length + unrated.length;
  const filtering = !!(state.listFilter || state.activeTagFilter || state.activeStatusFilter);
  $("count").textContent = filtering && shown < total
    ? shown + " of " + total + " shown"
    : total + (total === 1 ? " show" : " shows");

  const empty = $("empty");
  if (total === 0) {
    empty.style.display = "block";
    empty.textContent = readOnly
      ? state.viewingFriend.username + " hasn't added any shows yet."
      : "No shows yet — search for one above to get started. 🎬";
  } else if (shown === 0) {
    empty.style.display = "block";
    empty.textContent = "No shows match your filter.";
  } else {
    empty.style.display = "none";
  }

  // Rated / ranked list
  grid.innerHTML = "";
  const showRanks = state.sortMode === "manual" && !state.activeTagFilter && !state.listFilter;
  rated.forEach((s, i) => grid.appendChild(card(s, showRanks ? i + 1 : null, readOnly)));

  // Unrated list (newly added), separated below
  const uGrid = $("unratedGrid");
  uGrid.innerHTML = "";
  const uSection = $("unratedSection");
  uSection.style.display = unrated.length ? "block" : "none";
  uSection.classList.toggle("collapsed", state.unratedCollapsed);
  $("unratedCount").textContent = unrated.length ? "(" + unrated.length + ")" : "";
  unrated.forEach((s) => uGrid.appendChild(card(s, null, readOnly)));
}

function card(s, rank, readOnly) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = s.id;

  // Poster
  const poster = document.createElement("div");
  poster.className = "poster";
  poster.innerHTML =
    (s.imageUrl ? '<img src="' + s.imageUrl + '" alt="" onerror="this.style.display=\'none\'"/>' : "") +
    (rank != null ? '<div class="rank-badge">' + rank + "</div>" : "") +
    (rank != null && !readOnly ? '<div class="drag-handle" title="Drag to reorder">⠿</div>' : "") +
    (s.airing ? '<div class="airing-badge"><span class="pulse"></span>AIRING</div>' : "") +
    (readOnly ? "" : '<div class="del" title="Remove">✕</div>');
  if (!readOnly) {
    poster.querySelector(".del").onclick = () => {
      const index = state.shows.indexOf(s);
      state.shows = state.shows.filter((x) => x.id !== s.id);
      persist(db.tx.shows[s.id].delete());
      render();
      toastUndo("Removed " + s.title, () => {
        state.shows.splice(Math.min(index < 0 ? state.shows.length : index, state.shows.length), 0, s);
        persistShow(s);
        render();
        toast("Restored " + s.title);
      });
    };
  }

  // Click the poster to open the show on MyAnimeList (ignoring the controls).
  const malUrl = s.url || (s.malId ? "https://myanimelist.net/anime/" + s.malId : "");
  if (malUrl) {
    poster.classList.add("clickable");
    poster.title = "Open on MyAnimeList";
    poster.addEventListener("click", (e) => {
      if (e.target.closest(".del") || e.target.closest(".drag-handle")) return;
      window.open(malUrl, "_blank", "noopener");
    });
  }

  // Body
  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = s.title;
  if (s.year) {
    const y = document.createElement("span");
    y.className = "year";
    y.textContent = "  (" + s.year + ")";
    title.appendChild(y);
  }

  body.appendChild(title);

  const statusEl = buildStatus(s, readOnly);
  if (statusEl) body.appendChild(statusEl);

  const broadcast = buildBroadcast(s);
  if (broadcast) body.appendChild(broadcast);

  // Cards that start in the Unrated section shouldn't jump up to the ranked
  // list the instant you pick a whole number — wait until the pointer leaves
  // so you can still dial in a decimal first. (Editable lists only.)
  const startedUnrated = !s.rating;
  let pendingReflow = false;

  const rating = buildRating(s, readOnly, (crossedBoundary) => {
    if (!crossedBoundary) return;             // same section, card just repaints
    if (startedUnrated) pendingReflow = true; // defer the move until mouseleave
    else render();                            // clearing a rated show drops it down immediately
  });
  body.appendChild(rating);

  const tags = document.createElement("div");
  tags.className = "tags";
  renderCardTags(tags, s, readOnly);
  body.appendChild(tags);

  el.appendChild(poster);
  el.appendChild(body);

  if (!readOnly && startedUnrated) {
    el.addEventListener("mouseleave", () => {
      if (pendingReflow) { pendingReflow = false; render(); }
    });
  }

  if (!readOnly) setupDrag(el, s);
  return el;
}

// Editable status dropdown, or a static badge when read-only.
function buildStatus(s, readOnly) {
  if (readOnly) {
    if (!s.status) return null;
    const st = STATUS_BY_KEY[s.status];
    const el = document.createElement("div");
    el.className = "status-view";
    el.style.color = st ? st.color : "var(--muted)";
    el.style.borderLeftColor = st ? st.color : "var(--border)";
    el.textContent = st ? st.label : s.status;
    return el;
  }
  const sel = document.createElement("select");
  sel.className = "status-select";
  [{ key: "", label: "▾ Set status" }].concat(STATUSES).forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.key;
    opt.textContent = o.label;
    if ((s.status || "") === o.key) opt.selected = true;
    sel.appendChild(opt);
  });
  const applyColor = () => {
    const st = STATUS_BY_KEY[s.status];
    sel.style.borderLeftColor = st ? st.color : "var(--border)";
    sel.style.color = st ? st.color : "var(--muted)";
  };
  applyColor();
  sel.onchange = () => {
    s.status = sel.value;
    persistShow(s);
    render(); // status change can affect filter membership and the counts
  };
  return sel;
}

function buildBroadcast(s) {
  if (!s.airing) return null;
  const el = document.createElement("div");
  el.className = "broadcast";
  const span = document.createElement("span");
  span.className = "airing-txt";
  span.textContent = s.broadcast ? "Airs " + s.broadcast : "Currently airing";
  el.appendChild(span);
  return el;
}

// 1–10 rating: a row of 10 bars for the whole number, plus an identical
// row directly below for the decimal (tenths), giving scores like 7.4.
// Read-only mode paints the saved score with no interaction.
function buildRating(s, readOnly, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "rating-wrap" + (readOnly ? " readonly" : "");

  // Row 1 — whole number (1–10)
  const row1 = document.createElement("div");
  row1.className = "rating";
  const bars = document.createElement("div");
  bars.className = "bars";
  const num = document.createElement("span");
  num.className = "rating-num";
  row1.appendChild(bars);
  row1.appendChild(num);

  // Row 2 — decimal (.0–.9), identical control directly below
  const row2 = document.createElement("div");
  row2.className = "rating decimal-row";
  const decBars = document.createElement("div");
  decBars.className = "bars";
  const decNum = document.createElement("span");
  decNum.className = "dec-num";
  row2.appendChild(decBars);
  row2.appendChild(decNum);

  const whole = () => Math.floor(s.rating);
  const digit = () => Math.round((s.rating - whole()) * 10);
  const fmt = (v) => (Number.isInteger(v) ? v + "" : v.toFixed(1));

  // pWhole / pDigit are hover-preview values (null = use the saved rating)
  function paint(pWhole, pDigit) {
    const w = pWhole != null ? pWhole : whole();
    const d = pDigit != null ? pDigit : digit();

    [...bars.children].forEach((bar, idx) => {
      bar.classList.toggle("on", pWhole == null && idx < whole());
      bar.classList.toggle("preview", pWhole != null && idx < pWhole);
    });
    [...decBars.children].forEach((bar, idx) => {
      bar.classList.toggle("on", pDigit == null && idx <= digit());
      bar.classList.toggle("preview", pDigit != null && idx <= pDigit);
    });

    // Decimal row only makes sense for scores 1–9 (10 is the max, no .x).
    row2.style.display = whole() >= 1 && whole() < 10 ? "flex" : "none";

    const previewing = pWhole != null || pDigit != null;
    const shown = previewing ? w + (whole() < 10 ? d / 10 : 0) : s.rating;
    num.textContent = s.rating || previewing ? fmt(shown) + "/10" : "—";
    num.classList.toggle("set", s.rating > 0);
    decNum.textContent = "." + d;
    decNum.classList.toggle("set", s.rating > 0);
  }

  for (let i = 1; i <= 10; i++) {
    const bar = document.createElement("div");
    bar.className = "bar";
    if (!readOnly) {
      bar.title = "Rate " + i;
      bar.onmouseenter = () => paint(i, null);
      bar.onclick = () => {
        const wasRated = s.rating > 0;
        if (i === whole() && digit() === 0) s.rating = 0;           // click current score again to clear
        else s.rating = i === 10 ? 10 : i + digit() / 10;           // keep the decimal when changing the whole part
        persistShow(s);
        paint();
        // Let the card decide whether/when to move between sections.
        if (onChange) onChange(wasRated !== s.rating > 0);
      };
    }
    bars.appendChild(bar);
  }
  if (!readOnly) bars.onmouseleave = () => paint();

  for (let k = 0; k <= 9; k++) {
    const bar = document.createElement("div");
    bar.className = "bar";
    if (!readOnly) {
      bar.title = "Decimal ." + k;
      bar.onmouseenter = () => paint(null, k);
      bar.onclick = () => {
        s.rating = whole() + k / 10;
        persistShow(s);
        paint();
      };
    }
    decBars.appendChild(bar);
  }
  if (!readOnly) decBars.onmouseleave = () => paint();

  wrap.appendChild(row1);
  wrap.appendChild(row2);
  paint();
  return wrap;
}

function renderCardTags(container, s, readOnly) {
  container.innerHTML = "";
  s.tags.forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "tag" + (state.activeTagFilter === t ? " filter-on" : "");
    const label = document.createElement("span");
    label.textContent = "#" + t;
    label.onclick = () => { state.activeTagFilter = state.activeTagFilter === t ? null : t; render(); };
    chip.appendChild(label);
    if (!readOnly) {
      const x = document.createElement("span");
      x.className = "x";
      x.textContent = "✕";
      x.onclick = (e) => {
        e.stopPropagation();
        s.tags = s.tags.filter((tag) => tag !== t);
        persistShow(s); render();
      };
      chip.appendChild(x);
    }
    container.appendChild(chip);
  });

  if (readOnly) return;

  const addBtn = document.createElement("span");
  addBtn.className = "tag-add";
  addBtn.textContent = "+ tag";
  addBtn.onclick = () => {
    const input = document.createElement("input");
    input.className = "tag-input";
    input.placeholder = "tag…";
    const commit = () => {
      const val = input.value.trim().toLowerCase().replace(/^#/, "");
      if (val && !s.tags.includes(val)) { s.tags.push(val); persistShow(s); }
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") render();
    };
    input.onblur = commit;
    container.replaceChild(input, addBtn);
    input.focus();
  };
  container.appendChild(addBtn);
}

/* ---------- Drag to reorder (manual ranking) ---------- */
let dragId = null;
function setupDrag(el, s) {
  const handle = el.querySelector(".drag-handle");
  if (!handle) return; // unrated cards have no rank/handle and aren't reorderable
  handle.draggable = true;

  handle.addEventListener("dragstart", (e) => {
    if (state.sortMode !== "manual" || state.activeTagFilter) {
      e.preventDefault();
      toast("Switch sort to “My ranking” and clear filters to reorder");
      return;
    }
    dragId = s.id;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  handle.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    dragId = null;
  });

  el.addEventListener("dragover", (e) => {
    if (!dragId || dragId === s.id) return;
    e.preventDefault();
    el.classList.add("dragover");
  });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragover");
    if (!dragId || dragId === s.id) return;
    const from = state.shows.findIndex((x) => x.id === dragId);
    const to = state.shows.findIndex((x) => x.id === s.id);
    if (from < 0 || to < 0) return;
    const [moved] = state.shows.splice(from, 1);
    state.shows.splice(to, 0, moved);
    // Renumber `order` to match the new array order, and persist the changes.
    state.shows.forEach((sh, idx) => { sh.order = idx; });
    persist(state.shows.map((sh) => db.tx.shows[sh.id].update({ order: sh.order })));
    render();
  });
}
