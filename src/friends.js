// Friends: search users, send/accept/decline requests, list friends, and
// view a friend's list read-only. Friendship is a symmetric self-link on
// $users (the accepter links their own record); the shows.view permission
// rule checks both directions.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { db, id, mapRow } from "./db.js";
import { render } from "./render.js";

let unsubFriends = null;
let unsubIncoming = null;
let unsubOutgoing = null;
let unsubViewShows = null;
let searchTimer = null;

/* ---------- Subscriptions ---------- */
export function startFriendsData() {
  if (unsubFriends) return; // already running
  const myId = state.currentUser.id;

  unsubFriends = db.subscribeQuery(
    { $users: { $: { where: { id: myId } }, friends: { profile: {} }, friendOf: { profile: {} } } },
    (resp) => {
      if (resp.error) { toast("Couldn't load friends — " + (resp.error.message || "")); return; }
      const me = (resp.data?.$users || [])[0] || {};
      const byId = new Map();
      (me.friends || []).forEach((u) => byId.set(u.id, { id: u.id, username: nameOf(u), via: "friends" }));
      (me.friendOf || []).forEach((u) => { if (!byId.has(u.id)) byId.set(u.id, { id: u.id, username: nameOf(u), via: "friendOf" }); });
      state.friends = [...byId.values()].sort((a, b) => a.username.localeCompare(b.username));
      // If we're viewing someone who's no longer a friend, bail back to our list.
      if (state.viewingFriend && !state.friends.some((f) => f.id === state.viewingFriend.id)) backToMyList();
      renderPanel();
      updateBadge();
    }
  );

  unsubIncoming = db.subscribeQuery(
    { friendRequests: { $: { where: { toId: myId } } } },
    (resp) => {
      if (resp.error) return;
      state.incomingRequests = (resp.data?.friendRequests || [])
        .map((r) => ({ id: r.id, fromId: r.fromId, fromName: r.fromName || "Someone" }));
      renderPanel();
      updateBadge();
    }
  );

  unsubOutgoing = db.subscribeQuery(
    { friendRequests: { $: { where: { fromId: myId } } } },
    (resp) => {
      if (resp.error) return;
      state.outgoingRequests = (resp.data?.friendRequests || [])
        .map((r) => ({ id: r.id, toId: r.toId, toName: r.toName || "Someone" }));
      renderPanel();
    }
  );
}

export function stopFriendsData() {
  [unsubFriends, unsubIncoming, unsubOutgoing, unsubViewShows].forEach((u) => { if (u) try { u(); } catch (e) {} });
  unsubFriends = unsubIncoming = unsubOutgoing = unsubViewShows = null;
  state.friends = [];
  state.incomingRequests = [];
  state.outgoingRequests = [];
  state.viewingFriend = null;
  state.viewShows = [];
}

function nameOf(u) {
  const p = u.profile;
  const prof = Array.isArray(p) ? p[0] : p;
  return (prof && prof.username) || "(no name)";
}

/* ---------- Friend actions ---------- */
async function sendRequest(user) {
  try {
    await db.transact(db.tx.friendRequests[id()].update({
      fromId: state.currentUser.id,
      toId: user.ownerId,
      fromName: state.username || state.currentUser.email || "Someone",
      toName: user.username || "",
      createdAt: Date.now(),
    }));
    toast("Friend request sent to " + (user.username || "user"));
  } catch (e) { toast("Couldn't send request — " + (e?.message || "try again")); }
}

async function acceptRequest(req) {
  try {
    await db.transact([
      db.tx.$users[state.currentUser.id].link({ friends: req.fromId }),
      db.tx.friendRequests[req.id].delete(),
    ]);
    toast("You're now friends with " + req.fromName);
  } catch (e) { toast("Couldn't accept — " + (e?.message || "try again")); }
}

async function declineRequest(req) {
  try {
    await db.transact(db.tx.friendRequests[req.id].delete());
    toast("Request declined");
  } catch (e) { toast("Couldn't decline — " + (e?.message || "try again")); }
}

async function cancelRequest(req) {
  try {
    await db.transact(db.tx.friendRequests[req.id].delete());
    toast("Request cancelled");
  } catch (e) { toast("Couldn't cancel — " + (e?.message || "try again")); }
}

async function removeFriend(friend) {
  try {
    const me = state.currentUser.id;
    const tx = friend.via === "friendOf"
      ? db.tx.$users[me].unlink({ friendOf: friend.id })
      : db.tx.$users[me].unlink({ friends: friend.id });
    await db.transact(tx);
    if (state.viewingFriend && state.viewingFriend.id === friend.id) backToMyList();
    toast("Removed " + friend.username);
  } catch (e) { toast("Couldn't remove — " + (e?.message || "try again")); }
}

/* ---------- Viewing a friend's list ---------- */
function startViewShowsSub(friendId) {
  if (unsubViewShows) { unsubViewShows(); unsubViewShows = null; }
  unsubViewShows = db.subscribeQuery(
    { shows: { $: { where: { ownerId: friendId } } } },
    (resp) => {
      if (resp.error) { toast("Couldn't load their list — " + (resp.error.message || "")); return; }
      if (!resp.data) return;
      state.viewShows = (resp.data.shows || []).map(mapRow).sort((a, b) => a.order - b.order);
      if (state.viewingFriend && state.viewingFriend.id === friendId) render();
    }
  );
}

