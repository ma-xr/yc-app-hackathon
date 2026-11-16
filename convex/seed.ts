import { MOCK_CONTACTS } from "../src/components/contacts/data/mock-data";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { computeDayRow, localDate, localTime, shiftDate } from "./days";
import { talkMinutes } from "./lib/dayScores";
import { requireUser } from "./lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 20;
const WRITTEN_DAYS = 7;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type ActivityType = NonNullable<Doc<"conversations">["activityType"]>;
type Energy = NonNullable<Doc<"conversations">["energy"]>;
type Channel = NonNullable<Doc<"conversations">["channel"]>;
type Relationship = NonNullable<Doc<"people">["relationship"]>;
type Mock = (typeof MOCK_CONTACTS)[number];

const PEOPLE = {
  maya: { name: "Maya Chen", cadenceDays: 2, signal: { fun: 2, overlap: 3, depth: 2 } },
  sam: { name: "Sam Rivera", cadenceDays: 7, signal: { fun: 3, overlap: 2, depth: 3 } },
  david: { name: "David Okafor", cadenceDays: 14, signal: { fun: 1, overlap: 3, depth: 2 } },
  ethan: { name: "Ethan Nguyen", cadenceDays: undefined, signal: { fun: 2, overlap: 3, depth: 1 } },
  mom: { name: "Mom", cadenceDays: 7, signal: { fun: 1, overlap: 1, depth: 3 } },
  lena: { name: "Lena Ortiz", cadenceDays: 7, signal: { fun: 3, overlap: 1, depth: 3 } },
  dev: { name: "Dev Patel", cadenceDays: undefined, signal: { fun: 2, overlap: 1, depth: 1 } },
  priya: { name: "Priya Shah", cadenceDays: undefined, signal: { fun: 2, overlap: 3, depth: 2 } },
} as const;
type PersonKey = keyof typeof PEOPLE;

const PLACES = {
  reveille: { name: "Café Réveille", lat: 37.7605, lng: -122.4214 },
  hackathon: { name: "YC hackathon", lat: 37.7793, lng: -122.3932 },
  tartine: { name: "Tartine", lat: 37.7614, lng: -122.4241 },
  dolores: { name: "Dolores Park", lat: 37.7596, lng: -122.4269 },
  cliffs: { name: "Mission Cliffs", lat: 37.7605, lng: -122.4127 },
  bernal: { name: "Bernal Hill", lat: 37.7432, lng: -122.4146 },
  home: { name: "Home", lat: 37.7552, lng: -122.4183 },
} as const;
type PlaceKey = keyof typeof PLACES;

const TOPICS = {
  agents: { label: "AI agents", subIdeas: ["Agents inside everyday apps", "Memory that stays private"] },
  startups: { label: "Startups", subIdeas: ["Fundraising", "Pitch decks", "Founder stories"] },
  climbing: { label: "Climbing", subIdeas: ["Projecting V4s", "Weekend trip to Bishop"] },
  preseed: { label: "Pre-seed round", subIdeas: ["December target", "Advisor intros"] },
  expo: { label: "Expo build", subIdeas: ["iOS build", "Demo device"] },
  convex: { label: "Convex schema", subIdeas: ["Days table", "Privacy by default"] },
  demo: { label: "Demo plan", subIdeas: ["Three-minute script", "Live recording"] },
  stripe: { label: "Stripe interview", subIdeas: ["System design round", "Leaving consulting"] },
  passport: { label: "Passport renewal", subIdeas: ["Expires before March", "Renewal forms"] },
  thanksgiving: { label: "Thanksgiving", subIdeas: ["Flying home", "Who cooks what"] },
  travel: { label: "Travel", subIdeas: ["Kyoto trip"] },
} as const;
type TopicKey = keyof typeof TOPICS;

type Talk = {
  day: number;
  at: [number, number];
  mins: number;
  who: PersonKey[];
  place: PlaceKey;
  act: ActivityType;
  mood: number;
  energy: Energy;
  mix: [number, number, number];
  why: string;
  line: string;
  topics: TopicKey[];
  channel?: Channel;
  key?: string;
};

