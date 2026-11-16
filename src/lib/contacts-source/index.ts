import { useMutation } from 'convex/react';
import { useCallback, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { SyncContact } from '../../../convex/lib/contactSync';

import { demoSource } from './demo';

export type SyncResult = { added: number; updated: number; total: number };

export type ContactsClient = {
  sync: (args: { source: 'apple' | 'demo'; contacts: SyncContact[] }) => Promise<SyncResult>;
  generatePhotoUploadUrl: () => Promise<string>;
  seedDemo: () => Promise<SyncResult>;
};

export interface ContactsSource {
  id: 'apple' | 'demo';
  label: string;
  sync(client: ContactsClient): Promise<SyncResult & { denied?: boolean }>;
}

export const contactsSource: ContactsSource = demoSource;

export function useContactsSync() {
  const syncContacts = useMutation(api.contacts.sync);
  const generatePhotoUploadUrl = useMutation(api.contacts.generatePhotoUploadUrl);
  const seedDemo = useMutation(api.contactsSeed.demo);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      return await contactsSource.sync({
        sync: (args) => syncContacts(args),
        generatePhotoUploadUrl: () => generatePhotoUploadUrl({}),
        seedDemo: () => seedDemo({}),
      });
    } finally {
      setSyncing(false);
    }
  }, [syncContacts, generatePhotoUploadUrl, seedDemo]);

  return { sync, syncing, source: contactsSource };
}
