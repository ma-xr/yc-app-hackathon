import { createContext, useContext } from 'react';

import type { Id } from '../../../convex/_generated/dataModel';

export type EvidenceRequest = {
  title: string;
  sub?: string | null;
  conversationIds: Id<'conversations'>[];
  personId?: Id<'people'> | null;
  traitId?: Id<'traits'> | null;
};

export const EvidenceContext = createContext<(req: EvidenceRequest) => void>(() => {});

export function useEvidenceSheet() {
  return useContext(EvidenceContext);
}