const build = (day: number, at: [number, number], mins: number, mood = 1, who: PersonKey[] = ["maya"]): Talk => ({
  day, at, mins, who, place: "home", act: "building", mood, energy: mood > 0 ? "high" : "medium", mix: [0.85, 0.05, 0.1],
  why: mood > 0 ? "shipping fast, good momentum" : mood < 0 ? "stuck on a bug, short tempers" : "slow grind through the backlog",
  line: "Building Jesse: agents, memory and the app", topics: ["agents", "expo"],
});
const meeting = (day: number, at: [number, number], mins: number, mood: number, who: PersonKey[], place: PlaceKey = "home"): Talk => ({
  day, at, mins, who, place, act: "meeting", mood, energy: "medium", mix: [0.8, 0.05, 0.15],
  why: mood < 0 ? "long meeting, going in circles" : "clear next steps on the round",
  line: "Fundraising plan and investor list", topics: ["startups", "preseed"],
});
const climb = (day: number, mins = 120): Talk => ({
  day, at: [18, 0], mins, who: ["sam"], place: "cliffs", act: "exercise", mood: 2, energy: "high", mix: [0.05, 0.9, 0.05],
  why: "sent the project, lots of laughing", line: "Climbing session, projecting V4s together", topics: ["climbing"],
});
const samMeal = (day: number, at: [number, number], mins = 60): Talk => ({
  day, at, mins, who: ["sam"], place: "tartine", act: "meal", mood: 2, energy: "high", mix: [0.1, 0.8, 0.1],
  why: "easy laughs, caught up properly", line: "Catching up over food: climbing and his Stripe interview", topics: ["climbing", "stripe"],
});
const momCall = (day: number, at: [number, number], mins = 30, mood = 1): Talk => ({
  day, at, mins, who: ["mom"], place: "home", act: "other", mood, energy: "low", mix: [0, 0.7, 0.3], channel: "call",
  why: "warm call, a bit of nagging", line: "Family news and Thanksgiving plans", topics: ["thanksgiving"],
});
const walk = (day: number, at: [number, number], mins: number, who: PersonKey[]): Talk => ({
  day, at, mins, who, place: "dolores", act: "outdoors", mood: 1, energy: "medium", mix: [0.4, 0.5, 0.1],
  why: "sun and a slower pace", line: "Walk in the park, big-picture product talk", topics: ["agents"],
});

const lunch = (day: number, mins = 50): Talk => ({
  day, at: [12, 45], mins, who: ["maya"], place: "tartine", act: "meal", mood: 1, energy: "medium", mix: [0.5, 0.3, 0.2],
  why: "a proper break, good ideas", line: "Lunch with Maya: roadmap and fundraising", topics: ["startups"],
});

const samWalk = (day: number, at: [number, number], mins = 90, place: PlaceKey = "dolores"): Talk => ({
  ...walk(day, at, mins, ["sam"]), place, mood: 2, energy: "high", mix: [0.1, 0.8, 0.1],
  why: "sun, gossip and Bishop plans", line: "Walk with Sam: Bishop plans and his Stripe prep", topics: ["climbing", "stripe"],
});
const coffee = (day: number, at: [number, number], mins: number, mood: number, who: PersonKey[]): Talk => ({
  day, at, mins, who, place: "reveille", act: "meal", mood, energy: "medium", mix: [0.7, 0.2, 0.1],
  why: mood > 0 ? "relaxed coffee, good advice" : "quick coffee, mostly logistics", line: "Coffee and pre-seed advice", topics: ["startups", "preseed"],
});
const workingLunch = (day: number): Talk => ({
  day, at: [12, 30], mins: 30, who: ["maya"], place: "tartine", act: "meal", mood: -1, energy: "low", mix: [0.8, 0.1, 0.1],
  why: "rushed lunch, still arguing about the plan", line: "Working lunch between meetings", topics: ["startups"],
});

