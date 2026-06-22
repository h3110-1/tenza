// InstantDB setup + persistence helpers.
import { init, i, id } from "https://esm.sh/@instantdb/core";
import { state } from "./state.js";
import { toast } from "./toast.js";

const APP_ID = "c9a03b71-fd1a-4bd7-9fb5-f3bb43f8c155";

const schema = i.schema({
  entities: {
    // The system users entity — declared so the `owner` link (and `owner.id`
    // query filters) can resolve. Instant manages its fields.
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    shows: i.entity({
      malId: i.any(),
      url: i.string(),
      title: i.string(),
      imageUrl: i.string(),
      year: i.any(),
      rating: i.number(),
      tags: i.json(),
      added: i.number(),
      status: i.string(),
      airing: i.boolean(),
      airStatus: i.string(),
      broadcast: i.string(),
      order: i.number().indexed(),
    }),
  },
  links: {
    showsOwner: {
      forward: { on: "shows", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "shows" },
    },
  },
});

export const db = init({ appId: APP_ID, schema });
export { id };

// Briefly ignore the query echo of our own writes, so live local edits
// (e.g. dialling in a rating decimal) aren't yanked out from under the user.
let muteSync = false;
let muteTimer = null;
export function isMuted() { return muteSync; }

export function persist(chunks) {
  muteSync = true;
  clearTimeout(muteTimer);
  muteTimer = setTimeout(() => { muteSync = false; }, 800);
  return db.transact(chunks).catch((e) =>
    toast("Couldn't save — " + (e?.message || "try again"))
  );
}

// Map a local show object → the row fields stored in InstantDB.
export function toRow(s) {
  return {
    malId: s.malId ?? null,
    url: s.url || "",
    title: s.title || "Untitled",
    imageUrl: s.imageUrl || "",
    year: s.year ?? "",
    rating: s.rating || 0,
    tags: Array.isArray(s.tags) ? s.tags : [],
    added: s.added || Date.now(),
    status: s.status || "",
    airing: !!s.airing,
    airStatus: s.airStatus || "",
    broadcast: s.broadcast || "",
    order: typeof s.order === "number" ? s.order : 0,
  };
}

// Map a stored row → the in-memory shape the UI uses.
export function mapRow(r) {
  return {
    id: r.id,
    malId: r.malId ?? null,
    url: r.url || "",
    title: r.title || "Untitled",
    imageUrl: r.imageUrl || "",
    year: r.year ?? "",
    rating: r.rating || 0,
    tags: Array.isArray(r.tags) ? r.tags : [],
    added: r.added || 0,
    status: r.status || "",
    airing: !!r.airing,
    airStatus: r.airStatus || "",
    broadcast: r.broadcast || "",
    order: typeof r.order === "number" ? r.order : 0,
  };
}

export function persistShow(s) {
  return persist(db.tx.shows[s.id].update(toRow(s)).link({ owner: state.currentUser.id }));
}

export function nextOrder() {
  return state.shows.length ? Math.max(...state.shows.map((s) => s.order || 0)) + 1 : 0;
}
