import { useCallback, useState } from 'react';

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
};

export interface ContactsSource {
  id: 'apple' | 'demo';
  label: string;
  sync(client: ContactsClient): Promise<SyncResult & { denied?: boolean }>;
}

export const contactsSource: ContactsSource = demoSource;

const localClient: ContactsClient = {
  sync: async ({ contacts }) => ({ added: 0, updated: contacts.length, total: contacts.length }),
  generatePhotoUploadUrl: async () => {
    throw new Error('Photo upload needs the contacts backend');
  },
};

export function useContactsSync(client: ContactsClient = localClient) {
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