const OLDER: Talk[] = [
  build(-20, [10, 0], 150, 0), coffee(-20, [14, 0], 60, 1, ["david"]),
  { ...walk(-19, [11, 0], 70, ["lena"]), why: "long catch-up, her sister's visit", line: "Walk with Lena: her sister's visit and work", topics: ["travel"], key: "lenaWalk" }, { ...samMeal(-19, [13, 0], 60), who: ["lena", "sam"] }, build(-19, [16, 0], 120, 2), samWalk(-19, [18, 30]),
  meeting(-18, [9, 0], 120, -1, ["maya"]), workingLunch(-18), meeting(-18, [13, 0], 120, -1, ["maya"], "reveille"), build(-18, [16, 0], 90, 0),
  build(-17, [10, 0], 190, 2), samWalk(-17, [17, 0], 90, "bernal"), samMeal(-17, [20, 30], 75),
  lunch(-16), walk(-16, [18, 0], 40, ["maya"]), build(-16, [10, 0], 210, 0), momCall(-16, [19, 0], 30),
  lunch(-15), build(-15, [10, 0], 160, 0), coffee(-15, [15, 0], 60, 1, ["david"]), build(-15, [17, 0], 60, 0),
  build(-14, [10, 0], 190, 2), samWalk(-14, [17, 0], 90, "bernal"), samMeal(-14, [20, 30], 75),
  meeting(-13, [9, 0], 150, -1, ["maya"]), workingLunch(-13), meeting(-13, [13, 0], 90, -1, ["david"], "reveille"), build(-13, [16, 0], 90, 0),
  lunch(-12), walk(-12, [18, 0], 40, ["maya"]), build(-12, [10, 0], 210, 0), momCall(-12, [19, 0], 30),
  {
    day: -12, at: [21, 30], mins: 5, who: ["lena"], place: "home", act: "social", mood: 1, energy: "low", mix: [0, 0.9, 0.1],
    channel: "imessage", why: "fun texts about her Kyoto plans", line: "Texting about her Kyoto trip", topics: ["travel"], key: "lenaText",
  },
  lunch(-11), build(-11, [10, 0], 160, 0), coffee(-11, [14, 0], 60, 1, ["david"]), build(-11, [16, 0], 90, 0),
  build(-10, [10, 0], 190, 2), climb(-10), samMeal(-10, [20, 30], 75),
  samWalk(-9, [11, 0]), samMeal(-9, [19, 30], 75), lunch(-9), momCall(-9, [14, 0], 30), build(-9, [16, 0], 120),
  meeting(-8, [9, 0], 120, -1, ["maya"]), meeting(-8, [13, 0], 120, -1, ["david"], "reveille"), build(-8, [16, 0], 90, 0),
  {
    day: -16, at: [20, 30], mins: 40, who: ["dev"], place: "home", act: "meal", mood: 1, energy: "low", mix: [0.3, 0.4, 0.3],
    why: "easy dinner, fair rent split", line: "Dinner with Dev: rent split and AI at his work", topics: ["agents"], key: "devDinner",
  },
  {
    day: -15, at: [8, 30], mins: 45, who: ["priya"], place: "reveille", act: "meal", mood: 1, energy: "high", mix: [0.8, 0.15, 0.05],
    why: "trading agent ideas, lots of energy", line: "Coffee with Priya: her group-chat agent", topics: ["agents", "startups"], key: "priyaCoffee",
  },
  {
    day: -8, at: [21, 0], mins: 30, who: ["dev"], place: "home", act: "meal", mood: 0, energy: "low", mix: [0.4, 0.3, 0.3],
    why: "tired, low-key catch-up", line: "Late dinner with Dev about his Databricks team", topics: ["agents"],
  },
  lunch(-7), walk(-7, [18, 0], 40, ["maya"]), build(-7, [10, 0], 210, 0), momCall(-7, [19, 0], 30),
];

