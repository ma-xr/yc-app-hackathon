import { MOCK_CONTACTS } from '@/components/contacts/data/mock-data';

import type { ContactsSource } from './index';

export const demoSource: ContactsSource = {
  id: 'demo',
  label: 'Demo contacts',
  sync: async (client) =>
    client.sync({
      source: 'demo',
      contacts: MOCK_CONTACTS.map((c) => ({
        contactId: c.id,
        name: c.name,
        phones: c.phones,
        emails: c.emails,
        ...(c.birthday ? { birthday: c.birthday } : {}),
        ...(c.avatarKey ? { avatarKey: c.avatarKey } : {}),
      })),
    }),
};
