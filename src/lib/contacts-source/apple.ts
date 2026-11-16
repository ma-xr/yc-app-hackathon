import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import type { ContactsClient, ContactsSource, SyncContact } from './index';

const MAX_CONTACTS = 2000;
const BATCH = 100;

const FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
  ContactField.EMAILS,
  ContactField.BIRTHDAY,
  ContactField.THUMBNAIL,
] as const;

async function uploadPhoto(client: ContactsClient, uri: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(uri)).blob();
    const url = await client.generatePhotoUploadUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) return undefined;
    const { storageId } = (await res.json()) as { storageId: string };
    return storageId;
  } catch {
    return undefined;
  }
}

export const appleSource: ContactsSource = {
  id: 'apple',
  label: 'Apple Contacts',
  async sync(client) {
    const permission = await requestPermissionsAsync();
    if (!permission.granted) return { added: 0, updated: 0, total: 0, denied: true };

    const details = await Contact.getAllDetails(FIELDS, { limit: MAX_CONTACTS });
    const contacts: SyncContact[] = [];
    for (const d of details) {
      const name = d.fullName?.trim();
      if (!name) continue;
      const phones = (d.phones ?? []).map((p) => p.number).filter((n): n is string => !!n);
      const emails = (d.emails ?? []).map((e) => e.address).filter((a): a is string => !!a);
      const birthday = d.birthday?.month && d.birthday.day ? d.birthday : undefined;
      const photoStorageId = d.thumbnail ? await uploadPhoto(client, d.thumbnail) : undefined;
      contacts.push({
        contactId: String(d.id),
        name,
        phones,
        emails,
        ...(birthday
          ? { birthday: { month: birthday.month, day: birthday.day, ...(birthday.year ? { year: birthday.year } : {}) } }
          : {}),
        ...(photoStorageId ? { photoStorageId } : {}),
      });
    }

    const totals = { added: 0, updated: 0, total: 0 };
    for (let i = 0; i < contacts.length; i += BATCH) {
      const res = await client.sync({ source: 'apple', contacts: contacts.slice(i, i + BATCH) });
      totals.added += res.added;
      totals.updated += res.updated;
      totals.total = res.total;
    }
    return totals;
  },
};