const WEEK: Talk[] = [
  {
    day: -6, at: [21, 0], mins: 30, who: ["priya"], place: "home", act: "other", mood: 1, energy: "medium", mix: [0.7, 0.2, 0.1],
    channel: "call", why: "useful notes on agent memory", line: "Call with Priya about agent memory", topics: ["agents"],
  },
  build(-6, [10, 0], 180, 0), lunch(-6), meeting(-6, [13, 0], 45, 1, ["david"], "reveille"), momCall(-6, [18, 30], 40, 0),
  build(-5, [10, 0], 120, 0), lunch(-5), meeting(-5, [14, 0], 120, -1, ["maya"]), meeting(-5, [17, 0], 60, 1, ["david"], "reveille"),
  coffee(-4, [9, 0], 45, 0, ["david"]), build(-4, [10, 0], 150), { ...samMeal(-4, [12, 30]), key: "samLunchTue" }, samWalk(-4, [13, 40], 45), build(-4, [15, 0], 90, 0),
  {
    ...meeting(-3, [9, 0], 150, -2, ["david"]), channel: "call", why: "grilled on metrics, felt behind",
    line: "Mock investor call about traction and the round", key: "investorCall",
  },
  workingLunch(-3), meeting(-3, [13, 0], 120, -1, ["maya"]), build(-3, [16, 0], 60, 0), momCall(-3, [20, 0], 30),
  build(-2, [10, 0], 180, 0), lunch(-2), walk(-2, [17, 0], 60, ["maya"]), momCall(-2, [20, 0], 30),
  build(-1, [10, 0], 120), lunch(-1),
  {
    day: -1, at: [14, 0], mins: 45, who: ["ethan"], place: "hackathon", act: "building", mood: 1, energy: "high", mix: [0.9, 0.05, 0.05],
    why: "quick click, same taste in tools", line: "Hackathon check-in, pairing on Convex questions", topics: ["convex", "agents"], key: "wenMeet",
  },
  { ...climb(-1), key: "climbFri" }, samMeal(-1, [20, 30], 45),
  {
    day: 0, at: [9, 30], mins: 45, who: ["david"], place: "reveille", act: "meeting", mood: 1, energy: "medium", mix: [0.7, 0.15, 0.15],
    why: "focused and hopeful about the deck", line: "Pre-seed deck feedback, left with two follow-ups", topics: ["preseed", "startups"], key: "davidToday",
  },
  {
    day: 0, at: [11, 0], mins: 150, who: ["maya", "ethan"], place: "hackathon", act: "building", mood: 1, energy: "high", mix: [0.8, 0.05, 0.15],
    why: "heads-down, good momentum", line: "Expo build and Convex schema for Jesse", topics: ["expo", "convex", "agents"], key: "buildToday",
  },
  {
    day: 0, at: [13, 40], mins: 60, who: ["sam"], place: "tartine", act: "meal", mood: 2, energy: "high", mix: [0, 0.9, 0.1],
    why: "laughing about the climbing trip", line: "Lunch: Bishop trip plans and his Stripe interview", topics: ["climbing", "stripe"], key: "samToday",
  },
  {
    day: 0, at: [15, 0], mins: 90, who: ["maya"], place: "hackathon", act: "building", mood: -1, energy: "high", mix: [0.75, 0.05, 0.2],
    why: "deadline pressure, talking over each other", line: "Demo plan under deadline", topics: ["demo", "agents"], key: "demoToday",
  },
  {
    day: 0, at: [19, 10], mins: 25, who: ["mom"], place: "dolores", act: "outdoors", mood: 1, energy: "low", mix: [0, 0.7, 0.3],
    channel: "call", why: "calm walk, sorting out paperwork", line: "Passport renewal and Thanksgiving plans", topics: ["passport", "thanksgiving"], key: "momToday",
  },
];

function mockProfile(m: Mock, now: number) {
  const fact = (f?: { text: string }) => (f ? { text: f.text, conversationIds: [] } : undefined);
  const facts = (fs: { text: string }[]) => fs.map((f) => ({ text: f.text, conversationIds: [] }));
  const relationship: Relationship = ["work", "friend", "family", "other"].includes(m.relationship) ? (m.relationship as Relationship) : "other";
  return {
    name: m.name,
    relationship,
    roleLabel: m.roleLabel,
    relationshipSummary: m.relationshipSummary,
    phone: m.phones[0],
    facts: [],
    from: fact(m.from),
    workingOn: fact(m.workingOn),
    howWeMet: fact(m.howWeMet),
    birthday: m.birthday ? { text: `${MONTHS[m.birthday.month - 1]} ${m.birthday.day}`, conversationIds: [] } : undefined,
    interests: facts(m.interests),
    whatMatters: facts(m.whatMatters),
    family: facts(m.family),
    lifeEvents: facts(m.lifeEvents),
    giftIdeas: facts(m.giftIdeas),
    openPromises: m.openPromises.map((p) => ({
      text: p.text,
      direction: p.direction === "they" ? ("they_owe" as const) : ("you_owe" as const),
      conversationIds: [],
    })),
    totalMinutes: m.totalMinutes,
    encounterCount: m.encounterCount,
    conversationCount: m.encounterCount,
    distinctTopicCount: m.distinctTopicCount,
    funScore: m.funScore,
    compatibilityScore: m.compatibilityScore,
    deepTalkScore: m.deepTalkScore,
    lastInteractionAt: m.lastAgo === undefined ? undefined : now - m.lastAgo,
    lastSeenAt: now - (m.lastAgo ?? m.knownAgo ?? 0),
  };
}

