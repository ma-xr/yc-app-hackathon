import { useMutation } from 'convex/react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export function cadenceLabel(days?: number) {
  if (!days) return null;
  if (days <= 1) return 'daily';
  if (days <= 4) return 'every few days';
  if (days <= 8) return 'weekly';
  if (days <= 16) return `every ~${Math.round(days / 7)} weeks`;
  if (days <= 35) return 'monthly';
  return `every ~${Math.round(days / 30)} months`;
}

export function archetypeLine(person: { archetype?: string; cadenceDays?: number }) {
  const cadence = cadenceLabel(person.cadenceDays);
  const base = person.archetype ?? 'Someone you talk to';
  return cadence && !/weekly|monthly|every|daily/.test(base) ? `${base} · ${cadence}` : base;
}

export function isDrifting(person: { lastSeenAt: number; cadenceDays?: number }, now: number) {
  if (!person.cadenceDays) return false;
  return now - person.lastSeenAt > person.cadenceDays * 1.5 * 86_400_000;
}

export function useFollowupActions() {
  const markSent = useMutation(api.followups.markSent);
  const dismiss = useMutation(api.followups.dismiss);
  return {
    markSent: (id: Id<'followups'>, text: string) => markSent({ id, text }),
    dismiss: (id: Id<'followups'>) => dismiss({ id }),
  };
}
