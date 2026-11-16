import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const MIN_HISTORY_MINUTES = 3;

export type InteractionInput = Omit<Doc<"interactions">, "_id" | "_creationTime">;
type Shape = Pick<Doc<"interactions">, "startedAt" | "minutes" | "depth" | "fun" | "sharedInterests">;

const round1 = (x: number) => Math.round(x * 10) / 10;

function withWeight(avg: number | undefined, weight: number, value: number, w: number) {
  const total = weight + w;
  return total <= 0 ? 0 : ((avg ?? 0) * weight + value * w) / total;
}

function shift(person: Doc<"people">, row: Shape, sign: 1 | -1) {
  const minutes = person.totalMinutes ?? 0;
  const count = person.encounterCount ?? 0;
  const w = Math.max(1, row.minutes) * sign;
  const nextMinutes = Math.max(0, minutes + row.minutes * sign);
  const nextCount = Math.max(0, count + sign);
  const depth = withWeight(person.depthScore, Math.max(0, minutes), row.depth, w);
  const fun = withWeight(person.funScore, Math.max(0, minutes), row.fun, w);
  const shared = Math.min(5, (row.sharedInterests?.length ?? 0) * 1.25);
  const compat = withWeight(person.compatibilityScore, count, shared, sign);
  const time = Math.min(1, Math.log10(1 + nextMinutes) / Math.log10(1 + 600));
  return {
    totalMinutes: nextMinutes,
    encounterCount: nextCount,
    depthScore: round1(depth),
    funScore: round1(fun),
    compatibilityScore: round1(compat),
    deepTalkScore: round1(depth * (0.5 + 0.5 * time)),
  };
}

export async function applyInteractionStats(
  ctx: MutationCtx,
  personId: Id<"people">,
  previous: Shape | null,
  next: Shape | null,
) {
  let person = await ctx.db.get("people", personId);
  if (person === null) return;
  if (previous) person = { ...person, ...shift(person, previous, -1) };
  if (next) {
    person = {
      ...person,
      ...shift(person, next, 1),
      lastInteractionAt: Math.max(person.lastInteractionAt ?? 0, next.startedAt),
      knownSince: Math.min(person.knownSince ?? next.startedAt, next.startedAt),
    };
  }
  const { _id, _creationTime, ...fields } = person;
  await ctx.db.patch("people", personId, {
    totalMinutes: fields.totalMinutes,
    encounterCount: fields.encounterCount,
    depthScore: fields.depthScore,
    funScore: fields.funScore,
    compatibilityScore: fields.compatibilityScore,
    deepTalkScore: fields.deepTalkScore,
    lastInteractionAt: fields.lastInteractionAt,
    knownSince: fields.knownSince,
  });
}

export async function addInteraction(ctx: MutationCtx, input: InteractionInput) {
  const id = await ctx.db.insert("interactions", input);
  await applyInteractionStats(ctx, input.personId, null, input);
  return id;
}

export async function replaceInteraction(
  ctx: MutationCtx,
  existing: Doc<"interactions">,
  patch: Partial<Omit<InteractionInput, "ownerId" | "personId">>,
) {
  await ctx.db.patch("interactions", existing._id, patch);
  await applyInteractionStats(ctx, existing.personId, existing, { ...existing, ...patch });
}

export async function deleteInteraction(ctx: MutationCtx, existing: Doc<"interactions">) {
  await ctx.db.delete("interactions", existing._id);
  await applyInteractionStats(ctx, existing.personId, existing, null);
}
