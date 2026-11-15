import { ConvexError, v } from "convex/values";
import { env, internalMutation, mutation, query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireUser } from "../lib/auth";
import { mcpScope } from "../schema";

const TOKEN_PREFIX = "jmcp_";
const TOUCH_INTERVAL = 60 * 1000;
const MAX_TOKENS = 10;

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return TOKEN_PREFIX + body;
}

async function activeTokens(ctx: QueryCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("mcpTokens")
    .withIndex("by_ownerId_and_revokedAt", (q) => q.eq("ownerId", ownerId).eq("revokedAt", undefined))
    .order("desc")
    .take(MAX_TOKENS + 1);
}

export const serverUrl = query({
  args: {},
  returns: v.string(),
  handler: async () => `${env.CONVEX_SITE_URL}/mcp`,
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("mcpTokens"),
      label: v.string(),
      scopes: v.array(mcpScope),
      prefix: v.string(),
      createdAt: v.number(),
      lastUsedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return (await activeTokens(ctx, ownerId)).map((t) => ({
        _id: t._id,
        label: t.label,
        scopes: t.scopes,
        prefix: t.prefix,
        createdAt: t._creationTime,
        lastUsedAt: t.lastUsedAt ?? null,
      }));
  },
});

export const create = mutation({
  args: { label: v.string(), scopes: v.array(mcpScope) },
  returns: v.object({ token: v.string(), tokenId: v.id("mcpTokens") }),
  handler: async (ctx, { label, scopes }) => {
    const ownerId = await requireUser(ctx);
    if ((await activeTokens(ctx, ownerId)).length >= MAX_TOKENS) throw new ConvexError("Revoke an old token first");
    const token = newToken();
    const tokenId = await ctx.db.insert("mcpTokens", {
      ownerId,
      label: label.trim().slice(0, 40) || "Claude",
      tokenHash: await hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 4),
      scopes: Array.from(new Set(["read:memory" as const, ...scopes])),
    });
    return { token, tokenId };
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("mcpTokens") },
  returns: v.null(),
  handler: async (ctx, { tokenId }) => {
    const ownerId = await requireUser(ctx);
    const token = await ctx.db.get(tokenId);
    if (token === null || token.ownerId !== ownerId) throw new ConvexError("Not found");
    await ctx.db.patch(tokenId, { revokedAt: Date.now() });
    return null;
  },
});

export const authenticate = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.union(v.null(), v.object({ ownerId: v.id("users"), scopes: v.array(mcpScope) })),
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (token === null || token.revokedAt !== undefined) return null;
    const now = Date.now();
    if ((token.lastUsedAt ?? 0) < now - TOUCH_INTERVAL) await ctx.db.patch(token._id, { lastUsedAt: now });
    return { ownerId: token.ownerId, scopes: token.scopes };
  },
});
