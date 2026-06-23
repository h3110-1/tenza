// Magic-code sign-in, the per-user shows + profile subscriptions, the
// "choose a username" step, and one-time migration of this device's old
// localStorage lists into the account.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { db, id, toRow, mapRow, isMuted } from "./db.js";
import { render } from "./render.js";
import { startFriendsData, stopFriendsData } from "./friends.js";

let unsubShows = null;     // active shows-query unsubscribe fn
let unsubProfile = null;   // active profile-query unsubscribe fn
let initialized = false;   // has the first shows query result loaded?
let profileResolved = false; // has the first profile result decided the screen?
let currentProfileId = null; // id of the user's profile row (null = none yet)
let editingUsername = false; // is the username step open to edit (vs first set)?
let pendingEmail = "";

function resetSession() {
  if (unsubShows) { unsubShows(); unsubShows = null; }
  if (unsubProfile) { unsubProfile(); unsubProfile = null; }
  stopFriendsData();
  initialized = false;
  profileResolved = false;
  currentProfileId = null;
  editingUsername = false;
  state.shows = [];
  state.username = "";
}

function updateWhoami() {
  $("userEmail").textContent = state.username || state.currentUser?.email || "you";
}

function enterAuth() {
  $("authView").style.display = "flex";
  $("appView").style.display = "none";
  $("friendsBtn").style.display = "none";
  $("friendsMenu").style.display = "none";
  $("userPanel").style.display = "none";
  resetSession();
  showEmailStep();
}

function showApp() {
  $("authView").style.display = "none";
  $("appView").style.display = "block";
  $("friendsBtn").style.display = "flex";
  $("userPanel").style.display = "flex";
  updateWhoami();
}

function startShowsSubscription() {
  unsubShows = db.subscribeQuery(
    { shows: { $: { where: { "owner.id": state.currentUser.id } } } },
    (resp) => {
      if (resp.error) { toast("Couldn't load your list — " + (resp.error.message || "")); return; }
      if (!resp.data) return;
      const rows = (resp.data.shows || []).map(mapRow).sort((a, b) => a.order - b.order);
      if (!initialized) {
        initialized = true;
        state.shows = rows;
        render();
        backfillOwnerId(rows);
        migrateLegacy(rows);
        return;
      }
      if (isMuted()) return;  // our own write echo — local state is already current
      state.shows = rows;     // external change (another tab / device)
      render();
    }
  );
}

function startProfileSubscription() {
  unsubProfile = db.subscribeQuery(
    { profiles: { $: { where: { "owner.id": state.currentUser.id } } } },
    (resp) => {
      if (resp.error) { toast("Couldn't load your profile — " + (resp.error.message || "")); return; }
      if (!resp.data) return;
      const profile = (resp.data.profiles || [])[0] || null;
      currentProfileId = profile ? profile.id : null;
      state.username = profile ? (profile.username || "") : "";
      // Backfill ownerId on a profile created before that field existed,
      // so username search (which keys off ownerId) can find this user.
      if (profile && !profile.ownerId) {
        db.transact(db.tx.profiles[profile.id].update({ ownerId: state.currentUser.id })).catch(() => {});
      }

      if (!profileResolved) {
        profileResolved = true;
        // Brand-new account with no username yet → invite them to pick one.
        if (state.username) showApp();
        else showUsernameStep();
      } else if ($("appView").style.display !== "none") {
        updateWhoami(); // live update (e.g. changed in another tab)
      }
    }
  );
}

