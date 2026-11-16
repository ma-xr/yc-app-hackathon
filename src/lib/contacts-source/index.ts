import { useMutation } from 'convex/react';
import { useCallback, useMemo, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import { demoSource } from './demo';

export type SyncContact = {
  contactId: string;
  name: string;
  phones: string[];
  emails: string[];
  birthday?: { month: number; day: number; year?: number };
  photoStorageId?: string;
  avatarKey?: string;
};

export type SyncResult = { added: number; updated: number; total: number };

export type ContactsClient = {
  sync: (args: { source: 'apple' | 'demo'; contacts: SyncContact[] }) => Promise<SyncResult>;
  generatePhotoUploadUrl: () => Promise<string>;
  loadDemo: () => Promise<unknown>;
};

export interface ContactsSource {
  id: 'apple' | 'demo';
  label: string;
  sync(client: ContactsClient): Promise<SyncResult & { denied?: boolean }>;
}

export const contactsSource: ContactsSource = demoSource;

const NOT_YET = 'Contact sync needs a contacts.sync mutation on the backend';

export function useContactsSync() {
  const loadDemo = useMutation(api.seed.demo);
  const client = useMemo<ContactsClient>(
    () => ({
      sync: async () => {
        throw new Error(NOT_YET);
      },
      generatePhotoUploadUrl: async () => {
        throw new Error(NOT_YET);
      },
      loadDemo: () => loadDemo({}),
    }),
    [loadDemo],
  );
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      return await contactsSource.sync(client);
    } finally {
      setSyncing(false);
    }
  }, [client]);

  return { sync, syncing, source: contactsSource };
}
