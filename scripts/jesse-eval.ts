/**
 * Scripted conversations against Jesse's real Talk prompt and context builder.
 * Run: OPENAI_API_KEY=... bun scripts/jesse-eval.ts > eval.md
 * Fails if any reply or opening line has a clock time, a list, meta talk, or more than one question.
 */
import { buildTalkMessages, chatJson, dayBounds, parseTalkReply, talkSystemPrompt, TALK_REPLY_SCHEMA, type History, type Memory, type Today } from "../convex/jesse";
import { greetingLine } from "../src/components/greeting";

const HOUR = 60 * 60 * 1000;
const timeZone = "America/Los_Angeles";
const now = Date.now();
const { start } = dayBounds(now, timeZone);

const today: Today = {
  conversations: [
    {
      startedAt: start + 8 * HOUR + 10 * 60 * 1000,
      place: "home",
      people: ["Mom"],
      gist: ["Mom's knee surgery pushed back", "Mom scared, wants company at 9:30 consult"],
      mood: -1,
      moodReason: "worried about Mom",
    },
    {
      startedAt: start + 12 * HOUR + 40 * 60 * 1000,
      place: "Ramen Nagi",
      people: ["Sam"],
      gist: ["Sam's Stripe final round Friday 4pm", "Whether to leave the startup too"],
      mood: 2,
      moodReason: "laughing a lot, big news",
    },
    {
      startedAt: start + 15 * HOUR + 15 * 60 * 1000,
      place: "the office",
      people: ["Priya"],
      gist: ["Sprint planning", "Demo moved to 5:30pm"],
      mood: 0,
      moodReason: null,
    },
  ],
  items: [
    { kind: "plan", text: "Text Sam good luck before the 4pm interview", person: "Sam", dueAt: start + 4 * 24 * HOUR + 15 * HOUR },
    { kind: "you_owe", text: "Call Mom back at 7:30", person: "Mom", dueAt: start + 19.5 * HOUR },
  ],
  people: [
    { name: "Mom", archetype: "mom", facts: ["Has a bad knee"] },
    { name: "Sam", archetype: "college friend", facts: ["Interviewing at Stripe"] },
    { name: "Priya", archetype: "coworker", facts: [] },
  ],
};

const memory: Memory = {
  people: [{ id: "p1" as never, name: "Sam", archetype: "college friend", facts: ["Interviewing at Stripe"], lastSeenAt: start + 12.7 * HOUR, conversationCount: 6 }],
  items: [{ kind: "goal", text: "Figure out whether to stay at the startup", person: null, dueAt: null, importance: 3 }],
  topics: [{ label: "Career change", subIdeas: ["leaving the startup", "Stripe"], conversationCount: 4, peopleCount: 2 }],
  conversations: [],
  reflections: [],
};

const system = talkSystemPrompt(today, memory, [], timeZone, now);
const opener = greetingLine("Ui", [
  { status: "done", mood: 2, place: "lunch", people: [{ name: "Sam Lee" }] },
  { status: "done", mood: -1, place: "home", people: [{ name: "Mom" }] },
] as never);

const emptySystem = talkSystemPrompt({ conversations: [], items: [], people: [] }, { people: [], items: [], topics: [], conversations: [], reflections: [] }, [], timeZone, now);

const scenarios: { name: string; opener?: string; turns: string[]; expectMood?: string[]; system?: string; invented?: RegExp }[] = [
  { name: "Greeting, then 'what should we talk about', then a follow-up", opener, turns: ["hey jesse!", "good! kinda long day", "what should we talk about?", "honestly I think he's gonna crush it"] },
  { name: "A sad day", turns: ["ugh. today was rough", "my mom's surgery got pushed and I'm kind of freaking out"], expectMood: ["low", "stressed"] },
  { name: "An excited day", turns: ["JESSE. I got into the accelerator!!!", "yeah!! we meet the cohort next week, I can't stop smiling"], expectMood: ["up"] },
  { name: "Fishing for times", turns: ["what happened at lunch again?", "wait what time was that?"] },
  { name: "Nothing captured yet (must not invent a day)", opener: greetingLine("Ui", []), turns: ["hey jesse", "what should we talk about?"], system: emptySystem, invented: /\b(mom|sam|stripe|priya|surgery|lunch|ramen)\b/i },
];

const CHECKS: [string, RegExp][] = [
  ["clock time", /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?m\b|o'clock/i],
  ["list", /(^|\n)\s*([-*•]|\d+[.)])\s|\n\s*\n/],
  ["meta talk", /\b(transcripts?|recordings?|recorded|my notes|the notes|data|timestamps?|conversation #|as an ai|language model)\b/i],
];

function problems(text: string, mood?: string, expectMood?: string[], invented?: RegExp) {
  const found = CHECKS.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (invented?.test(text)) found.push("invented a day that wasn't captured");
  const questions = (text.match(/[^.!?]*\?/g) ?? []).filter((q) => q.trim().split(/\s+/).length > 2);
  if (questions.length > 1) found.push("more than one question");
  if (mood && expectMood && !expectMood.includes(mood)) found.push(`mood ${mood}, expected ${expectMood.join("/")}`);
  return found;
}

const out: string[] = [];
let failures = 0;
const record = (who: string, text: string, issues: string[], mood?: string) => {
  out.push(`> **${who}:** ${text}${mood ? ` _(mood: ${mood})_` : ""}${issues.length ? ` **FAIL: ${issues.join(", ")}**` : ""}`, ">");
  failures += issues.length ? 1 : 0;
};

for (const scenario of scenarios) {
  out.push(`#### ${scenario.name}`, "");
  const history: History = [];
  if (scenario.opener) {
    history.push({ role: "jesse", text: scenario.opener });
    record("Jesse (opening line)", scenario.opener, problems(scenario.opener));
  }
  for (const turn of scenario.turns) {
    const raw = await chatJson<unknown>(scenario.system ?? system, buildTalkMessages(history, turn), TALK_REPLY_SCHEMA);
    let reply: { answer: string; mood: string };
    try {
      reply = parseTalkReply(raw);
    } catch {
      reply = { answer: `(no answer: ${JSON.stringify(raw)})`, mood: "none" };
    }
    record("You", turn, []);
    record("Jesse", reply.answer, problems(reply.answer, reply.mood, scenario.expectMood, scenario.invented), reply.mood);
    history.push({ role: "user", text: turn }, { role: "jesse", text: reply.answer });
  }
  out.pop();
  out.push("");
}
out.push(failures ? `**${failures} replies failed the checks.**` : "All replies passed: no clock times, lists, meta talk or double questions, and moods matched.");
const report = out.join("\n");
console.log(report);
process.exit(failures ? 1 : 0);
