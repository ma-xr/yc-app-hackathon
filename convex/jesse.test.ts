import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  buildTalkMessages,
  capWords,
  dayBounds,
  describeMemory,
  describeToday,
  parseTalkReply,
  relativeDay,
  softenTimes,
  type Memory,
} from "./jesse";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 60 * 60 * 1000;

describe("dayBounds", () => {
  test("uses the user's calendar day, not UTC", () => {
    const now = Date.parse("2026-11-15T07:30:00Z");
    expect(dayBounds(now, "America/Los_Angeles")).toEqual({
      start: Date.parse("2026-11-14T08:00:00Z"),
      end: Date.parse("2026-11-15T08:00:00Z"),
    });
    expect(dayBounds(now, "Asia/Tokyo")).toEqual({
      start: Date.parse("2026-11-14T15:00:00Z"),
      end: Date.parse("2026-11-15T15:00:00Z"),
    });
  });

  test("handles a 23-hour DST day", () => {
    const { start, end } = dayBounds(Date.parse("2026-03-08T20:00:00Z"), "America/Los_Angeles");
    expect(start).toBe(Date.parse("2026-03-08T08:00:00Z"));
    expect(end).toBe(Date.parse("2026-03-09T07:00:00Z"));
  });
});

describe("today", () => {
  test("returns only today's conversations, items and people in the user's time zone", async () => {
    const t = convexTest(schema, modules);
    const timeZone = "America/Los_Angeles";
    const now = Date.now();
    const { start, end } = dayBounds(now, timeZone);
    const ownerId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {});
      const otherId = await ctx.db.insert("users", {});
      const sam = await ctx.db.insert("people", {
        ownerId,
        name: "Sam",
        archetype: "college friend",
        facts: ["Interviewing at Stripe on Friday"],
        lastSeenAt: start + HOUR,
        conversationCount: 3,
      });
      const lee = await ctx.db.insert("people", {
        ownerId,
        name: "Lee",
        facts: ["Moved to Denver"],
        lastSeenAt: start - 3 * HOUR,
        conversationCount: 1,
      });
      const today = await ctx.db.insert("conversations", {
        ownerId,
        startedAt: start + 9 * HOUR,
        status: "done",
        participantIds: [sam],
        place: "Blue Bottle, Hayes Valley",
        gist: ["Sam is nervous about the interview."],
        leftOutCount: 0,
      });
      const yesterday = await ctx.db.insert("conversations", {
        ownerId,
        startedAt: start - 3 * HOUR,
        status: "done",
        participantIds: [lee],
        place: "Home",
        gist: ["Talked about Denver."],
        leftOutCount: 0,
      });
      await ctx.db.insert("conversations", {
        ownerId: otherId,
        startedAt: start + 10 * HOUR,
        status: "done",
        participantIds: [],
        gist: ["Someone else's day."],
        leftOutCount: 0,
      });
      await ctx.db.insert("conversations", {
        ownerId,
        startedAt: end + HOUR,
        status: "done",
        participantIds: [],
        gist: ["Tomorrow."],
        leftOutCount: 0,
      });
      await ctx.db.insert("items", {
        ownerId,
        conversationId: today,
        personId: sam,
        kind: "plan",
        text: "Text Sam good luck",
        dueAt: start + 18 * HOUR,
        importance: 3,
        status: "open",
        editedByUser: false,
      });
      await ctx.db.insert("items", {
        ownerId,
        conversationId: yesterday,
        kind: "you_owe",
        text: "Already sent Lee the photos",
        importance: 2,
        status: "done",
        editedByUser: false,
      });
      return ownerId;
    });

    const result = await t.query(internal.jesse.today, { ownerId, timeZone, now });

    expect(result.conversations).toEqual([
      {
        startedAt: start + 9 * HOUR,
        place: "Blue Bottle, Hayes Valley",
        people: ["Sam"],
        gist: ["Sam is nervous about the interview."],
        mood: null,
        moodReason: null,
      },
    ]);
    expect(result.items).toEqual([
      { kind: "plan", text: "Text Sam good luck", person: "Sam", dueAt: start + 18 * HOUR },
    ]);
    expect(result.people).toEqual([
      { name: "Sam", archetype: "college friend", facts: ["Interviewing at Stripe on Friday"] },
    ]);

    const notes = describeToday(result, timeZone, now);
    expect(notes).toContain("this morning at Blue Bottle, Hayes Valley with Sam");
    expect(notes).toContain("due this evening");
    expect(notes).toContain("Text Sam good luck");
    expect(notes).not.toContain("Denver");
  });

  test("says when nothing from today has been captured", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert("users", {}));
    const result = await t.query(internal.jesse.today, { ownerId, timeZone: "Not/AZone", now: Date.now() });
    expect(result).toEqual({ conversations: [], items: [], people: [] });
    expect(describeToday(result, "America/Los_Angeles", Date.now())).toContain("Nothing from today");
  });
});

describe("parseTalkReply", () => {
  test("keeps a valid mood", () => {
    expect(parseTalkReply({ answer: " Rough one, huh? ", mood: "low" })).toEqual({ answer: "Rough one, huh?", mood: "low" });
  });

  test("falls back to calm for a missing or invalid mood", () => {
    expect(parseTalkReply({ answer: "Hey!", mood: "ecstatic" }).mood).toBe("calm");
    expect(parseTalkReply({ answer: "Hey!" }).mood).toBe("calm");
  });

  test("rejects an empty answer", () => {
    expect(() => parseTalkReply({ mood: "up" })).toThrow();
    expect(() => parseTalkReply(null)).toThrow();
  });
});

