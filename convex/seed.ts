import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { computeDayRow, localDate, localTime, shiftDate } from "./days";
import { talkMinutes } from "./lib/dayScores";
import { requireUser } from "./lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 20;
const WRITTEN_DAYS = 7;

type ActivityType = NonNullable<Doc<"conversations">["activityType"]>;
type Energy = NonNullable<Doc<"conversations">["energy"]>;
type Channel = NonNullable<Doc<"conversations">["channel"]>;

const PEOPLE = {
  max: { name: "Max", relationship: "work", roleLabel: "Co-founder", cadenceDays: 2, signal: { fun: 2, overlap: 3, depth: 2 } },
  priya: { name: "Priya Raman", relationship: "friend", roleLabel: "Friend", cadenceDays: 7, signal: { fun: 3, overlap: 2, depth: 3 } },
  tomas: { name: "Tomás Herrera", relationship: "work", roleLabel: "Advisor", cadenceDays: 14, signal: { fun: 1, overlap: 3, depth: 2 } },
  wen: { name: "Wen Liu", relationship: "work", roleLabel: "Engineer friend", cadenceDays: undefined, signal: { fun: 2, overlap: 3, depth: 1 } },
  mom: { name: "Mom", relationship: "family", roleLabel: "Mom", cadenceDays: 7, signal: { fun: 1, overlap: 1, depth: 3 } },
  aoife: { name: "Aoife", relationship: "friend", roleLabel: "Friend", cadenceDays: 7, signal: { fun: 3, overlap: 1, depth: 2 } },
} as const;
type PersonKey = keyof typeof PEOPLE;

