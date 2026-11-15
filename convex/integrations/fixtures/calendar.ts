// SAMPLE DATA. Fictional calendar events that stand in for reading the phone's calendar until live calendar read exists.
// They run through the same ingest and extraction path as live events; only Jesse's notes are kept.
import type { FixtureEvent } from "./types";

export const calendar: FixtureEvent[] = [
  {
    sample: true,
    source: "calendar",
    kind: "event",
    minutesAgo: 60,
    people: [],
    text: "Calendar event: Dentist cleaning, Friday 9:00 AM, Mission Dental.",
  },
  {
    sample: true,
    source: "calendar",
    kind: "event",
    minutesAgo: 60,
    people: [{ name: "Priya Shah" }],
    text: "Calendar event: Study group with Priya Shah, Thursday 7:00 PM, library room 3. Notes: bring the problem set.",
  },
];
