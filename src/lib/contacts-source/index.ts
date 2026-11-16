import { useMutation } from 'convex/react';
import { useCallback, useMemo, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
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

export function useContactsSync() {
  const loadDemo = useMutation(api.seed.demo);
  const syncContacts = useMutation(api.contacts.sync);
  const generatePhotoUploadUrl = useMutation(api.contacts.generatePhotoUploadUrl);
  const client = useMemo<ContactsClient>(
    () => ({
      sync: ({ source, contacts }) =>
        syncContacts({
          source,
          contacts: contacts.map(({ photoStorageId, ...c }) => ({
            ...c,
            ...(photoStorageId ? { photoStorageId: photoStorageId as Id<'_storage'> } : {}),
          })),
        }),
      generatePhotoUploadUrl: () => generatePhotoUploadUrl({}),
      loadDemo: () => loadDemo({}),
    }),
    [loadDemo, syncContacts, generatePhotoUploadUrl],
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
