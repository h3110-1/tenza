// Shared, mutable app state plus a few small constants/helpers.
// Everything that more than one module needs to read or write lives on the
// `state` object so reassignments are visible across modules.

export const state = {
  currentUser: null,        // signed-in user ({ id, email, ... }) or null
  shows: [],                // the user's list (kept in manual / `order` order)
  sortMode: "manual",
  activeTagFilter: null,
  listFilter: "",           // free-text filter within the current list
  activeStatusFilter: null, // null = all statuses
  unratedCollapsed: false,  // is the Unrated section collapsed?
};

// Watch-status options (order = display order)
export const STATUSES = [
  { key: "watching",  label: "Watching",      color: "#4ea1ff" },
  { key: "completed", label: "Completed",     color: "#3ddc84" },
  { key: "plan",      label: "Plan to watch", color: "#b58cff" },
  { key: "onhold",    label: "On hold",       color: "#ffc83d" },
  { key: "dropped",   label: "Dropped",       color: "#ff6b6b" },
];
export const STATUS_BY_KEY = STATUSES.reduce((m, s) => { m[s.key] = s; return m; }, {});

export const $ = (elId) => document.getElementById(elId);
