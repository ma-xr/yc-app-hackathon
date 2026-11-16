import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { seedContacts } from "./contactsSeed";
import { requireUser } from "./lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const PT_OFFSET_HOURS = 8;

function startOfTodayPT(now: number) {
  const shifted = now - PT_OFFSET_HOURS * 60 * 60 * 1000;
  return shifted - (shifted % DAY) + PT_OFFSET_HOURS * 60 * 60 * 1000;
}

async function clearOwner(ctx: MutationCtx, ownerId: Id<"users">) {
  const batches = await Promise.all([
    ctx.db.query("items").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("followups").withIndex("by_ownerId_and_sendAt", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("reflections").withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("conversations").withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("topics").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("interactions").withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
  ]);
  for (const rows of batches) {
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    await clearOwner(ctx, ownerId);
    return null;
  },
});

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    await clearOwner(ctx, ownerId);

    const today = startOfTodayPT(Date.now());
    const at = (dayOffset: number, hour: number, minute = 0) =>
      today + dayOffset * DAY + (hour * 60 + minute) * 60 * 1000;

    const person = (
      name: string,
      fields: { archetype?: string; facts: string[]; lastSeenAt: number; conversationCount: number; cadenceDays?: number },
    ) => ctx.db.insert("people", { ownerId, name, ...fields });

    const sam = await person("Sam Rivera", {
      archetype: "Climbing friend · careers and climbing",
      facts: ["Stripe interview Friday, nervous about system design", "Thinks calendars are the hard part of group plans"],
      lastSeenAt: at(-1, 16, 10),
      conversationCount: 6,
      cadenceDays: 14,
    });
    const dev = await person("Dev Patel", {
      archetype: "Roommate · rent, money and AI at work",
      facts: ["Looking for a third roommate in January", "Venmo requests make splitting bills awkward"],
      lastSeenAt: at(-1, 20),
      conversationCount: 5,
      cadenceDays: 4,
    });
    const lena = await person("Lena Ortiz", {
      archetype: "Close friend · work and showing up for people",
      facts: ["Her sister visits next weekend", "Manager forgets what they discuss in 1:1s"],
      lastSeenAt: at(-2, 19, 30),
      conversationCount: 4,
      cadenceDays: 7,
    });
    const priya = await person("Priya Shah", {
      archetype: "Builder friend · startups and AI agents",
      facts: ["Building an agent that lives in the group chat"],
      lastSeenAt: at(-4, 17),
      conversationCount: 3,
      cadenceDays: 10,
    });
    const mom = await person("Mom", {
      archetype: "Family · usually weekly calls",
      facts: ["Notices when you only call on holidays", "Reminded you your passport expires before March"],
      lastSeenAt: at(-16, 18),
      conversationCount: 12,
      cadenceDays: 7,
    });
    const marcus = await person("Marcus Lee", {
      archetype: "College friend · skiing and travel",
      facts: ["Planning a ski trip this winter"],
      lastSeenAt: at(-41, 19),
      conversationCount: 3,
      cadenceDays: 30,
    });
    const jess = await person("Jess", {
      archetype: "Friend from home · cities and life after college",
      facts: ["Wishes she'd moved somewhere new at 22"],
      lastSeenAt: at(-18, 19),
      conversationCount: 2,
    });

    const topic = (label: string, subIdeas: string[], conversationCount: number, peopleCount: number, lastSeenAt: number) =>
      ctx.db.insert("topics", { ownerId, label, subIdeas, conversationCount, peopleCount, lastSeenAt });
    const showUp = await topic(
      "How I show up for people",
      ["Reach out first instead of waiting", "Remember the small things people share", "Phones away at dinner"],
      6, 4, at(-1, 16, 10),
    );
    const ai = await topic(
      "Where AI is taking work",
      ["Which jobs change first", "What's worth learning in college now", "Agents inside everyday apps"],
      5, 3, at(-4, 17),
    );
    const afterCollege = await topic(
      "Life after college",
      ["Startup or big company first", "Which city to move to"],
      4, 3, at(-1, 16, 10),
    );
    const money = await topic(
      "Money, honestly",
      ["Saving vs. spending on experiences", "Splitting costs fairly with roommates"],
      2, 2, at(-1, 20),
    );

    const conversation = (
      startedAt: number,
      minutes: number,
      participantIds: Id<"people">[],
      place: string,
      gist: string[],
      leftOutCount: number,
      topicIds: Id<"topics">[],
    ) =>
      ctx.db.insert("conversations", {
        ownerId,
        startedAt,
        endedAt: startedAt + minutes * 60 * 1000,
        status: "done",
        participantIds,
        place,
        gist,
        leftOutCount,
        pendingChunks: 0,
        topicIds,
      });
    const jessDinner = await conversation(at(-18, 19), 90, [jess], "Dinner", ["Moving somewhere new after college", "Shared groceries never get paid back"], 6, [afterCollege, money]);
    const momCall = await conversation(at(-16, 18), 25, [mom], "Call", ["Passport expires before March", "Calling more than on holidays"], 4, [showUp]);
    const afterClass = await conversation(at(-7, 15), 15, [], "After class", ["Judging AI output beats producing it"], 3, [ai]);
    const devLunch = await conversation(at(-5, 12, 30), 50, [dev], "Lunch", ["Looking for a third roommate in January", "Venmo makes splitting bills awkward"], 7, [money, ai]);
    const priyaCall = await conversation(at(-4, 17), 30, [priya], "Call", ["Building an agent that lives in the group chat", "Sending you her pitch deck"], 5, [ai]);
    const lenaDinner = await conversation(at(-2, 19, 30), 80, [lena], "Dinner", ["Her sister visits next weekend", "Her manager forgets 1:1 notes"], 8, [showUp]);
    const samCoffee = await conversation(at(-1, 16, 10), 45, [sam], "Coffee", ["Stripe interview Friday, nervous about system design", "You offered lunch this week"], 14, [showUp, afterCollege]);
    const devDrinks = await conversation(at(-1, 20), 60, [dev], "Drinks", ["Split rent by room size and sunlight"], 9, [money]);

    const item = (fields: {
      kind: "you_owe" | "they_owe" | "plan" | "urgent" | "fact" | "question" | "takeaway";
      text: string;
      importance: number;
      conversationId?: Id<"conversations">;
      personId?: Id<"people">;
      topicId?: Id<"topics">;
      dueAt?: number;
    }) => ctx.db.insert("items", { ownerId, status: "open", editedByUser: false, ...fields });

    const lunch = await item({ kind: "you_owe", text: "Lunch with Sam this week", importance: 5, conversationId: samCoffee, personId: sam, dueAt: at(4, 12, 30) });
    await item({ kind: "they_owe", text: "Sam sends you the gym link", importance: 2, conversationId: samCoffee, personId: sam });
    await item({ kind: "fact", text: "Stripe interview Friday, nervous about system design", importance: 4, conversationId: samCoffee, personId: sam, dueAt: at(5, 9) });
    await item({ kind: "question", text: "Stripe, or join a friend's startup?", importance: 3, conversationId: samCoffee, personId: sam, topicId: afterCollege });
    await item({ kind: "takeaway", text: "Felt cared for when you remembered his interview", importance: 3, conversationId: samCoffee, personId: sam, topicId: showUp });
    await item({ kind: "takeaway", text: "Split rent by room size and sunlight, not evenly", importance: 3, conversationId: devDrinks, personId: dev, topicId: money });
    await item({ kind: "fact", text: "Looking for a third roommate in January", importance: 3, conversationId: devLunch, personId: dev });
    await item({ kind: "takeaway", text: "Entry-level coding jobs are changing fastest", importance: 2, conversationId: devLunch, personId: dev, topicId: ai });
    await item({ kind: "they_owe", text: "Priya sends you her pitch deck", importance: 4, conversationId: priyaCall, personId: priya });
    await item({ kind: "takeaway", text: "Agents will live inside the apps we already use", importance: 3, conversationId: priyaCall, personId: priya, topicId: ai });
    await item({ kind: "fact", text: "Her sister visits next weekend", importance: 3, conversationId: lenaDinner, personId: lena });
    await item({ kind: "plan", text: "Dinner with Lena and her sister, Sat 7 PM", importance: 4, conversationId: lenaDinner, personId: lena, dueAt: at(6, 19) });
    await item({ kind: "takeaway", text: "You both wait for the other one to text first", importance: 3, conversationId: lenaDinner, personId: lena, topicId: showUp });
    await item({ kind: "urgent", text: "Renew your passport, it expires before March", importance: 4, conversationId: momCall, personId: mom });
    await item({ kind: "takeaway", text: "She notices when you only call on holidays", importance: 3, conversationId: momCall, personId: mom, topicId: showUp });
    const callMom = await item({ kind: "plan", text: "Call Mom", importance: 4, personId: mom, dueAt: at(2, 19) });
    await item({ kind: "takeaway", text: "Learn to judge AI output, not just produce it", importance: 3, conversationId: afterClass, topicId: ai });
    await item({ kind: "takeaway", text: "Wishes she'd moved somewhere new at 22", importance: 2, conversationId: jessDinner, personId: jess, topicId: afterCollege });
    await item({ kind: "takeaway", text: "Shared groceries always go unpaid", importance: 2, conversationId: jessDinner, personId: jess, topicId: money });
    await item({ kind: "urgent", text: "Book a dentist appointment, cavities found", importance: 4, dueAt: at(3, 10) });

    await ctx.db.insert("followups", {
      ownerId,
      personId: sam,
      reason: "Sam's Stripe interview is Friday",
      sendAt: at(5, 8),
      drafts: [
        "Good luck today! You're going to crush the system design round.",
        "Thinking of you today. You've got this, Stripe's lucky to talk to you.",
      ],
      status: "suggested",
    });
    await ctx.db.insert("followups", {
      ownerId,
      personId: sam,
      itemId: lunch,
      reason: "You promised Sam lunch this week",
      sendAt: at(0, 18),
      drafts: ["Still on for lunch this week? Thursday 12:30 work?", "Lunch Thursday? My treat, I want to hear how prep is going."],
      status: "suggested",
    });
    await ctx.db.insert("followups", {
      ownerId,
      personId: mom,
      itemId: callMom,
      reason: "16 days since you talked, you usually call weekly",
      sendAt: at(2, 18, 30),
      drafts: ["Hi Mom, free for a call tonight?"],
      status: "suggested",
    });
    await ctx.db.insert("followups", {
      ownerId,
      personId: marcus,
      reason: "41 days since you talked, ask about the ski trip",
      sendAt: at(0, 19),
      drafts: ["Hey! Is the ski trip still happening? Would love to hear the plan."],
      status: "suggested",
    });

    const date = new Date(today).toISOString().slice(0, 10);
    const question = "Three people talked with you about AI and work this week. What do you actually think?";
    await ctx.db.insert("reflections", {
      ownerId,
      date,
      topicId: ai,
      question,
      messages: [{ role: "jesse", text: question }],
    });

    await seedContacts(ctx, ownerId);
    return null;
  },
});
