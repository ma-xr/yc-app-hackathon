// SAMPLE DATA. Fictional messages that stand in for an iMessage inbox until a live inbox connector exists.
// They run through the same ingest and extraction path as live events; only Jesse's notes are kept.
import type { FixtureEvent } from "./types";

export const momUnread: FixtureEvent = {
  sample: true,
  source: "imessage",
  kind: "unread_message",
  minutesAgo: 3 * 24 * 60,
  people: [{ name: "Mom", handle: "+14155550142" }],
  text: "Hi sweetie, I haven't heard from you in a while. Call me when you get a chance, I want to hear how school is going. Love you.",
};

export const imessageInbox: FixtureEvent[] = [
  momUnread,
  {
    sample: true,
    source: "imessage",
    kind: "unread_message",
    minutesAgo: 5 * 60,
    people: [{ name: "Sam Rivera", handle: "+14155550199" }],
    text: "Are we still on for the climbing gym Thursday at 6? I can drive if you want.",
  },
];
