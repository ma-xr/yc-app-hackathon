import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, type ActionCtx } from "../_generated/server";
import { hashToken } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;
const SUPPORTED_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const LATEST = SUPPORTED_VERSIONS[0];
const SERVER_INFO = { name: "jesse", title: "Jesse", version: "1.0.0" };
const INSTRUCTIONS =
  "Jesse remembers the parts of the user's conversations that matter: promises, plans, follow-ups and what people care about. " +
  "Everything here is Jesse's short notes, never quotes: no recordings or transcripts are kept. Notes are live, so edits the user makes in the Jesse app show up here immediately.";
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?claude\.(ai|com)$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

type Scope = "read:memory" | "write:notes";
type Auth = { ownerId: Id<"users">; scopes: Scope[] };
type Args = Record<string, unknown>;

type Tool = {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  readOnly: boolean;
  run: (ctx: ActionCtx, ownerId: Id<"users">, args: Args) => Promise<unknown>;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const TOOLS: Tool[] = [
  {
    name: "search_memory",
    title: "Search Jesse's memory",
    description: "Search Jesse's notes (promises, plans, facts, people, topics, conversation gists) for words in the query. Returns notes, never quotes.",
    scope: "read:memory",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. a name, place or subject." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max results (default 15)." },
      },
      required: ["query"],
    },
    run: async (ctx, ownerId, args) => {
      const query = str(args.query);
      if (!query) throw new ConvexError("query is required");
      const limit = typeof args.limit === "number" ? Math.min(Math.max(Math.floor(args.limit), 1), 50) : 15;
      return await ctx.runQuery(internal.mcp.memory.searchMemory, { ownerId, query: query.slice(0, 200), limit });
    },
  },
  {
    name: "list_open_promises",
    title: "Open promises and plans",
    description: "What the user owes people, what people owe the user, and upcoming plans that are still open, most important first.",
    scope: "read:memory",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: async (ctx, ownerId) => await ctx.runQuery(internal.mcp.memory.openPromises, { ownerId }),
  },
  {
    name: "list_followups",
    title: "Suggested follow-ups",
    description: "People Jesse suggests the user reach out to, why, when, and ready-to-send draft texts.",
    scope: "read:memory",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: async (ctx, ownerId) => await ctx.runQuery(internal.mcp.memory.followups, { ownerId }),
  },
  {
    name: "get_person",
    title: "Get a person",
    description: "What Jesse knows about one person: who they are, facts to remember, open notes and recent conversations.",
    scope: "read:memory",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "The person's name (first name is fine)." } },
      required: ["name"],
    },
    run: async (ctx, ownerId, args) => {
      const name = str(args.name);
      if (!name) throw new ConvexError("name is required");
      return await ctx.runQuery(internal.mcp.memory.person, { ownerId, name: name.slice(0, 100) });
    },
  },
  {
    name: "recent_conversations",
    title: "Recent conversations",
    description: "Conversations from the last N days: when, with whom, where, and Jesse's short gist.",
    scope: "read:memory",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 90, description: "How many days back (default 7)." } },
    },
    run: async (ctx, ownerId, args) => {
      const days = typeof args.days === "number" ? Math.min(Math.max(Math.floor(args.days), 1), 90) : 7;
      return await ctx.runQuery(internal.mcp.memory.recentConversations, { ownerId, days, since: Date.now() - days * DAY });
    },
  },
  {
    name: "get_goals_and_concerns",
    title: "Goals and concerns",
    description: "What the user keeps coming back to (recurring topics, plans, takeaways) and what weighs on them (urgent items, open questions, big promises).",
    scope: "read:memory",
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    run: async (ctx, ownerId) => await ctx.runQuery(internal.mcp.memory.goalsAndConcerns, { ownerId }),
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Save a short note (12 words or fewer) about a person Jesse knows. It is added to that person's notes in the Jesse app, where the user can edit or delete it.",
    scope: "write:notes",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note, 12 words or fewer." },
        person: { type: "string", description: "Name of the person it's about (first name is fine)." },
      },
      required: ["text", "person"],
    },
    run: async (ctx, ownerId, args) =>
      await ctx.runMutation(internal.mcp.memory.addNote, { ownerId, text: str(args.text), person: str(args.person) }),
  },
];

function headers(extra: Record<string, string> = {}) {
  return { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra };
}

function rpcResult(id: unknown, result: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result: { resultType: "complete", ...result, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } } }),
    { status: 200, headers: headers() },
  );
}

function rpcError(id: unknown, code: number, message: string, status = 200, data?: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }), {
    status,
    headers: headers(),
  });
}

function unauthorized(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), {
    status: 401,
    headers: headers({ "WWW-Authenticate": 'Bearer realm="jesse", error="invalid_token"' }),
  });
}

function capabilities() {
  return { tools: { listChanged: false } };
}

async function authenticate(ctx: ActionCtx, req: Request): Promise<Auth | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!match) return null;
  return await ctx.runMutation(internal.mcp.tokens.authenticate, { tokenHash: await hashToken(match[1]) });
}

export const mcpPost = httpAction(async (ctx, req) => {
  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.some((re) => re.test(origin))) return rpcError(null, -32600, "Origin not allowed", 403);

  const auth = await authenticate(ctx, req);
  if (auth === null) return unauthorized("Missing or invalid Jesse token. Mint one in the Jesse app under Connect your Claude.");

  const headerVersion = req.headers.get("MCP-Protocol-Version");
  if (headerVersion && !SUPPORTED_VERSIONS.includes(headerVersion)) {
    return rpcError(null, -32602, "Unsupported protocol version", 400, { supported: SUPPORTED_VERSIONS, requested: headerVersion });
  }

  let message: unknown;
  try {
    message = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return rpcError(null, -32600, "Send one JSON-RPC message per POST", 400);
  }
  const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown };
  if (typeof method !== "string") return rpcError(id, -32600, "Invalid request", 400);
  if (id === undefined) return new Response(null, { status: 202 });

  const p = (typeof params === "object" && params !== null ? params : {}) as Args;
  const tools = TOOLS.filter((t) => auth.scopes.includes(t.scope));

  switch (method) {
    case "initialize": {
      const requested = str(p.protocolVersion);
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST,
        capabilities: capabilities(),
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "server/discover":
      return rpcResult(id, {
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: capabilities(),
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = str(p.name);
      const tool = TOOLS.find((t) => t.name === name);
      if (tool === undefined) return rpcError(id, -32602, `Unknown tool: ${name}`);
      if (!auth.scopes.includes(tool.scope)) return rpcError(id, -32602, `This token lacks the ${tool.scope} scope`);
      const args = (typeof p.arguments === "object" && p.arguments !== null ? p.arguments : {}) as Args;
      try {
        const data = (await tool.run(ctx, auth.ownerId, args)) as Record<string, unknown>;
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (error) {
        const text = error instanceof ConvexError ? String(error.data) : "Jesse couldn't run that tool.";
        console.error("mcp tool failed", tool.name);
        return rpcResult(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
});

export const mcpOther = httpAction(async () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } }),
);