const LINKS: Record<PersonKey, [string, string[]][]> = {
  maya: [
    ["buildToday", ["Leading the Jesse iOS app and the on-device pipeline"]],
    ["demoToday", ["Shipping things she is proud of, not just fast"]],
  ],
  sam: [
    ["samToday", ["Interviewing at Stripe, system design round on Friday"]],
    ["climbFri", ["Outdoor bouldering in Bishop", "Belayed each other at Mission Cliffs on a busy Tuesday"]],
    ["samLunchTue", ["Left his consulting job in August to find something better"]],
  ],
  david: [
    ["davidToday", ["YC group partner, consumer and AI"]],
    ["investorCall", ["Founders who ship weekly"]],
  ],
  ethan: [["buildToday", ["Convex backend and the extraction pipeline", "Clean code and long focus blocks"]]],
  mom: [["momToday", ["Reminded you your passport expires before March", "Hearing from you more than on holidays"]]],
  lena: [
    ["lenaText", ["Japan, saving for a Kyoto trip"]],
    ["lenaWalk", ["Sister Carmen visits next weekend", "Product manager at Figma, frustrated her manager forgets their 1:1s"]],
  ],
  dev: [["devDinner", ["ML infra at Databricks, worried about AI changing his team", "Being fair with money, hates awkward Venmo requests"]]],
  priya: [["priyaCoffee", ["An agent that lives in the group chat", "AI agents"]]],
};

const EXTRAS: Partial<Record<PersonKey, { howWeMet?: [string, string]; lifeEvents?: [string, string]; giftIdeas?: [string, string] }>> = {
  mom: { howWeMet: ["Family, calls most Sundays", "momToday"] },
  david: { lifeEvents: ["Became your YC group partner this batch", "investorCall"], giftIdeas: ["A good cycling cap for his long rides", "davidToday"] },
  ethan: { lifeEvents: ["Joined Jesse full-time for the hackathon", "buildToday"], giftIdeas: ["A new speedcube", "buildToday"] },
  priya: { lifeEvents: ["Demoed her group-chat agent at a meetup", "priyaCoffee"] },
};

