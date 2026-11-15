// SAMPLE DATA. Fictional emails that stand in for an email inbox until a live email connector exists.
// They run through the same ingest and extraction path as live events; only Jesse's notes are kept.
import type { FixtureEvent } from "./types";

export const email: FixtureEvent[] = [
  {
    sample: true,
    source: "email",
    kind: "email_received",
    minutesAgo: 26 * 60,
    people: [{ name: "Dana Lee", handle: "dana@example.com" }],
    text: "Subject: Next steps\n\nThanks for chatting last week. We'd love to have you in for a final round with the design team on Wednesday at 2pm. Could you send me two times that work as a backup by Monday?",
  },
  {
    sample: true,
    source: "email",
    kind: "email_received",
    minutesAgo: 8 * 60,
    people: [{ name: "Professor Okafor", handle: "okafor@example.edu" }],
    text: "Subject: Thesis draft\n\nI read your outline. The argument in section two is strong; the methods section needs more detail. Let's meet Friday at 10 to go through it.",
  },
];
