import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

type ContactInput = { contactId: string; name: string; phone?: string };
type ImportResult = { added: number; updated: number };

const MAX_CONTACTS = 500;
const BATCH = 100;

export async function importDeviceContacts(
  importContacts: (args: { contacts: ContactInput[] }) => Promise<ImportResult>,
): Promise<ImportResult & { denied?: boolean }> {
  const permission = await requestPermissionsAsync();
  if (!permission.granted) return { added: 0, updated: 0, denied: true };

  const details = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const, {
    limit: MAX_CONTACTS,
  });
  const contacts: ContactInput[] = [];
  for (const d of details) {
    const name = d.fullName?.trim();
    if (!name) continue;
    const phone = d.phones[0]?.number;
    contacts.push({ contactId: String(d.id), name, ...(phone ? { phone } : {}) });
  }

  const totals = { added: 0, updated: 0 };
  for (let i = 0; i < contacts.length; i += BATCH) {
    const res = await importContacts({ contacts: contacts.slice(i, i + BATCH) });
    totals.added += res.added;
    totals.updated += res.updated;
  }
  return totals;
}
