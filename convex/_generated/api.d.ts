/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as extract from "../extract.js";
import type * as followups from "../followups.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as keiki from "../keiki.js";
import type * as lib_auth from "../lib/auth.js";
import type * as people from "../people.js";
import type * as seed from "../seed.js";
import type * as topics from "../topics.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  conversations: typeof conversations;
  crons: typeof crons;
  extract: typeof extract;
  followups: typeof followups;
  http: typeof http;
  items: typeof items;
  keiki: typeof keiki;
  "lib/auth": typeof lib_auth;
  people: typeof people;
  seed: typeof seed;
  topics: typeof topics;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};
