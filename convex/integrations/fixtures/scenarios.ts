// SAMPLE DATA. Fictional demo scenarios. Each event is fed through the same ingest and extraction path as a live event.
import { momUnread } from "./imessageInbox";
import type { FixtureEvent } from "./types";

export const scenarioEvents: Record<"tim" | "mom" | "deck", { title: string; description: string; events: FixtureEvent[] }> = {
  tim: {
    title: "Run into Tim",
    description: "A conversation where Tim mentions surfing and you agree on lunch tomorrow.",
    events: [
      {
        sample: true,
        source: "conversation",
        kind: "in_person",
        minutesAgo: 10,
        people: [{ name: "Tim" }],
        text: [
          "You: Tim! It's been forever. How've you been?",
          "Tim: Good, honestly. I started surfing a few weeks ago, I'm out at Linda Mar most weekends now.",
          "You: No way, that's awesome. We should catch up properly. Lunch tomorrow?",
          "Tim: Lunch tomorrow works. Noon at Tartine?",
          "You: Perfect. I'm training for a half marathon in the spring, so I'll need the carbs.",
          "Tim: Ha. How's the job hunt going?",
          "You: Honestly, I'm worried about finding a job after graduation.",
          "Tim: You'll be fine. Tell me more tomorrow.",
        ].join("\n"),
      },
    ],
  },
  mom: {
    title: "Unread text from Mom",
    description: "An old unread iMessage from Mom in the sample inbox.",
    events: [momUnread],
  },
  deck: {
    title: "Promise a pitch deck",
    description: "You promise Priya you'll send her your pitch deck.",
    events: [
      {
        sample: true,
        source: "conversation",
        kind: "in_person",
        minutesAgo: 5,
        people: [{ name: "Priya Shah" }],
        text: [
          "Priya: So what are you building these days?",
          "You: A memory companion app. We're pitching at the hackathon tonight.",
          "Priya: I'd love to see the pitch deck.",
          "You: I'll send you the deck tonight.",
          "Priya: Great, thanks!",
        ].join("\n"),
      },
    ],
  },
};
