// InstantDB permissions for Tenza.
//
// Deploy with:  npx instant-cli@latest push perms
// (or paste the equivalent JSON into the dashboard's Permissions tab).
//
// Model: a `shows`/`profiles` row belongs to the user whose id is stored in
// `ownerId`. Friendship is a symmetric self-link on $users (`friends` /
// reverse `friendOf`); a user can view a friend's shows but never write them.
import type { InstantRules } from "@instantdb/core";

const rules = {
  // System users. Readable by any signed-in user (needed for friend search /
  // linking), but the email field stays private to its owner. Users may update
  // their own record (to manage their `friends` link); no create/delete.
  $users: {
    allow: {
      view: "auth.id != null",
      create: "false",
      update: "auth.id != null && auth.id == data.id",
      delete: "false",
    },
    fields: {
      email: "auth.id != null && auth.id == data.id",
    },
  },

  // Display names. Publicly viewable so people can be found by username.
  profiles: {
    allow: {
      view: "auth.id != null",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('owner.id')"],
  },

  // Friend requests are visible to / deletable by the two parties; only the
  // sender can create one, and they're never edited (accept = delete + link).
  friendRequests: {
    allow: {
      view: "auth.id != null && (auth.id == data.fromId || auth.id == data.toId)",
      create: "auth.id != null && auth.id == data.fromId",
      update: "false",
      delete: "auth.id != null && (auth.id == data.fromId || auth.id == data.toId)",
    },
  },

  // A show is viewable by its owner or by a friend (either link direction);
  // only the owner can create/update/delete it.
  shows: {
    allow: {
      view: "isOwner || isFriend",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: [
      "isOwner", "auth.id != null && auth.id == data.ownerId",
      "isFriend", "auth.id != null && (data.ownerId in auth.ref('$user.friends.id') || data.ownerId in auth.ref('$user.friendOf.id'))",
    ],
  },
} satisfies InstantRules;

export default rules;
