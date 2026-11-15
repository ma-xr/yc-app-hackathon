export type EventSource = "calendar" | "imessage" | "email" | "contacts" | "conversation";

export type FixtureEvent = {
  sample: true;
  source: EventSource;
  kind: string;
  minutesAgo: number;
  people: { name: string; handle?: string }[];
  text: string;
};