/* ---------- Auth screen steps ---------- */
function showEmailStep() {
  $("authUsernameStep").style.display = "none";
  $("authCodeStep").style.display = "none";
  $("authEmailStep").style.display = "block";
}
function showCodeStep() {
  $("authUsernameStep").style.display = "none";
  $("authEmailStep").style.display = "none";
  $("authCodeStep").style.display = "block";
}
function showUsernameStep() {
  $("authView").style.display = "flex";
  $("appView").style.display = "none";
  $("friendsBtn").style.display = "none";
  $("friendsMenu").style.display = "none";
  $("userPanel").style.display = "none";
  $("authEmailStep").style.display = "none";
  $("authCodeStep").style.display = "none";
  $("authUsernameStep").style.display = "block";
  $("authUsernameHeading").textContent = editingUsername ? "Change your username" : "Choose a username";
  $("authUsernameSkip").textContent = editingUsername ? "Cancel" : "Skip for now";
  const input = $("authUsername");
  // Suggest the email's local part for a first-time pick; the current name when editing.
  input.value = state.username || (state.currentUser?.email || "").split("@")[0] || "";
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

async function sendCode() {
  const email = $("authEmail").value.trim();
  if (!email) { toast("Enter your email first"); return; }
  try {
    await db.auth.sendMagicCode({ email });
    pendingEmail = email;
    $("authEmailLabel").textContent = email;
    $("authCode").value = "";
    showCodeStep();
    setTimeout(() => $("authCode").focus(), 0);
  } catch (e) {
    toast("Couldn't send code — " + (e?.body?.message || e?.message || "try again"));
  }
}

async function verifyCode() {
  const code = $("authCode").value.trim();
  if (!code) { toast("Enter the code from your email"); return; }
  try {
    await db.auth.signInWithMagicCode({ email: pendingEmail, code });
    // subscribeAuth fires; the profile subscription then decides whether to
    // show the app or the "choose a username" step.
  } catch (e) {
    toast("That code didn't work — " + (e?.body?.message || e?.message || "try again"));
  }
}

async function saveUsername() {
  const name = $("authUsername").value.trim();
  if (!name) { toast("Pick a username (or skip for now)"); return; }
  try {
    const pid = currentProfileId || id();
    const fields = currentProfileId
      ? { username: name }
      : { username: name, createdAt: Date.now(), ownerId: state.currentUser.id };
    await db.transact(db.tx.profiles[pid].update(fields).link({ owner: state.currentUser.id }));
    state.username = name;
    currentProfileId = pid;
    editingUsername = false;
    showApp();
  } catch (e) {
    toast("Couldn't save your username — " + (e?.message || "try again"));
  }
}

// Backfill the scalar ownerId on any of the user's own shows that predate it,
// so the friends-view permission rule (which keys off ownerId) covers them.
function backfillOwnerId(rows) {
  const missing = rows.filter((s) => !s.ownerId);
  if (!missing.length) return;
  missing.forEach((s) => { s.ownerId = state.currentUser.id; });
  db.transact(missing.map((s) => db.tx.shows[s.id].update({ ownerId: state.currentUser.id }))).catch(() => {});
}

// One-time migration of this device's pre-account lists.
function migrateLegacy(existing) {
  let flagKey;
  try {
    flagKey = "animeTracker.migrated." + state.currentUser.id;
    if (localStorage.getItem(flagKey)) return;
  } catch (e) { return; } // storage blocked — nothing to migrate

  const legacy = [];
  try {
    // Current single-list store.
    const list = JSON.parse(localStorage.getItem("animeTracker.list") || "null");
    if (Array.isArray(list)) legacy.push(...list);
    // Previous multi-profile format.
    const meta = JSON.parse(localStorage.getItem("animeTracker.profiles") || "null");
    const ids = (meta && Array.isArray(meta.profiles)) ? meta.profiles.map((p) => p.id) : [];
    ids.forEach((pid) => {
      const arr = JSON.parse(localStorage.getItem("animeTracker.shows." + pid) || "[]");
      if (Array.isArray(arr)) legacy.push(...arr);
    });
    // Original pre-profiles format.
    const single = JSON.parse(localStorage.getItem("animeTracker.v1") || "null");
    if (Array.isArray(single)) legacy.push(...single);
  } catch (e) { /* ignore malformed legacy data */ }

  // Skip anything already in the account; dedupe within the legacy data too.
  const seen = new Set(existing.map((s) => s.malId || s.title));
  const toAdd = [];
  legacy.forEach((s) => {
    const key = s.malId || s.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    toAdd.push(s);
  });

  if (toAdd.length) {
    const base = existing.length;
    const chunks = toAdd.map((s, idx) =>
      db.tx.shows[id()].update(toRow({ ...s, order: base + idx })).link({ owner: state.currentUser.id })
    );
    db.transact(chunks)
      .then(() => toast("Imported " + toAdd.length + " show" + (toAdd.length === 1 ? "" : "s") + " from this device"))
      .catch(() => {});
  }
  try { localStorage.setItem(flagKey, "1"); } catch (e) {}
}

// Subscribe to auth state and wire the sign-in form. Call once on boot.
export function initAuth() {
  db.subscribeAuth((res) => {
    if (res.error) { toast("Auth error — " + (res.error.message || "try again")); return; }
    state.currentUser = res.user || null;
    if (state.currentUser) {
      if (!unsubShows) startShowsSubscription();
      if (!unsubProfile) startProfileSubscription();
      startFriendsData();
    } else {
      enterAuth();
    }
  });

  $("authSendCode").addEventListener("click", sendCode);
  $("authEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") sendCode(); });
  $("authVerify").addEventListener("click", verifyCode);
  $("authCode").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyCode(); });
  $("authBack").addEventListener("click", showEmailStep);

  $("authUsernameSave").addEventListener("click", saveUsername);
  $("authUsername").addEventListener("keydown", (e) => { if (e.key === "Enter") saveUsername(); });
  // "Skip for now" (first run) or "Cancel" (editing) → just show the app.
  $("authUsernameSkip").addEventListener("click", () => { editingUsername = false; showApp(); });

  // Click the displayed name to change it.
  $("userEmail").addEventListener("click", () => { editingUsername = true; showUsernameStep(); });

  $("signOut").addEventListener("click", () => db.auth.signOut());
}