describe("buildTalkMessages", () => {
  test("maps history to chat turns, caps turns and length, and ends with the question", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("jesse" as const),
      text: `turn ${i} ${"x".repeat(i === 14 ? 1000 : 0)}`,
    }));
    const messages = buildTalkMessages(history, "How was my day?");
    expect(messages).toHaveLength(13);
    expect(messages[0]).toEqual({ role: "assistant", content: "turn 3" });
    expect(messages[11].content).toHaveLength(600);
    expect(messages[12]).toEqual({ role: "user", content: "How was my day?" });
  });
});

describe("capWords", () => {
  test("keeps short replies as they are", () => {
    expect(capWords("That sounds like a lot. Want to talk about it?", 45)).toBe("That sounds like a lot. Want to talk about it?");
  });

  test("cuts long replies back to the last full sentence within the cap", () => {
    const long = `You had lunch with Sam at noon. ${"really ".repeat(50)}nice.`;
    expect(capWords(long, 45)).toBe("You had lunch with Sam at noon.");
  });

  test("ends with an ellipsis when there is no sentence break", () => {
    expect(capWords("one two three four five six", 4)).toBe("one two three four…");
  });

  test("parseTalkReply applies the 45 word cap", () => {
    const answer = `Short first sentence. ${"word ".repeat(80)}end.`;
    expect(parseTalkReply({ answer, mood: "up" }).answer).toBe("Short first sentence.");
  });
});

const CLOCK = /\d{1,2}:\d{2}|\b\d{1,2}\s*[ap]\.?m\b/i;

describe("time-free context", () => {
  const timeZone = "America/Los_Angeles";
  const now = Date.parse("2026-11-15T23:00:00Z");
  const { start } = dayBounds(now, timeZone);

  test("softenTimes turns clock times in free text into parts of the day", () => {
    expect(softenTimes("Dentist at 3:15pm, call Mom by 9 AM, standup 14:00, lunch at noon")).toBe(
      "Dentist in the afternoon, call Mom in the morning, standup in the afternoon, lunch around lunch",
    );
    expect(softenTimes("Bought 5 apples and 2 ampoules")).toBe("Bought 5 apples and 2 ampoules");
  });

  test("relativeDay speaks in days, never dates or times", () => {
    expect(relativeDay(start + 12.5 * HOUR, timeZone, now)).toBe("around lunch");
    expect(relativeDay(start - 2 * HOUR, timeZone, now)).toBe("yesterday");
    expect(relativeDay(start + 30 * HOUR, timeZone, now)).toBe("tomorrow");
    expect(relativeDay(start - 3 * 24 * HOUR, timeZone, now)).toBe("on Thursday");
    expect(relativeDay(start - 30 * 24 * HOUR, timeZone, now)).toBe("a while back");
  });

  test("today and memory context carry no clock times and flag how a conversation felt", () => {
    const today = describeToday(
      {
        conversations: [
          { startedAt: start + 15.25 * HOUR, place: "Ramen Nagi", people: ["Sam"], gist: ["Sam got a Stripe interview at 4pm Friday."], mood: 2, moodReason: "Sam's big news" },
          { startedAt: start + 8 * HOUR, place: null, people: ["Mom"], gist: ["Mom's surgery moved."], mood: -1.6, moodReason: null },
        ],
        items: [{ kind: "plan", text: "Call Mom at 7:30", person: "Mom", dueAt: start + 19.5 * HOUR }],
        people: [{ name: "Sam", archetype: null, facts: ["Interview Friday 4 PM"] }],
      },
      timeZone,
      now,
    );
    expect(today).not.toMatch(CLOCK);
    expect(today).toContain("this morning with Mom: Mom's surgery moved. [this one really weighed on them]");
    expect(today).toContain("this afternoon at Ramen Nagi with Sam");
    expect(today).toContain("[this one really lit them up: Sam's big news]");
    expect(today.indexOf("with Mom")).toBeLessThan(today.indexOf("with Sam"));

    const memory: Memory = {
      people: [{ id: "p" as never, name: "Sam", archetype: null, facts: ["Runs at 6am"], lastSeenAt: start + 15 * HOUR, conversationCount: 4 }],
      items: [{ kind: "you_owe", text: "Send deck", person: "Sam", dueAt: start + 40 * HOUR, importance: 2 }],
      topics: [{ label: "Job search", subIdeas: ["interview at 10:30"], conversationCount: 5, peopleCount: 2 }],
      conversations: [{ id: "c" as never, startedAt: start - 5 * HOUR, people: ["Lee"], place: null, gist: ["Talked about Denver."] }],
      reflections: [{ date: "2026-11-14", question: "What made you smile?", summary: "Lunch at 12:30" }],
    };
    const background = describeMemory(memory, timeZone, now);
    expect(background).not.toMatch(CLOCK);
    expect(background).not.toMatch(/conversations?\)|\d+ conversations/);
    expect(background).toContain("Sam: Runs in the morning (last saw them this afternoon)");
    expect(background).toContain("yesterday: you asked");
  });
});
