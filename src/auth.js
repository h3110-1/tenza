// Magic-code sign-in, the per-user shows subscription, and one-time
// migration of this device's old localStorage lists into the account.
import { state, $ } from "./state.js";
import { toast } from "./toast.js";
import { db, id, toRow, mapRow, isMuted } from "./db.js";
import { render } from "./render.js";

let unsubShows = null;   // active shows-query unsubscribe fn
let initialized = false; // has the first shows query result loaded?
let pendingEmail = "";

function enterAuth() {
  $("authView").style.display = "flex";
  $("appView").style.display = "none";
  $("whoami").style.display = "none";
  if (unsubShows) { unsubShows(); unsubShows = null; }
  initialized = false;
  state.shows = [];
  showEmailStep();
}

function enterApp() {
  $("authView").style.display = "none";
  $("appView").style.display = "block";
  $("whoami").style.display = "inline-flex";
  $("userEmail").textContent = state.currentUser.email || "you";
  if (!unsubShows) startShowsSubscription();
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
        migrateLegacy(rows);
        return;
      }
      if (isMuted()) return;  // our own write echo — local state is already current
      state.shows = rows;     // external change (another tab / device)
      render();
    }
  );
}

function showEmailStep() {
  $("authCodeStep").style.display = "none";
  $("authEmailStep").style.display = "block";
}
function showCodeStep() {
  $("authEmailStep").style.display = "none";
  $("authCodeStep").style.display = "block";
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
    // subscribeAuth fires and switches us into the app.
  } catch (e) {
    toast("That code didn't work — " + (e?.body?.message || e?.message || "try again"));
  }
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
    if (state.currentUser) enterApp();
    else enterAuth();
  });

  $("authSendCode").addEventListener("click", sendCode);
  $("authEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") sendCode(); });
  $("authVerify").addEventListener("click", verifyCode);
  $("authCode").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyCode(); });
  $("authBack").addEventListener("click", showEmailStep);
  $("signOut").addEventListener("click", () => db.auth.signOut());
}
