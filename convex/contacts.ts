import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { moment } from "./insights";
import { requireOwned, requireUser } from "./lib/auth";

const MAX_CONTACTS = 200;
const MAX_CONVERSATIONS = 100;
const MAX_SYNC = 2000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const syncContact = v.object({
  contactId: v.string(),
  name: v.string(),
  phones: v.array(v.string()),
  emails: v.array(v.string()),
  birthday: v.optional(v.object({ month: v.number(), day: v.number(), year: v.optional(v.number()) })),
  photoStorageId: v.optional(v.id("_storage")),
  avatarKey: v.optional(v.string()),
});

const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const lower = (s: string) => s.trim().toLowerCase();
const nameKey = (s: string) => lower(s).replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ");

export function findContactMatch(people: Doc<"people">[], c: typeof syncContact.type) {
  const byId = people.find((p) => p.contactId === c.contactId);
  if (byId) return byId;
  const phones = new Set(c.phones.map(digits).filter((d) => d.length >= 7));
  const byPhone = people.find((p) =>
    [...(p.phones ?? []), ...(p.phone ? [p.phone] : [])].map(digits).some((d) => d.length >= 7 && phones.has(d)),
  );
  if (byPhone) return byPhone;
  const emails = new Set(c.emails.map(lower));
  const byEmail = people.find((p) => (p.emails ?? []).some((e) => emails.has(lower(e))));
  if (byEmail) return byEmail;
  return people.find((p) => !p.contactId && nameKey(p.name) === nameKey(c.name));
}

export const contactSort = v.union(
  v.literal("recent"),
  v.literal("time"),
  v.literal("deepest"),
  v.literal("fun"),
  v.literal("compatibility"),
  v.literal("deepTalk"),
);

async function photoUrl(ctx: QueryCtx, p: Doc<"people">) {
  return p.photoStorageId ? await ctx.storage.getUrl(p.photoStorageId) : null;
}

function row(p: Doc<"people">) {
  return {
    _id: p._id,
    name: p.name,
    avatarKey: p.avatarKey ?? null,
    relationship: p.relationship ?? null,
    roleLabel: p.roleLabel ?? null,
    relationshipSummary: p.relationshipSummary ?? p.archetype ?? null,
    lastInteractionAt: p.lastInteractionAt ?? p.lastSeenAt,
    totalMinutes: p.totalMinutes ?? 0,
    encounterCount: p.encounterCount ?? p.conversationCount,
    distinctTopicCount: p.distinctTopicCount ?? 0,
    funScore: p.funScore ?? null,
    compatibilityScore: p.compatibilityScore ?? null,
    deepTalkScore: p.deepTalkScore ?? null,
  };
}

export const list = query({
  args: { sort: v.optional(contactSort) },
  handler: async (ctx, { sort = "recent" }) => {
    const ownerId = await requireUser(ctx);
    const people = ctx.db.query("people");
    const ordered =
      sort === "time"
        ? people.withIndex("by_ownerId_and_totalMinutes", (q) => q.eq("ownerId", ownerId))
        : sort === "deepest"
          ? people.withIndex("by_ownerId_and_distinctTopicCount", (q) => q.eq("ownerId", ownerId))
          : sort === "fun"
            ? people.withIndex("by_ownerId_and_funScore", (q) => q.eq("ownerId", ownerId))
            : sort === "compatibility"
              ? people.withIndex("by_ownerId_and_compatibilityScore", (q) => q.eq("ownerId", ownerId))
              : sort === "deepTalk"
                ? people.withIndex("by_ownerId_and_deepTalkScore", (q) => q.eq("ownerId", ownerId))
                : people.withIndex("by_ownerId_and_lastInteractionAt", (q) => q.eq("ownerId", ownerId));
    const rows = await ordered.order("desc").take(MAX_CONTACTS);
    return await Promise.all(rows.map(async (p) => ({ ...row(p), photoUrl: await photoUrl(ctx, p) })));
  },
});

export const get = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const ownerId = await requireUser(ctx);
    const person = await requireOwned(ctx, "people", personId, ownerId);
    const recent = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(500);
    const theirs = recent.filter((c) => c.participantIds.includes(personId)).slice(0, MAX_CONVERSATIONS);
    return {
      person: { ...person, ...row(person), photoUrl: await photoUrl(ctx, person) },
      conversations: await Promise.all(theirs.map((c) => moment(ctx, c))),
    };
  },
});

export const sync = mutation({
  args: { source: v.union(v.literal("apple"), v.literal("demo")), contacts: v.array(syncContact) },
  handler: async (ctx, { source, contacts }) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const people = await ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(MAX_SYNC);
    let added = 0;
    let updated = 0;
    for (const c of contacts.slice(0, MAX_SYNC)) {
      const name = c.name.trim();
      if (!name) continue;
      const match = findContactMatch(people, c);
      const birthday =
        c.birthday && !match?.birthday && c.birthday.month >= 1 && c.birthday.month <= 12
          ? { birthday: { text: `${MONTHS[c.birthday.month - 1]} ${c.birthday.day}`, conversationIds: [] as Id<"conversations">[] } }
          : {};
      const fields = {
        contactId: c.contactId,
        contactSource: source,
        phones: c.phones,
        phone: match?.phone ?? c.phones[0],
        emails: c.emails,
        lastSyncedAt: now,
        ...birthday,
        ...(c.photoStorageId ? { photoStorageId: c.photoStorageId } : {}),
        ...(c.avatarKey ? { avatarKey: c.avatarKey } : {}),
      };
      if (match) {
        await ctx.db.patch("people", match._id, fields);
        Object.assign(match, fields);
        updated++;
        continue;
      }
      const id = await ctx.db.insert("people", { ownerId, name, facts: [], lastSeenAt: 0, conversationCount: 0, ...fields });
      people.push((await ctx.db.get("people", id))!);
      added++;
    }
    return { added, updated, total: people.filter((p) => p.lastSyncedAt !== undefined).length };
  },
});

export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