async function clearOwner(ctx: MutationCtx, ownerId: Id<"users">) {
  const batches = await Promise.all([
    ctx.db.query("items").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("followups").withIndex("by_ownerId_and_sendAt", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("reflections").withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("conversations").withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("topics").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("days").withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("traits").withIndex("by_ownerId_and_kind", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(1000),
    ctx.db.query("locationPings").withIndex("by_ownerId_and_ts", (q) => q.eq("ownerId", ownerId)).take(1000),
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
    const now = Date.now();
    const today = localDate(now);
    const at = (day: number, [hour, minute]: [number, number]) => localTime(shiftDate(today, day), hour, minute);

    const mocks = new Map(MOCK_CONTACTS.map((m) => [m.name, m]));
    const personIds = {} as Record<PersonKey, Id<"people">>;
    for (const [key, p] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
      personIds[key] = await ctx.db.insert("people", { ownerId, ...mockProfile(mocks.get(p.name)!, now), cadenceDays: p.cadenceDays });
    }
    const cast = new Set<string>(Object.values(PEOPLE).map((p) => p.name));
    for (const m of MOCK_CONTACTS) {
      if (!cast.has(m.name)) await ctx.db.insert("people", { ownerId, ...mockProfile(m, now) });
    }
    const topicIds = {} as Record<TopicKey, Id<"topics">>;
    for (const [key, t] of Object.entries(TOPICS) as [TopicKey, (typeof TOPICS)[TopicKey]][]) {
      topicIds[key] = await ctx.db.insert("topics", {
        ownerId, label: t.label, subIdeas: [...t.subIdeas], conversationCount: 0, peopleCount: 0, lastSeenAt: 0,
      });
    }

    const talks = [...OLDER, ...WEEK].sort((a, b) => at(a.day, a.at) - at(b.day, b.at));
    const saved: { talk: Talk; doc: Doc<"conversations"> }[] = [];
    for (const talk of talks) {
      const startedAt = at(talk.day, talk.at);
      const place = PLACES[talk.place];
      const id = await ctx.db.insert("conversations", {
        ownerId,
        startedAt,
        endedAt: startedAt + talk.mins * 60 * 1000,
        status: "done",
        participantIds: talk.who.map((k) => personIds[k]),
        place: place.name,
        placeName: place.name,
        location: { lat: place.lat, lng: place.lng },
        channel: talk.channel,
        gist: [talk.line],
        leftOutCount: 0,
        pendingChunks: 0,
        topicIds: talk.topics.map((k) => topicIds[k]),
        mood: talk.mood,
        moodReason: talk.why,
        energy: talk.energy,
        activityType: talk.act,
        topicMix: { work: talk.mix[0], personal: talk.mix[1], logistics: talk.mix[2] },
        summaryLine: talk.line,
        personSignals: talk.who.map((k) => ({
          personId: personIds[k],
          ...PEOPLE[k].signal,
          fun: Math.min(3, PEOPLE[k].signal.fun + (talk.mood >= 2 ? 1 : 0)),
        })),
      });
      saved.push({ talk, doc: (await ctx.db.get("conversations", id))! });
    }
    const byKey = (key: string) => saved.find((s) => s.talk.key === key)!.doc._id;
    const withTopic = (key: TopicKey) => saved.filter((s) => s.talk.topics.includes(key));
    const withPerson = (key: PersonKey) => saved.filter((s) => s.talk.who.includes(key));

    for (const key of Object.keys(TOPICS) as TopicKey[]) {
      const rows = withTopic(key);
      if (rows.length === 0) continue;
      await ctx.db.patch("topics", topicIds[key], {
        conversationCount: rows.length,
        peopleCount: new Set(rows.flatMap((s) => s.talk.who)).size,
        lastSeenAt: Math.max(...rows.map((s) => s.doc.startedAt)),
      });
    }

    const item = (kind: "you_owe" | "they_owe", text: string, person: PersonKey, conversationId: Id<"conversations">, dueDay?: number) =>
      ctx.db.insert("items", {
        ownerId, kind, text, importance: 4, status: "open", editedByUser: false, conversationId, personId: personIds[person],
        dueAt: dueDay === undefined ? undefined : at(dueDay, [12, 0]),
      });
    const promises: Partial<Record<PersonKey, NonNullable<Doc<"people">["openPromises"]>>> = {};
    const promise = async (direction: "you_owe" | "they_owe", text: string, person: PersonKey, key: string, dueDay?: number) => {
      const conversationId = byKey(key);
      const itemId = await item(direction, text, person, conversationId, dueDay);
      promises[person] = [...(promises[person] ?? []), { text, direction, conversationIds: [conversationId], itemId }];
    };
    await promise("you_owe", "Send Maya the investor update draft", "maya", "demoToday", 1);
    await promise("you_owe", "Send David the revised pre-seed deck", "david", "davidToday", 2);
    await promise("they_owe", "David intros you to two angels", "david", "davidToday");
    await promise("you_owe", "Book the Bishop climbing weekend", "sam", "samToday", 5);
    await promise("they_owe", "Sam tells you how the Stripe round went", "sam", "samToday");
    await promise("you_owe", "Send Mom the passport renewal forms", "mom", "momToday", 1);
    await promise("they_owe", "Ethan shares his Convex schema notes", "ethan", "buildToday");
    await promise("you_owe", "Send Lena your Kyoto list", "lena", "lenaText");
    await promise("they_owe", "Priya sends you her agent demo", "priya", "priyaCoffee");

    for (const key of Object.keys(PEOPLE) as PersonKey[]) {
      const person = (await ctx.db.get("people", personIds[key]))!;
      const rows = withPerson(key);
      const linked = new Map(LINKS[key].flatMap(([talkKey, texts]) => texts.map((text) => [text, [byKey(talkKey)]] as const)));
      const link = <T extends { text: string; conversationIds: Id<"conversations">[] }>(f: T) => ({ ...f, conversationIds: linked.get(f.text) ?? f.conversationIds });
      const linkAll = <T extends { text: string; conversationIds: Id<"conversations">[] }>(fs?: T[]) => fs?.map(link);
      const last = Math.max(...rows.map((s) => s.doc.startedAt));
      const labels = [...new Set(rows.flatMap((s) => s.talk.topics.map((t) => TOPICS[t].label)))];
      const signals = rows.flatMap((s) => s.doc.personSignals ?? []).filter((x) => x.personId === personIds[key]);
      const score = (pick: (x: { fun: number; overlap: number; depth: number }) => number) =>
        Math.round((signals.reduce((sum, x) => sum + pick(x), 0) / signals.length / 3) * 100);
      const extra = EXTRAS[key] ?? {};
      const sourced = (e?: [string, string]) => (e ? [{ text: e[0], conversationIds: [byKey(e[1])] }] : []);
      await ctx.db.patch("people", personIds[key], {
        from: person.from && link(person.from),
        workingOn: person.workingOn && link(person.workingOn),
        howWeMet: person.howWeMet ? link(person.howWeMet) : sourced(extra.howWeMet)[0],
        birthday: person.birthday && link(person.birthday),
        interests: linkAll(person.interests),
        whatMatters: linkAll(person.whatMatters),
        family: linkAll(person.family),
        lifeEvents: [...(linkAll(person.lifeEvents) ?? []), ...sourced(extra.lifeEvents)],
        giftIdeas: [...(linkAll(person.giftIdeas) ?? []), ...sourced(extra.giftIdeas)],
        openPromises: promises[key] ?? [],
        lastSeenAt: last,
        lastInteractionAt: last,
        conversationCount: rows.length,
        encounterCount: rows.length,
        totalMinutes: rows.reduce((sum, s) => sum + talkMinutes(s.doc), 0),
        topicLabels: labels,
        distinctTopicCount: labels.length,
        funScore: score((x) => x.fun),
        compatibilityScore: score((x) => x.overlap),
        deepTalkScore: score((x) => x.depth),
      });
    }

    const evidence = (rows: { doc: Doc<"conversations"> }[]) => rows.map((s) => s.doc._id).slice(-20);
    const trait = (
      kind: "interest" | "goal" | "personality",
      label: string,
      reason: string,
      rows: { doc: Doc<"conversations"> }[],
      confidence: number,
      toldAt?: number,
    ) =>
      ctx.db.insert("traits", {
        ownerId, kind, label, reason, source: toldAt === undefined ? "learned" : "told",
        evidenceCount: rows.length, evidence: evidence(rows), confidence,
        lastSeenAt: rows.length > 0 ? Math.max(...rows.map((s) => s.doc.startedAt)) : (toldAt ?? now), toldAt, removed: false,
      });
    const agents = withTopic("agents");
    const startups = withTopic("startups");
    const climbing = withTopic("climbing");
    const oneOnOne = saved.filter((s) => s.talk.who.length === 1 && s.talk.mood >= 1);
    const evening = saved.filter((s) => s.talk.at[0] >= 20);
    await trait("interest", "AI agents", `Your most-discussed topic this month, in ${agents.length} conversations, mostly with Maya and Ethan.`, agents, 0.9);
    await trait("interest", "Startups", `Fundraising and pitch decks came up in ${startups.length} conversations.`, startups, 0.8);
    await trait("interest", "Climbing", `Weekly sessions with Sam at Mission Cliffs, ${climbing.length} conversations.`, climbing, 0.8);
    await trait("interest", "Film photography", "You told Jesse you shoot on a Pentax. It hasn't come up in conversation yet.", [], 1, now - 30 * DAY);
    await trait("goal", "Ship Jesse at the hackathon", "You set this two days ago. It took most of your talk time today.", [], 1, at(-2, [21, 0]));
    await trait("goal", "Raise a pre-seed round", "Came up with David and Maya. You mentioned a December target twice.", withTopic("preseed"), 0.8);
    await trait("goal", "Climb V5 by spring", "You mention projecting V4s with Sam most weeks.", climbing.slice(-3), 0.6);
    await trait("personality", "Energized by one-on-ones", "Your mood runs higher one-on-one than in groups.", oneOnOne, 0.7);
    await trait("personality", "Plans out loud", "Most of your goals first came up mid-conversation.", withTopic("preseed"), 0.6);
    await trait("personality", "Night owl", "Your most upbeat conversations often start after 8pm.", evening, 0.5);

    for (let day = -HISTORY_DAYS; day <= 0; day++) {
      const dayId = await computeDayRow(ctx, ownerId, shiftDate(today, day));
      if (dayId !== null && day > -WRITTEN_DAYS) await ctx.scheduler.runAfter(0, internal.writer.writeDay, { dayId });
    }
    await ctx.runMutation(internal.profiles.computeProfile, { ownerId });
    await ctx.scheduler.runAfter(0, internal.profiles.writeIdentity, { ownerId });
    return null;
  },
});
