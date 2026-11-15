import * as Calendar from 'expo-calendar';
import * as Linking from 'expo-linking';
import * as SMS from 'expo-sms';
import { Platform } from 'react-native';

const HOUR_MS = 60 * 60 * 1000;

export async function openComposer(opts: {
  phone?: string;
  body: string;
}): Promise<'sent' | 'cancelled' | 'unknown' | 'unavailable'> {
  if (!(await SMS.isAvailableAsync())) return 'unavailable';
  const { result } = await SMS.sendSMSAsync(opts.phone ? [opts.phone] : [], opts.body);
  return result;
}

export async function addToCalendar(opts: {
  title: string;
  startAt: number;
  endAt?: number;
  notes?: string;
  location?: string;
}): Promise<string | undefined> {
  try {
    const { granted } = await Calendar.requestCalendarPermissions();
    if (!granted) return undefined;

    const calendar =
      Platform.OS === 'ios'
        ? Calendar.getDefaultCalendarSync()
        : (await Calendar.getCalendars()).find((c) => c.allowsModifications && c.isPrimary) ??
          (await Calendar.getCalendars()).find((c) => c.allowsModifications);
    if (!calendar) return undefined;

    const event = await calendar.createEvent({
      title: opts.title,
      startDate: new Date(opts.startAt),
      endDate: new Date(opts.endAt ?? opts.startAt + HOUR_MS),
      notes: opts.notes,
      location: opts.location,
    });
    return event.id;
  } catch {
    return undefined;
  }
}

export async function callPerson(opts: { phone?: string }): Promise<boolean> {
  if (!opts.phone) return false;
  const url = `tel:${opts.phone.replace(/[^\d+]/g, '')}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
