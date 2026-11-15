import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

const NOT_LINKED = {
  error: "not_linked",
  howToLink:
    "This number isn't linked to a Jesse account yet. In the Jesse app, tap 'Text Jesse' to get a 6-digit code, then text it here (or call link_account with it).",
};

http.route({
  path: "/keiki/tool",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const secret = env.KEIKI_TOOL_SECRET;
    if (!secret || url.searchParams.get("token") !== secret) return json({ error: "unauthorized" }, 401);
    const tool = url.searchParams.get("tool");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (typeof body !== "object" || body === null) return json({ error: "invalid_body" }, 400);
    const { input, context } = body as { input?: unknown; context?: unknown };
    const args = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const handle = typeof context === "object" && context !== null ? str((context as Record<string, unknown>).phone) : undefined;
    if (!handle) return json({ error: "no_sender", detail: "Keiki did not say who is texting." }, 400);

    if (tool === "link_account") {
      const code = str(args.code);
      if (!code) return json({ error: "missing_code" }, 400);
      const result = await ctx.runMutation(internal.keiki.linkHandle, { code, handle });
      return json(
        result === "linked"
          ? { linked: true, message: "Linked. Jesse can now answer from this person's memory." }
          : { linked: false, error: "That code is wrong or expired. Get a fresh one in the Jesse app." },
      );
    }

    const ownerId = await ctx.runQuery(internal.keiki.ownerForHandle, { handle });
    if (ownerId === null) return json(NOT_LINKED);

    if (tool === "get_memory") {
      return json(await ctx.runQuery(internal.keiki.memory, { ownerId, person: str(args.person) }));
    }
    if (tool === "get_followups") {
      const followups = await ctx.runQuery(internal.followups.suggestedFor, {
        ownerId,
        until: Date.now() + 12 * 60 * 60 * 1000,
      });
      return json({
        followups: followups.map((f) => ({ person: f.personName, why: f.reason, drafts: f.drafts })),
      });
    }
    if (tool === "add_reminder") {
      const text = str(args.text);
      if (!text) return json({ error: "missing_text" }, 400);
      const due = str(args.due);
      const dueAt = due ? Date.parse(due) : undefined;
      return json(
        await ctx.runMutation(internal.keiki.addReminder, {
          ownerId,
          text,
          person: str(args.person),
          dueAt: dueAt !== undefined && !Number.isNaN(dueAt) ? dueAt : undefined,
        }),
      );
    }
    return json({ error: "unknown_tool" }, 404);
  }),
});

export default http;