const PLACES = {
  reveille: { name: "Café Réveille", lat: 37.7605, lng: -122.4214 },
  hackathon: { name: "YC hackathon", lat: 37.7793, lng: -122.3932 },
  tartine: { name: "Tartine", lat: 37.7614, lng: -122.4241 },
  dolores: { name: "Dolores Park", lat: 37.7596, lng: -122.4269 },
  cliffs: { name: "Mission Cliffs", lat: 37.7605, lng: -122.4127 },
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
  newJob: { label: "Her new job", subIdeas: ["Design lead at Figma", "Starting in January"] },
  visa: { label: "Visa paperwork", subIdeas: ["Renewal forms", "Embassy appointment"] },
  thanksgiving: { label: "Thanksgiving", subIdeas: ["Flying home", "Who cooks what"] },
  travel: { label: "Travel", subIdeas: ["Lisbon in spring"] },
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

const build = (day: number, at: [number, number], mins: number, mood = 1, who: PersonKey[] = ["max"]): Talk => ({
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
  day, at: [18, 0], mins, who: ["priya"], place: "cliffs", act: "exercise", mood: 2, energy: "high", mix: [0.05, 0.9, 0.05],
  why: "sent the project, lots of laughing", line: "Climbing session, projecting V4s together", topics: ["climbing"],
});
const priyaMeal = (day: number, at: [number, number], mins = 60): Talk => ({
  day, at, mins, who: ["priya"], place: "tartine", act: "meal", mood: 2, energy: "high", mix: [0.1, 0.8, 0.1],
  why: "easy laughs, caught up properly", line: "Catching up over food: climbing and her new job", topics: ["climbing", "newJob"],
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
  day, at: [12, 45], mins, who: ["max"], place: "tartine", act: "meal", mood: 1, energy: "medium", mix: [0.5, 0.3, 0.2],
  why: "a proper break, good ideas", line: "Lunch with Max: roadmap and fundraising", topics: ["startups"],
});

const OLDER: Talk[] = [
  lunch(-20), walk(-20, [18, 0], 40, ["max"]), build(-20, [10, 0], 220, 0), meeting(-20, [14, 0], 60, 0, ["tomas"], "reveille"), build(-20, [16, 0], 90, 0),
  walk(-19, [11, 0], 70, ["aoife"]), { ...priyaMeal(-19, [13, 0], 60), who: ["aoife", "priya"] }, build(-19, [16, 0], 120),
  meeting(-18, [9, 0], 120, -1, ["max"]), meeting(-18, [13, 0], 120, -1, ["tomas"], "reveille"), build(-18, [16, 0], 90, 0),
  build(-17, [10, 0], 190, 0), climb(-17), priyaMeal(-17, [20, 30], 45),
  lunch(-16), walk(-16, [18, 0], 40, ["max"]), build(-16, [10, 0], 240, 0), momCall(-16, [19, 0], 30),
  lunch(-15), walk(-15, [18, 0], 40, ["max"]), build(-15, [10, 0], 220, 0), meeting(-15, [15, 0], 60, 0, ["tomas"], "reveille"), build(-15, [17, 0], 60, 0),
  build(-14, [10, 0], 190, 0), climb(-14), priyaMeal(-14, [20, 30], 45),
  meeting(-13, [9, 0], 150, -1, ["max"]), meeting(-13, [13, 0], 90, -1, ["tomas"], "reveille"), build(-13, [16, 0], 90, 0),
  lunch(-12), walk(-12, [18, 0], 40, ["max"]), build(-12, [10, 0], 240, 0), momCall(-12, [19, 0], 30),
  {
    day: -12, at: [21, 30], mins: 5, who: ["aoife"], place: "home", act: "social", mood: 1, energy: "low", mix: [0, 0.9, 0.1],
    channel: "imessage", why: "fun texts about her Lisbon plans", line: "Texting about Lisbon in the spring", topics: ["travel"], key: "aoifeText",
  },
  lunch(-11), walk(-11, [18, 0], 40, ["max"]), build(-11, [10, 0], 220, 0), meeting(-11, [14, 0], 60, 0, ["tomas"], "reveille"), build(-11, [16, 0], 90, 0),
  build(-10, [10, 0], 190, 0), climb(-10), priyaMeal(-10, [20, 30], 45),
  walk(-9, [11, 0], 60, ["priya"]), lunch(-9), momCall(-9, [14, 0], 30), build(-9, [16, 0], 120),
  meeting(-8, [9, 0], 120, -1, ["max"]), meeting(-8, [13, 0], 120, -1, ["tomas"], "reveille"), build(-8, [16, 0], 90, 0),
  lunch(-7), walk(-7, [18, 0], 40, ["max"]), build(-7, [10, 0], 240, 0), momCall(-7, [19, 0], 30),
];

const WEEK: Talk[] = [
  build(-6, [10, 0], 180, 0), lunch(-6), meeting(-6, [13, 0], 45, 1, ["tomas"], "reveille"), momCall(-6, [18, 30], 40, 0),
  build(-5, [10, 0], 120, 0), lunch(-5), meeting(-5, [14, 0], 120, -1, ["max"]), meeting(-5, [17, 0], 60, 1, ["tomas"], "reveille"),
  meeting(-4, [9, 0], 45, 0, ["tomas"], "reveille"), build(-4, [10, 0], 150), { ...priyaMeal(-4, [12, 30]), key: "priyaLunchTue" }, walk(-4, [13, 40], 30, ["priya"]), build(-4, [15, 0], 90, 0),
  {
    ...meeting(-3, [9, 0], 150, -1, ["tomas"]), channel: "call", why: "grilled on metrics, felt behind",
    line: "Long investor call about traction and the round", key: "investorCall",
  },
  meeting(-3, [13, 0], 120, -1, ["max"]), build(-3, [16, 0], 60, 0), momCall(-3, [20, 0], 30),
  build(-2, [10, 0], 180, 0), lunch(-2), walk(-2, [17, 0], 60, ["max"]), momCall(-2, [20, 0], 30),
  build(-1, [10, 0], 120), lunch(-1),
  {
    day: -1, at: [14, 0], mins: 45, who: ["wen"], place: "hackathon", act: "meeting", mood: 1, energy: "high", mix: [0.9, 0.05, 0.05],
    why: "quick click, same taste in tools", line: "Met at hackathon check-in, Convex questions", topics: ["convex", "agents"], key: "wenMeet",
  },
  { ...climb(-1), key: "climbFri" }, priyaMeal(-1, [20, 30], 45),
  {
    day: 0, at: [9, 30], mins: 45, who: ["tomas"], place: "reveille", act: "meeting", mood: 1, energy: "medium", mix: [0.7, 0.15, 0.15],
    why: "focused and hopeful about the deck", line: "Pre-seed deck feedback, left with two follow-ups", topics: ["preseed", "startups"], key: "tomasToday",
  },
  {
    day: 0, at: [11, 0], mins: 150, who: ["max", "wen"], place: "hackathon", act: "building", mood: 1, energy: "high", mix: [0.8, 0.05, 0.15],
    why: "heads-down, good momentum", line: "Expo build and Convex schema for Jesse", topics: ["expo", "convex", "agents"], key: "buildToday",
  },
  {
    day: 0, at: [13, 40], mins: 60, who: ["priya"], place: "tartine", act: "meal", mood: 2, energy: "high", mix: [0, 0.9, 0.1],
    why: "laughing about the climbing trip", line: "Lunch: climbing trip plans and her new job", topics: ["climbing", "newJob"], key: "priyaToday",
  },
  {
    day: 0, at: [15, 0], mins: 90, who: ["max"], place: "hackathon", act: "building", mood: -1, energy: "high", mix: [0.75, 0.05, 0.2],
    why: "deadline pressure, talking over each other", line: "Demo plan under deadline", topics: ["demo", "agents"], key: "demoToday",
  },
  {
    day: 0, at: [19, 10], mins: 25, who: ["mom"], place: "dolores", act: "outdoors", mood: 1, energy: "low", mix: [0, 0.7, 0.3],
    channel: "call", why: "calm walk, sorting out paperwork", line: "Visa paperwork and Thanksgiving plans", topics: ["visa", "thanksgiving"], key: "momToday",
  },
];

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

    const personIds = {} as Record<PersonKey, Id<"people">>;
    for (const [key, p] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
      personIds[key] = await ctx.db.insert("people", {
        ownerId, name: p.name, relationship: p.relationship, roleLabel: p.roleLabel, cadenceDays: p.cadenceDays,
        facts: [], lastSeenAt: 0, conversationCount: 0,
      });
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
    const promises: Partial<Record<PersonKey, Doc<"people">["openPromises"]>> = {};
    const promise = async (direction: "you_owe" | "they_owe", text: string, person: PersonKey, key: string, dueDay?: number) => {
      const conversationId = byKey(key);
      const itemId = await item(direction, text, person, conversationId, dueDay);
      promises[person] = [...(promises[person] ?? []), { text, direction, conversationIds: [conversationId], itemId }];
    };
    await promise("you_owe", "Send Tomás the revised pre-seed deck", "tomas", "tomasToday", 2);
    await promise("they_owe", "Tomás intros you to two angels", "tomas", "tomasToday");
    await promise("you_owe", "Book the Bishop climbing weekend", "priya", "priyaToday", 5);
    await promise("they_owe", "Priya sends her Figma offer details", "priya", "priyaToday");
    await promise("you_owe", "Send Mom the visa renewal forms", "mom", "momToday", 1);
    await promise("they_owe", "Wen shares her Convex schema notes", "wen", "buildToday");
    await promise("you_owe", "Reply to Aoife about Lisbon dates", "aoife", "aoifeText");

    const sourced = (text: string, key: string) => ({ text, conversationIds: [byKey(key)] });
    const profiles: Record<PersonKey, Partial<Doc<"people">>> = {
      max: {
        from: sourced("Grew up in Austin", "buildToday"),
        workingOn: sourced("Jesse: the demo and the Expo build", "demoToday"),
        interests: [sourced("AI agents", "buildToday"), sourced("Fundraising", "demoToday")],
        whatMatters: [sourced("Shipping something people love", "buildToday")],
        howWeMet: sourced("Met at a hackathon two years ago", "buildToday"),
        giftIdeas: [sourced("Good espresso beans", "demoToday")],
        relationshipSummary: "Your co-founder. Most of your days are built around him; productive, tense near deadlines.",
      },
      priya: {
        from: sourced("Grew up in Pune, moved to SF for college", "priyaLunchTue"),
        workingOn: sourced("Starting a design lead role at Figma", "priyaToday"),
        interests: [sourced("Climbing", "climbFri"), sourced("Travel", "priyaToday")],
        whatMatters: [sourced("Making time for friends outside work", "priyaLunchTue")],
        birthday: sourced("March 3", "climbFri"),
        howWeMet: sourced("Met at Mission Cliffs", "climbFri"),
        family: [sourced("Younger brother in Toronto", "priyaLunchTue")],
        lifeEvents: [sourced("New job at Figma in January", "priyaToday")],
        giftIdeas: [sourced("Chalk bag from Bishop", "climbFri")],
        relationshipSummary: "Close friend and climbing partner. Your best-mood days usually include her.",
      },
      tomas: {
        from: sourced("From Mexico City", "tomasToday"),
        workingOn: sourced("Advising three pre-seed startups", "tomasToday"),
        interests: [sourced("Startups", "tomasToday")],
        whatMatters: [sourced("A crisp story in the deck", "tomasToday")],
        howWeMet: sourced("Intro through a YC founder", "investorCall"),
        relationshipSummary: "Your advisor on the pre-seed round. Focused, practical meetings.",
      },
      wen: {
        workingOn: sourced("Convex schema for Jesse", "buildToday"),
        interests: [sourced("Convex", "wenMeet"), sourced("Side projects", "buildToday")],
        howWeMet: sourced("Hackathon check-in this week", "wenMeet"),
        relationshipSummary: "New this week. An engineer friend from the hackathon.",
      },
      mom: {
        from: sourced("Lives in Sacramento", "momToday"),
        whatMatters: [sourced("You coming home for Thanksgiving", "momToday")],
        family: [sourced("Your aunt is visiting in December", "momToday")],
        lifeEvents: [sourced("Visa renewal underway", "momToday")],
        relationshipSummary: "Family. Weekly calls, mostly logistics and plans.",
      },
      aoife: {
        from: sourced("From Dublin", "aoifeText"),
        interests: [sourced("Travel", "aoifeText")],
        lifeEvents: [sourced("Planning Lisbon in the spring", "aoifeText")],
        relationshipSummary: "Friend you usually catch up with weekly. Mostly texts lately.",
      },
    };
    for (const key of Object.keys(PEOPLE) as PersonKey[]) {
      const rows = withPerson(key);
      const last = Math.max(...rows.map((s) => s.doc.startedAt));
      const labels = [...new Set(rows.flatMap((s) => s.talk.topics.map((t) => TOPICS[t].label)))];
      const signals = rows.flatMap((s) => s.doc.personSignals ?? []).filter((x) => x.personId === personIds[key]);
      const score = (pick: (x: { fun: number; overlap: number; depth: number }) => number) =>
        Math.round((signals.reduce((sum, x) => sum + pick(x), 0) / signals.length / 3) * 100);
      await ctx.db.patch("people", personIds[key], {
        ...profiles[key],
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
    await trait("interest", "AI agents", `Your most-discussed topic this month, in ${agents.length} conversations, mostly with Max and Wen.`, agents, 0.9);
    await trait("interest", "Startups", `Fundraising and pitch decks came up in ${startups.length} conversations.`, startups, 0.8);
    await trait("interest", "Climbing", `Weekly sessions with Priya at Mission Cliffs, ${climbing.length} conversations.`, climbing, 0.8);
    await trait("interest", "Film photography", "You told Jesse you shoot on a Pentax. It hasn't come up in conversation yet.", [], 1, now - 30 * DAY);
    await trait("goal", "Ship Jesse at the hackathon", "You set this two days ago. It took most of your talk time today.", [], 1, at(-2, [21, 0]));
    await trait("goal", "Raise a pre-seed round", "Came up with Tomás and Max. You mentioned a December target twice.", withTopic("preseed"), 0.8);
    await trait("goal", "Climb V5 by spring", "You mention projecting V4s with Priya most weeks.", climbing.slice(-3), 0.6);
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
