// InstantDB schema for Tenza (CLI source of truth).
//
// Mirrors the inline schema in src/db.js — the app is buildless and imports
// @instantdb/core from a CDN in the browser, so it can't import this file.
//
// NOTE: scalar fields are intentionally left .optional() / unindexed here to
// match the live backend's current (auto-generated) state, so a schema push
// only creates the friendReqSender link and doesn't migrate existing columns.
// Push with:  npx instant-cli@latest push schema
import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      username: i.string().optional(),
      createdAt: i.number().optional(),
      ownerId: i.string().indexed().optional(),
    }),
    friendRequests: i.entity({
      fromId: i.string().indexed().optional(),
      toId: i.string().indexed().optional(),
      fromName: i.string().optional(),
      toName: i.string().optional(),
      createdAt: i.number().optional(),
    }),
    shows: i.entity({
      malId: i.any().optional(),
      url: i.string().optional(),
      title: i.string().optional(),
      imageUrl: i.string().optional(),
      year: i.any().optional(),
      rating: i.number().optional(),
      tags: i.json().optional(),
      added: i.number().optional(),
      status: i.string().optional(),
      airing: i.boolean().optional(),
      airStatus: i.string().optional(),
      broadcast: i.string().optional(),
      order: i.number().indexed().optional(),
      ownerId: i.string().indexed().optional(),
    }),
  },
  links: {
    showsOwner: {
      forward: { on: "shows", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "shows" },
    },
    profileOwner: {
      forward: { on: "profiles", has: "one", label: "owner" },
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    userFriends: {
      forward: { on: "$users", has: "many", label: "friends" },
      reverse: { on: "$users", has: "many", label: "friendOf" },
    },
    friendReqSender: {
      forward: { on: "friendRequests", has: "one", label: "from" },
      reverse: { on: "$users", has: "many", label: "sentRequests" },
    },
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export default schema;
