import type { EventSource } from "./fixtures/types";
import { calendar } from "./fixtures/calendar";
import { email } from "./fixtures/email";
import { imessageInbox } from "./fixtures/imessageInbox";

export type ConnectionMode = "live" | "sample" | "off";

export const CONNECTIONS: {
  key: string;
  source: EventSource;
  label: string;
  mode: ConnectionMode;
  detail: string;
  place: string;
}[] = [
  { key: "imessage_jesse", source: "imessage", label: "iMessage with Jesse", mode: "live", detail: "Text Jesse on its own line", place: "iMessage" },
  { key: "calendar_write", source: "calendar", label: "Calendar: add plans", mode: "live", detail: "Adds your plans to the calendar on this phone", place: "Calendar" },
  { key: "contacts", source: "contacts", label: "Contacts", mode: "live", detail: "Names and phone numbers only, imported on this phone", place: "Contacts" },
  { key: "imessage_inbox", source: "imessage", label: "iMessage inbox", mode: "sample", detail: "Sample data: unread messages Jesse would notice", place: "iMessage" },
  { key: "email", source: "email", label: "Email", mode: "sample", detail: "Sample data: emails that ask something of you", place: "Email" },
  { key: "calendar_read", source: "calendar", label: "Calendar: read events", mode: "sample", detail: "Sample data: upcoming events on your calendar", place: "Calendar" },
];

export const SAMPLE_FIXTURES: Record<string, typeof email> = {
  imessage_inbox: imessageInbox,
  email,
  calendar_read: calendar,
};

export function placeFor(connectionKey: string, source: EventSource) {
  return CONNECTIONS.find((c) => c.key === connectionKey)?.place ?? (source === "conversation" ? undefined : source);
}
