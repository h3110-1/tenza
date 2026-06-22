// InstantDB permissions for Tenza.
//
// Deploy with:  npx instant-cli@latest push perms
// (or paste the equivalent JSON into the dashboard's Permissions tab).
//
// A `shows` row belongs to the user it's linked to via `owner`. Only that
// user may read or write it. `auth.id in data.ref('owner.id')` checks the
// linked owner's id against the signed-in user.
import type { InstantRules } from "@instantdb/core";

const rules = {
  shows: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('owner.id')"],
  },
  profiles: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && auth.id in data.ref('owner.id')"],
  },
} satisfies InstantRules;

export default rules;
