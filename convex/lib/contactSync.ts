import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type SyncContact = {
  contactId: string;
  name: string;
  phones: string[];
  emails: string[];
  birthday?: { month: number; day: number; year?: number };
  photoStorageId?: Id<"_storage">;
  avatarKey?: string;
};

const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const lower = (s: string) => s.trim().toLowerCase();
const nameKey = (s: string) => lower(s).replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ");

function phonesOf(p: Doc<"people">) {
  return [...(p.phones ?? []), ...(p.phone ? [p.phone] : [])].map(digits).filter((d) => d.length >= 7);
}

export function findMatch(people: Doc<"people">[], c: SyncContact) {
  const byId = people.find((p) => p.contactId === c.contactId);
  if (byId) return byId;
  const phones = new Set(c.phones.map(digits).filter((d) => d.length >= 7));
  const byPhone = people.find((p) => phonesOf(p).some((d) => phones.has(d)));
  if (byPhone) return byPhone;
  const emails = new Set(c.emails.map(lower));
  const byEmail = people.find((p) => (p.emails ?? []).some((e) => emails.has(lower(e))));
  if (byEmail) return byEmail;
  return people.find((p) => !p.contactId && nameKey(p.name) === nameKey(c.name));
}

export async function upsertContacts(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  source: "apple" | "demo",
  contacts: SyncContact[],
) {
  const now = Date.now();
  const people = await ctx.db
    .query("people")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .take(2000);
  let added = 0;
  let updated = 0;
  const ids: Id<"people">[] = [];
  for (const c of contacts) {
    const name = c.name.trim();
    if (!name) continue;
    const fields = {
      contactId: c.contactId,
      source,
      phones: c.phones,
      phone: c.phones[0],
      emails: c.emails,
      lastSyncedAt: now,
      ...(c.birthday ? { birthday: c.birthday } : {}),
      ...(c.photoStorageId ? { photoStorageId: c.photoStorageId } : {}),
      ...(c.avatarKey ? { avatarKey: c.avatarKey } : {}),
    };
    const match = findMatch(people, c);
    if (match) {
      await ctx.db.patch("people", match._id, fields);
      Object.assign(match, fields);
      ids.push(match._id);
      updated += 1;
      continue;
    }
    const id = await ctx.db.insert("people", {
      ownerId,
      name,
      facts: [],
      lastSeenAt: 0,
      conversationCount: 0,
      ...fields,
    });
    people.push((await ctx.db.get("people", id))!);
    ids.push(id);
    added += 1;
  }
  return { added, updated, total: people.filter((p) => p.lastSyncedAt !== undefined).length, ids };
}
