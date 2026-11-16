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
import type * as capture from "../capture.js";
import type * as connections from "../connections.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as extract from "../extract.js";
import type * as followups from "../followups.js";
import type * as http from "../http.js";
import type * as integrations_catalog from "../integrations/catalog.js";
import type * as integrations_fixtures_calendar from "../integrations/fixtures/calendar.js";
import type * as integrations_fixtures_email from "../integrations/fixtures/email.js";
import type * as integrations_fixtures_imessageInbox from "../integrations/fixtures/imessageInbox.js";
import type * as integrations_fixtures_scenarios from "../integrations/fixtures/scenarios.js";
import type * as integrations_fixtures_types from "../integrations/fixtures/types.js";
import type * as integrations_ingest from "../integrations/ingest.js";
import type * as items from "../items.js";
import type * as jesse from "../jesse.js";
import type * as keiki from "../keiki.js";
import type * as lib_auth from "../lib/auth.js";
import type * as mcp_memory from "../mcp/memory.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_tokens from "../mcp/tokens.js";
import type * as people from "../people.js";
import type * as reflections from "../reflections.js";
import type * as scenarios from "../scenarios.js";
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
  capture: typeof capture;
  connections: typeof connections;
  conversations: typeof conversations;
  crons: typeof crons;
  extract: typeof extract;
  followups: typeof followups;
  http: typeof http;
  "integrations/catalog": typeof integrations_catalog;
  "integrations/fixtures/calendar": typeof integrations_fixtures_calendar;
  "integrations/fixtures/email": typeof integrations_fixtures_email;
  "integrations/fixtures/imessageInbox": typeof integrations_fixtures_imessageInbox;
  "integrations/fixtures/scenarios": typeof integrations_fixtures_scenarios;
  "integrations/fixtures/types": typeof integrations_fixtures_types;
  "integrations/ingest": typeof integrations_ingest;
  items: typeof items;
  jesse: typeof jesse;
  keiki: typeof keiki;
  "lib/auth": typeof lib_auth;
  "mcp/memory": typeof mcp_memory;
  "mcp/server": typeof mcp_server;
  "mcp/tokens": typeof mcp_tokens;
  people: typeof people;
  reflections: typeof reflections;
  scenarios: typeof scenarios;
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
