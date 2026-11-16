import type { FunctionReturnType } from 'convex/server';

import type { api } from '../../../../convex/_generated/api';
import type { Doc } from '../../../../convex/_generated/dataModel';

export type ContactProfile = FunctionReturnType<typeof api.contacts.get>;
export type ContactFact = ContactProfile['facts'][number];
export type Interaction = Doc<'interactions'>;