function viewFriendList(friend) {
  state.viewingFriend = { id: friend.id, username: friend.username };
  state.viewShows = [];
  resetFilters();
  closePanel();
  $("viewingBanner").style.display = "flex";
  $("viewingName").textContent = friend.username;
  const ab = document.querySelector(".add-bar");
  if (ab) ab.style.display = "none";
  startViewShowsSub(friend.id);
  render();
}

export function backToMyList() {
  if (unsubViewShows) { unsubViewShows(); unsubViewShows = null; }
  state.viewingFriend = null;
  state.viewShows = [];
  resetFilters();
  $("viewingBanner").style.display = "none";
  const ab = document.querySelector(".add-bar");
  if (ab) ab.style.display = "";
  render();
}

function resetFilters() {
  state.activeTagFilter = null;
  state.activeStatusFilter = null;
  state.listFilter = "";
  const lf = $("listFilter");
  if (lf) lf.value = "";
}

/* ---------- Search ---------- */
async function searchUsers(term) {
  const box = $("friendSearchResults");
  const q = term.trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="friend-empty">Searching…</div>';
  // Fetch profiles and match client-side. (We avoid the $ilike operator because
  // it needs a server-side index, which only exists after a CLI schema push.)
  let rows = [];
  try {
    rows = await new Promise((resolve) => {
      let done = false;
      const u = db.subscribeQuery(
        { profiles: {} },
        (r) => { if (done) return; done = true; resolve(r.error ? [] : (r.data?.profiles || [])); try { u(); } catch (e) {} }
      );
      setTimeout(() => { if (!done) { done = true; resolve([]); } }, 5000);
    });
  } catch (e) { rows = []; }
  const matches = rows.filter((p) => (p.username || "").toLowerCase().includes(q)).slice(0, 20);
  renderSearchResults(matches);
}

function renderSearchResults(rows) {
  const box = $("friendSearchResults");
  const myId = state.currentUser.id;
  const friendIds = new Set(state.friends.map((f) => f.id));
  const outIds = new Set(state.outgoingRequests.map((r) => r.toId));
  const inReq = new Map(state.incomingRequests.map((r) => [r.fromId, r]));

  const list = rows.filter((p) => p.ownerId && p.ownerId !== myId);
  if (!list.length) { box.innerHTML = '<div class="friend-empty">No users found.</div>'; return; }

  box.innerHTML = "";
  list.forEach((p) => {
    const user = { ownerId: p.ownerId, username: p.username || "(no name)" };
    let action;
    if (friendIds.has(p.ownerId)) {
      action = tag("Friends ✓");
    } else if (outIds.has(p.ownerId)) {
      action = tag("Requested");
    } else if (inReq.has(p.ownerId)) {
      action = btn("Accept", () => acceptRequest(inReq.get(p.ownerId)));
    } else {
      action = btn("Add", () => sendRequest(user));
    }
    box.appendChild(friendRow(user.username, [action]));
  });
}

/* ---------- Panel rendering ---------- */
function renderPanel() {
  // Incoming requests
  const inc = $("incomingList");
  inc.innerHTML = "";
  $("incomingSection").style.display = state.incomingRequests.length ? "block" : "none";
  state.incomingRequests.forEach((r) => {
    inc.appendChild(friendRow(r.fromName, [
      btn("Accept", () => acceptRequest(r)),
      ghost("Decline", () => declineRequest(r)),
    ]));
  });

  // Outgoing requests
  const out = $("outgoingList");
  out.innerHTML = "";
  $("outgoingSection").style.display = state.outgoingRequests.length ? "block" : "none";
  state.outgoingRequests.forEach((r) => {
    out.appendChild(friendRow(r.toName, [tag("Pending"), ghost("Cancel", () => cancelRequest(r))]));
  });

  // Friends
  const fl = $("friendsList");
  fl.innerHTML = "";
  if (!state.friends.length) {
    fl.innerHTML = '<div class="friend-empty">No friends yet — search above to add some.</div>';
  } else {
    state.friends.forEach((f) => {
      fl.appendChild(friendRow(f.username, [
        btn("View list", () => viewFriendList(f)),
        ghost("Remove", () => removeFriend(f)),
      ]));
    });
  }
}

function updateBadge() {
  const badge = $("friendsBadge");
  const n = state.incomingRequests.length;
  badge.textContent = n ? String(n) : "";
  badge.style.display = n ? "inline-flex" : "none";
}

/* ---------- Small DOM helpers ---------- */
function friendRow(name, actions) {
  const row = document.createElement("div");
  row.className = "friend-row";
  const n = document.createElement("span");
  n.className = "friend-name";
  n.textContent = name;
  const acts = document.createElement("div");
  acts.className = "friend-actions";
  actions.forEach((a) => acts.appendChild(a));
  row.appendChild(n);
  row.appendChild(acts);
  return row;
}
function btn(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
function ghost(label, onClick) {
  const b = btn(label, onClick);
  b.className = "ghost";
  return b;
}
function tag(label) {
  const s = document.createElement("span");
  s.className = "friend-tag";
  s.textContent = label;
  return s;
}

/* ---------- Panel open/close + wiring ---------- */
function openPanel() { renderPanel(); $("friendsPanel").style.display = "flex"; }
function closePanel() { $("friendsPanel").style.display = "none"; }

export function initFriends() {
  $("friendsBtn").addEventListener("click", openPanel);
  $("friendsClose").addEventListener("click", closePanel);
  $("friendsPanel").addEventListener("click", (e) => { if (e.target.id === "friendsPanel") closePanel(); });
  $("viewingBack").addEventListener("click", backToMyList);
  $("friendSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const term = e.target.value;
    searchTimer = setTimeout(() => searchUsers(term), 300);
  });
}
