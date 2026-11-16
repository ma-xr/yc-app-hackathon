import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { addInteraction, deleteInteraction } from "./lib/contactStats";
import { upsertContacts, type SyncContact } from "./lib/contactSync";

const DAY = 24 * 60 * 60 * 1000;
const PT_OFFSET_HOURS = 8;

type Kind = Doc<"interactions">["kind"];
type FactKind = NonNullable<Doc<"people">["profile"]>[number]["kind"];
type Fact = [FactKind, string, number];

type Moment = {
  d: number;
  h: number;
  kind: Kind;
  min: number;
  place?: string;
  title: string;
  points: string[];
  depth: number;
  fun: number;
  shared?: string[];
};

type Category = { titles: string[]; places: string[]; points: string[] };

type Spec = {
  key: string;
  name: string;
  avatar: string;
  phone: string;
  email?: string;
  birthday?: { month: number; day: number; year?: number };
  facts: Fact[];
  history: {
    count: number;
    years: number;
    cats: string[];
    mix: [number, number, number];
    minutes: [number, number];
    depth: number;
    fun: number;
    shared: string[];
    sharedCount: [number, number];
    points?: string[];
  };
  recent?: Moment[];
  promises?: { kind: "you_owe" | "they_owe"; text: string; dueInDays?: number; importance: number }[];
};

type Built = Omit<Doc<"interactions">, "_id" | "_creationTime" | "ownerId" | "personId" | "conversationId">;

const CATS: Record<string, Category> = {
  climb: {
    titles: ["Bouldering at Mission Cliffs", "Session at Dogpatch Boulders", "Castle Rock day trip", "Tuesday night climbing", "Projecting the cave problem", "Indian Rock sunset session"],
    places: ["Mission Cliffs", "Dogpatch Boulders", "Castle Rock State Park", "Indian Rock, Berkeley", "Planet Granite SF"],
    points: ["Finally sent the overhang V5", "Swapped beta on the crimpy traverse", "Talked about a Bishop trip in spring", "Tweaked a finger pulley, taking it easy", "Compared notes on hangboard routines", "Debated whether gyms are getting too crowded"],
  },
  founder: {
    titles: ["Whiteboard session on onboarding", "Late night shipping session", "Investor meeting prep", "Weekly planning", "User interview debrief", "Pricing debate", "Demo rehearsal", "Roadmap reset"],
    places: ["YC office, Dogpatch", "Coupa Café, Palo Alto", "Stanford campus", "Sightglass Coffee", "Home office in the Mission"],
    points: ["Cut the settings screen from v1", "Three users asked for the same export feature", "Agreed to ship daily until demo day", "Argued about freemium vs. paid pilot", "Rewrote the pitch opening twice", "Decided to hire a founding engineer in Q1", "Burn is fine through next summer", "Retention dipped after the redesign"],
  },
  friend: {
    titles: ["Dinner in the Mission", "Coffee catch-up", "Walk up Bernal Hill", "Afternoon at Dolores Park", "Drinks at Zeitgeist", "Brunch at Tartine", "Walk around Lands End"],
    places: ["Tartine Manufactory", "Dolores Park", "Bernal Hill", "Ritual Coffee on Valencia", "Zeitgeist", "Lands End Trail", "Foreign Cinema", "Philz Coffee, 24th St"],
    points: ["Caught up on dating lives", "Talked about how burnt out everyone is", "Made a plan to get more people to dinner", "Shared what we're each reading", "Talked about moving apartments", "Swapped podcast recommendations", "Vented about the housing market", "Talked about what we want next year to look like"],
  },
  family: {
    titles: ["Sunday visit", "Weekend visit home", "Holiday dinner", "Dim sum together"],
    places: ["Home in Sacramento", "Thanksgiving at home", "Dim sum in the Richmond"],
    points: ["Talked about Thanksgiving plans", "Heard about the garden and the tomatoes", "Promised to visit more this winter", "Shared updates on the startup", "Talked about Grandma's health", "Planned a family trip for spring"],
  },
  home: {
    titles: ["Cooking dinner at home", "House meeting", "Grocery run at Bi-Rite", "Movie night at home", "Late night kitchen talk", "Fixing the wifi again"],
    places: ["Home in the Mission", "Bi-Rite Market", "Home in the Mission", "Lucca Ravioli"],
    points: ["Split the PG&E bill", "Planned who gets the big room", "Agreed on a chore rotation", "Watched a terrible horror movie", "Talked about AI and his job", "Made way too much dal"],
  },
  run: {
    titles: ["Saturday run on Crissy Field", "Run club on the Embarcadero", "Golden Gate Park loop", "Long run to the bridge"],
    places: ["Crissy Field", "Embarcadero", "Golden Gate Park", "Presidio"],
    points: ["Negative splits for the first time", "Signed up for the SF half", "Talked about recovery and sleep", "Ran into half the run club at the bridge"],
  },
  surf: {
    titles: ["Dawn patrol at Ocean Beach", "Pacifica surf session", "Linda Mar on a small day", "Surf trip to Santa Cruz"],
    places: ["Ocean Beach", "Linda Mar, Pacifica", "Steamer Lane, Santa Cruz", "Andytown Coffee"],
    points: ["Got caught inside on a big set", "Talked about buying a longer board", "Breakfast burritos after", "Water was freezing but glassy"],
  },
  work: {
    titles: ["Coffee chat", "Office hours", "Founder dinner", "Intro meeting", "Fundraising check-in", "Advice on hiring"],
    places: ["YC office, Dogpatch", "Blue Bottle, Mint Plaza", "Sightglass Coffee", "Stanford campus", "Zuni Café"],
    points: ["Advice: talk to users before writing code", "Suggested a narrower beachhead market", "Offered two warm intros", "Pushed back on the valuation", "Told the story of their first pivot", "Recommended a lawyer for the SAFE"],
  },
};

const CALL_TITLES = ["Phone catch-up", "Long call", "Quick call", "Late night call", "Walk-and-talk call"];
const TEXT_TITLES = ["Long text thread", "Texting about the weekend", "Voice memos back and forth", "Late night texts"];

function at(now: number, daysAgo: number, hour: number) {
  const shifted = now - PT_OFFSET_HOURS * 60 * 60 * 1000;
  const today = shifted - (shifted % DAY) + PT_OFFSET_HOURS * 60 * 60 * 1000;
  return today - daysAgo * DAY + Math.round(hour * 60) * 60 * 1000;
}

function prng(seed: string) {
  let a = 0;
  for (const ch of seed) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number) => Math.max(1, Math.min(5, Math.round(x)));

const SPECS: Spec[] = [
  {
    key: "demo-01", name: "Maya Chen", avatar: "p08", phone: "+1 650 555 0142", email: "maya@jesse.app",
    birthday: { month: 3, day: 9, year: 1999 },
    facts: [
      ["relationship", "Cofounder", 600], ["how_met", "CS 161 problem-set partners at Stanford, sophomore year", 1300],
      ["from", "Grew up in Cupertino, parents run a dental practice", 1100], ["working_on", "Leading the Jesse iOS app and the on-device pipeline", 30],
      ["interest", "Ceramics on Sunday mornings", 400], ["interest", "Competitive Tetris", 700], ["interest", "Taiwanese night markets", 300], ["interest", "Long-form interviews and podcasts", 200],
      ["matters", "Shipping things she is proud of, not just fast", 90], ["family", "Younger brother Kevin is a freshman at UCLA", 500],
      ["life_event", "Turned down a Jane Street offer to start the company", 420], ["place", "The corner table at Coupa Café", 250],
      ["gift_idea", "A glaze set from Clay by the Bay", 60], ["style", "Direct, thinks out loud on a whiteboard, hates vague plans", 150],
      ["food", "Beef noodle soup, anything with chili crisp", 330], ["avoid", "Don't schedule anything before 10am", 120],
    ],
    history: { count: 46, years: 2.5, cats: ["founder", "founder", "friend"], mix: [0.75, 0.1, 0.15], minutes: [45, 180], depth: 3.4, fun: 3.2, shared: ["startups", "AI agents", "design", "product"], sharedCount: [2, 3],
      points: ["Talked about how to tell parents about dropping a class", "Split up the YC application questions", "Agreed Jesse should never store audio"] },
    recent: [
      { d: 0, h: 9.5, kind: "in_person", min: 170, place: "YC office, Dogpatch", title: "Hackathon build sprint", points: ["Wired the Contacts tab to Convex", "Agreed the demo opens on Home, not Contacts", "Maya owns the walkthrough script"], depth: 3, fun: 4, shared: ["startups", "AI agents", "product"] },
      { d: 2, h: 21, kind: "call", min: 55, title: "Demo day nerves", points: ["Maya worried the live demo will crash", "Decided on a recorded backup video", "Talked about what success looks like next month"], depth: 4, fun: 3, shared: ["startups", "product"] },
      { d: 4, h: 14, kind: "in_person", min: 120, place: "Coupa Café, Palo Alto", title: "Investor update draft", points: ["Wrote the November investor update together", "Weekly actives up 40% after the reminders feature", "Need a sharper one-liner"], depth: 3, fun: 3, shared: ["startups", "design"] },
      { d: 9, h: 19, kind: "in_person", min: 95, place: "Foreign Cinema", title: "Six-month founder check-in", points: ["Honest talk about splitting the CEO work", "Both want more time with users", "Maya wants to hire a designer early"], depth: 5, fun: 3, shared: ["startups", "design", "product"] },
    ],
    promises: [{ kind: "you_owe", text: "Send Maya the investor update draft", dueInDays: 1, importance: 4 }],
  },
  {
    key: "demo-02", name: "Dev Patel", avatar: "p02", phone: "+1 415 555 0178", email: "devpatel@gmail.com",
    birthday: { month: 7, day: 22, year: 1998 },
    facts: [
      ["relationship", "Roommate", 700], ["how_met", "Craigslist room listing that turned into a friendship", 720],
      ["from", "Edison, New Jersey", 680], ["working_on", "ML infra at Databricks, worried about AI changing his team", 20],
      ["interest", "Cricket, follows the IPL obsessively", 500], ["interest", "Homemade biryani experiments", 300], ["interest", "Horror movies", 200],
      ["matters", "Being fair with money, hates awkward Venmo requests", 6], ["family", "Older sister Riya is a doctor in Boston", 400],
      ["life_event", "Got promoted to senior engineer in September", 70], ["place", "Lucca Ravioli for late-night sandwiches", 250],
      ["gift_idea", "A good cast-iron pan, he keeps borrowing yours", 40], ["style", "Dry humor, opens up late at night in the kitchen", 180],
      ["food", "Spicy everything, Dosa on Valencia", 260], ["avoid", "Don't bring up his ex, Priyanka", 150],
    ],
    history: { count: 52, years: 2, cats: ["home", "home", "friend"], mix: [0.8, 0.02, 0.18], minutes: [10, 50], depth: 2.6, fun: 3.8, shared: ["cooking", "movies", "AI"], sharedCount: [0, 2] },
    recent: [
      { d: 1, h: 20, kind: "in_person", min: 60, place: "Zeitgeist", title: "Rent split over drinks", points: ["Split rent by room size and sunlight", "Third roommate should start in January", "He'll post the listing this week"], depth: 3, fun: 4, shared: ["money"] },
      { d: 3, h: 22.5, kind: "in_person", min: 35, place: "Home in the Mission", title: "Late night kitchen talk", points: ["He's not sure AI will leave his team intact", "Thinking about a master's in robotics", "Ate the leftover biryani"], depth: 4, fun: 3, shared: ["AI", "cooking"] },
      { d: 5, h: 12.5, kind: "in_person", min: 50, place: "Dosa on Valencia", title: "Lunch about the third roommate", points: ["Looking for a third roommate in January", "Venmo makes splitting bills awkward", "Entry-level coding jobs are changing fastest"], depth: 3, fun: 3, shared: ["AI", "money"] },
    ],
  },
  {
    key: "demo-03", name: "Sam Rivera", avatar: "p01", phone: "+1 415 555 0123", email: "sam.rivera@hey.com",
    birthday: { month: 11, day: 27, year: 1999 },
    facts: [
      ["relationship", "Climbing friend", 500], ["how_met", "Belayed each other at Mission Cliffs on a busy Tuesday", 900],
      ["from", "San Antonio, Texas", 800], ["working_on", "Interviewing at Stripe, system design round on Friday", 1],
      ["interest", "Outdoor bouldering in Bishop", 600], ["interest", "Film photography", 300], ["interest", "Mechanical keyboards", 200], ["interest", "Group trip planning", 100],
      ["matters", "Feeling like he's doing work that matters", 40], ["family", "Twin sister Ana lives in Austin", 450],
      ["life_event", "Left his consulting job in August to find something better", 100], ["place", "Sightglass on 7th after climbing", 220],
      ["gift_idea", "A roll of Portra 400", 30], ["style", "Gets nervous before big things, opens up when you ask specifics", 1],
      ["food", "Tacos at La Taqueria, no rice", 300], ["avoid", "Don't joke about his consulting years", 160],
    ],
    history: { count: 30, years: 2.5, cats: ["climb", "climb", "friend"], mix: [0.8, 0.05, 0.15], minutes: [40, 150], depth: 2.9, fun: 4, shared: ["climbing", "photography", "careers", "travel"], sharedCount: [1, 3] },
    recent: [
      { d: 1, h: 16.2, kind: "in_person", min: 45, place: "Sightglass Coffee", title: "Coffee before the Stripe interview", points: ["Stripe interview Friday, nervous about system design", "You offered lunch this week", "Thinks calendars are the hard part of group plans"], depth: 4, fun: 3, shared: ["careers"] },
      { d: 6, h: 19, kind: "in_person", min: 110, place: "Mission Cliffs", title: "Tuesday night climbing", points: ["Flashed the new purple V4", "Talked through his offer options", "Wants to do Bishop over New Year's"], depth: 3, fun: 5, shared: ["climbing", "careers", "travel"] },
      { d: 12, h: 18, kind: "text", min: 20, title: "Mock interview questions", points: ["Sent him three system design prompts", "He designed a rate limiter at 1am", "Agreed to do a live mock next week"], depth: 2, fun: 3, shared: ["careers"] },
    ],
  },
  {
    key: "demo-04", name: "Lena Ortiz", avatar: "p03", phone: "+1 510 555 0191", email: "lena.ortiz@gmail.com",
    birthday: { month: 11, day: 19, year: 1999 },
    facts: [
      ["relationship", "Close friend", 900], ["how_met", "Same dorm floor freshman year, stayed up until 4am talking", 1400],
      ["from", "Fresno, raised by her grandmother", 1200], ["working_on", "Product manager at Figma, frustrated her manager forgets their 1:1s", 2],
      ["interest", "Poetry, especially Ada Limón", 700], ["interest", "Salsa dancing", 400], ["interest", "Japan, saving for a Kyoto trip", 60],
      ["matters", "Showing up for people without being asked", 2], ["family", "Sister Carmen visits next weekend", 2],
      ["life_event", "Her grandmother passed away last spring", 210], ["place", "Walks up Bernal Hill on Sunday mornings", 300],
      ["gift_idea", "A signed copy of The Carrying", 50], ["style", "Asks the second question, comfortable with silence", 400],
      ["food", "Pupusas, and she bakes when she's anxious", 350], ["avoid", "Don't make plans around her grandmother's birthday in March", 200],
    ],
    history: { count: 34, years: 3.5, cats: ["friend", "friend"], mix: [0.65, 0.2, 0.15], minutes: [40, 150], depth: 4.6, fun: 3.4, shared: ["poetry", "relationships", "travel", "careers"], sharedCount: [1, 3],
      points: ["Talked about grief and how it comes in waves", "She asked how I'm actually doing with the startup", "Talked about what makes a friendship last after college"] },
    recent: [
      { d: 2, h: 19.5, kind: "in_person", min: 80, place: "Foreign Cinema", title: "Dinner, sister's visit coming up", points: ["Her sister visits next weekend", "Her manager forgets 1:1 notes", "You both wait for the other one to text first"], depth: 5, fun: 3, shared: ["relationships", "careers"] },
      { d: 8, h: 9, kind: "in_person", min: 70, place: "Bernal Hill", title: "Sunday walk up Bernal", points: ["Talked about her grandmother's recipes", "She's saving for Kyoto in April", "You promised her your Kyoto list"], depth: 5, fun: 4, shared: ["travel", "relationships"] },
      { d: 15, h: 21, kind: "call", min: 65, title: "Late call about her job", points: ["She might ask for a new manager", "Practiced what she'd say", "Laughed about the dorm fire alarm story"], depth: 4, fun: 4, shared: ["careers"] },
    ],
    promises: [{ kind: "you_owe", text: "Send Lena your Kyoto list", importance: 3 }],
  },
  {
    key: "demo-05", name: "Noah Kim", avatar: "p09", phone: "+1 415 555 0107", email: "noahkim@icloud.com",
    birthday: { month: 11, day: 26, year: 1998 },
    facts: [
      ["relationship", "Best friend since high school", 1400], ["how_met", "Robotics team in 9th grade in Sacramento", 1450],
      ["from", "Sacramento, same high school", 1400], ["working_on", "Architecture firm, designing a library in Oakland", 25],
      ["interest", "Backpacking the Sierra", 800], ["interest", "Jazz records", 500], ["interest", "Fantasy football", 300], ["interest", "Woodworking", 150],
      ["matters", "Loyalty and keeping traditions alive", 400], ["family", "Partner Emily Park, together 4 years", 700],
      ["life_event", "Planning to propose to Emily in the spring", 3], ["place", "Annual Desolation Wilderness trip", 400],
      ["gift_idea", "A Blue Note Tone Poet vinyl", 45], ["style", "Few words, very loyal, jokes when things get heavy", 600],
      ["food", "Korean BBQ, Jeju-style pork", 300], ["avoid", "Don't tell Emily about the proposal", 3],
    ],
    history: { count: 30, years: 4, cats: ["friend", "friend", "family"], mix: [0.6, 0.2, 0.2], minutes: [30, 180], depth: 3.8, fun: 4.2, shared: ["backpacking", "music", "design", "sports"], sharedCount: [1, 3] },
    recent: [
      { d: 3, h: 19, kind: "in_person", min: 140, place: "Daeho Kalbijjim, Japantown", title: "He's going to propose", points: ["Planning to propose to Emily in the spring", "Asked you to help pick the spot", "Ring budget anxiety"], depth: 5, fun: 4, shared: ["relationships"] },
      { d: 10, h: 12, kind: "call", min: 40, title: "Fantasy football trash talk", points: ["He's 7-2, you're 3-6", "Planning the draft party next year", "Talked about his library project"], depth: 2, fun: 5, shared: ["sports", "design"] },
      { d: 21, h: 8, kind: "in_person", min: 175, place: "Mount Tamalpais", title: "Hike up Mount Tam", points: ["Talked about turning 28", "He wants you to be best man someday", "Planned the summer backpacking trip"], depth: 5, fun: 4, shared: ["backpacking"] },
    ],
    promises: [{ kind: "you_owe", text: "Return Noah's camping stove", importance: 3 }],
  },
  {
    key: "demo-06", name: "Mom", avatar: "p05", phone: "+1 916 555 0164", email: "linda.home@gmail.com",
    birthday: { month: 2, day: 14, year: 1968 },
    facts: [
      ["relationship", "Mom", 1400], ["from", "Sacramento, same house for 25 years", 1400],
      ["working_on", "Retiring from teaching 4th grade next June", 100], ["interest", "Gardening, especially heirloom tomatoes", 600], ["interest", "Mystery novels", 400], ["interest", "Learning Italian on Duolingo", 120],
      ["matters", "Hearing from you more than on holidays", 16], ["family", "Married to Dad (Tom) for 32 years", 1400],
      ["life_event", "Reminded you your passport expires before March", 16], ["place", "The farmers market on Sunday mornings", 500],
      ["gift_idea", "Italian cooking class in Sacramento", 80], ["style", "Worries, asks lots of questions, loves details", 700],
      ["food", "Her lasagna for every birthday", 900], ["avoid", "Don't float dropping out of Stanford", 300],
    ],
    history: { count: 30, years: 4, cats: ["family"], mix: [0.15, 0.7, 0.15], minutes: [15, 60], depth: 3.6, fun: 3, shared: ["family", "books", "cooking"], sharedCount: [0, 2] },
    recent: [
      { d: 16, h: 18, kind: "call", min: 25, title: "Passport and holidays", points: ["Passport expires before March", "She notices when you only call on holidays", "Thanksgiving is at Aunt Carol's"], depth: 4, fun: 2, shared: ["family"] },
      { d: 30, h: 17, kind: "call", min: 45, title: "Her retirement plans", points: ["Retiring next June after 30 years", "Wants to spend a month in Italy", "Asked if the startup pays you yet"], depth: 4, fun: 3, shared: ["family", "travel"] },
    ],
  },
  {
    key: "demo-07", name: "Tomás Herrera", avatar: "p14", phone: "+1 415 555 0133", email: "tomas.herrera@proton.me",
    birthday: { month: 5, day: 3, year: 1991 },
    facts: [
      ["relationship", "Climbing partner", 800], ["how_met", "Paired up at a Yosemite trad climbing clinic", 1000],
      ["from", "Guadalajara, moved to Oakland at 20", 900], ["working_on", "Opening his own physical therapy clinic in Rockridge", 15],
      ["interest", "Trad climbing in Yosemite", 900], ["interest", "Mezcal tasting", 400], ["interest", "Trail running", 300], ["interest", "Photography", 200],
      ["matters", "Trust; he says a rope partner is family", 600], ["family", "Wife Daniela, daughter Luna (4)", 700],
      ["life_event", "Luna started preschool in September", 70], ["place", "Castle Rock on cold sunny Saturdays", 300],
      ["gift_idea", "A new ATC Guide belay device", 60], ["style", "Calm, teaches without lecturing, laughs a lot", 500],
      ["food", "Birria tacos at Tacos El Gordo", 300], ["avoid", "Don't flake on climbing days, he books a sitter", 200],
    ],
    history: { count: 30, years: 3, cats: ["climb", "climb", "climb", "friend"], mix: [0.9, 0.04, 0.06], minutes: [90, 240], depth: 3.2, fun: 4.4, shared: ["climbing", "photography", "trail running", "outdoors", "travel"], sharedCount: [3, 4] },
    recent: [
      { d: 7, h: 8, kind: "in_person", min: 300, place: "Castle Rock State Park", title: "Castle Rock day trip", points: ["Led Boy Scout Route clean", "He's signing the clinic lease next week", "Plotting a Yosemite weekend in May"], depth: 3, fun: 5, shared: ["climbing", "outdoors", "photography", "travel"] },
      { d: 18, h: 18.5, kind: "in_person", min: 120, place: "Mission Cliffs", title: "Rope gym after work", points: ["Worked the 5.11c in the corner", "Talked about being a dad and a founder", "Luna loves preschool"], depth: 4, fun: 4, shared: ["climbing", "outdoors", "trail running"] },
    ],
    promises: [{ kind: "they_owe", text: "Tomás sends the Yosemite permit dates", importance: 3 }],
  },
  {
    key: "demo-08", name: "Ben Carter", avatar: "p20", phone: "+1 650 555 0119", email: "bencarter@gmail.com",
    birthday: { month: 8, day: 30, year: 1999 },
    facts: [
      ["relationship", "Freshman roommate", 1300], ["how_met", "Assigned roommates in Wilbur Hall", 1400],
      ["from", "Boise, Idaho", 1300], ["working_on", "Stand-up open mics on top of a job at Google Maps", 30],
      ["interest", "Stand-up comedy", 600], ["interest", "Giants baseball", 500], ["interest", "Board games, especially Catan", 400], ["interest", "Karaoke", 200],
      ["matters", "Making people laugh when things are hard", 300], ["family", "Three younger brothers, all wrestlers", 900],
      ["life_event", "First paid comedy set at the Punch Line", 5], ["place", "The Giants bleachers", 400],
      ["gift_idea", "Tickets to see a comic at Cobb's", 50], ["style", "Bits all the way down, sincere once a night", 500],
      ["food", "Garlic fries, In-N-Out after midnight", 400], ["avoid", "Don't let him pick the karaoke song", 300],
    ],
    history: { count: 26, years: 3.5, cats: ["friend", "friend"], mix: [0.7, 0.05, 0.25], minutes: [30, 150], depth: 2.1, fun: 4.9, shared: ["comedy", "sports", "board games"], sharedCount: [1, 2],
      points: ["Cried laughing at his new bit about Waymos", "Lost at Catan again", "He did the Wilbur Hall fire drill story"] },
    recent: [
      { d: 5, h: 21, kind: "in_person", min: 120, place: "The Punch Line", title: "His first paid set", points: ["His Waymo bit killed", "Met his comedy friends after", "He wants to do the Moth next"], depth: 2, fun: 5, shared: ["comedy"] },
      { d: 13, h: 19, kind: "in_person", min: 180, place: "Oracle Park", title: "Giants game, bleachers", points: ["Garlic fries, too many", "He paid for both tickets", "Talked about his brothers"], depth: 3, fun: 5, shared: ["sports"] },
    ],
    promises: [{ kind: "you_owe", text: "Pay Ben back for the Giants tickets", importance: 3 }],
  },
  {
    key: "demo-09", name: "Priya Shah", avatar: "p04", phone: "+1 650 555 0155", email: "priya@groupchat.ai",
    birthday: { month: 1, day: 18, year: 1997 },
    facts: [
      ["relationship", "Builder friend", 400], ["how_met", "Same table at a TreeHacks weekend", 700],
      ["from", "Ahmedabad, then Fremont", 600], ["working_on", "An agent that lives in the group chat", 4],
      ["interest", "AI agents", 300], ["interest", "Bollywood dance", 300], ["interest", "Chess", 200],
      ["matters", "Proving she can build a company without a cofounder", 100], ["family", "Engaged to Arjun, wedding next October", 90],
      ["place", "Philz on Middlefield", 200], ["style", "Fast talker, jumps between ideas, generous with intros", 300],
      ["food", "Vegetarian, loves Sweetgreen a little too much", 200], ["gift_idea", "A nice chess set", 100],
    ],
    history: { count: 12, years: 1.8, cats: ["founder", "work"], mix: [0.6, 0.25, 0.15], minutes: [25, 80], depth: 3.3, fun: 3.5, shared: ["AI agents", "startups"], sharedCount: [1, 2] },
    recent: [
      { d: 4, h: 17, kind: "call", min: 30, title: "Agents in the group chat", points: ["Building an agent that lives in the group chat", "Sending you her pitch deck", "Agents will live inside the apps we already use"], depth: 3, fun: 3, shared: ["AI agents", "startups"] },
    ],
  },
  {
    key: "demo-10", name: "Ellie", avatar: "p10", phone: "+1 916 555 0188", email: "ellie.writes@gmail.com",
    birthday: { month: 12, day: 2, year: 2002 },
    facts: [
      ["relationship", "Sister", 1400], ["from", "Sacramento", 1400], ["working_on", "Applying to MFA programs in creative writing", 10],
      ["interest", "Writing short fiction", 500], ["interest", "Thrifting", 300], ["interest", "Taylor Swift, unironically", 200],
      ["matters", "Being taken seriously as a writer", 60], ["family", "Little sister, 4 years younger", 1400],
      ["life_event", "Moved to Portland in August", 100], ["place", "Powell's Books when you visit", 80],
      ["gift_idea", "A Moleskine and a Powell's gift card", 40], ["style", "Texts in bursts, voice memos at 2am", 300],
      ["food", "Pho, and she's vegetarian since June", 150], ["avoid", "Don't ask about her ex, Jake", 120],
    ],
    history: { count: 20, years: 3, cats: ["family"], mix: [0.15, 0.25, 0.6], minutes: [10, 45], depth: 3.5, fun: 4.1, shared: ["books", "music", "family"], sharedCount: [1, 2] },
    promises: [{ kind: "you_owe", text: "Read Ellie's MFA personal statement", dueInDays: 3, importance: 4 }],
  },
  {
    key: "demo-11", name: "Dad", avatar: "p11", phone: "+1 916 555 0165", email: "tom.home@gmail.com",
    birthday: { month: 6, day: 11, year: 1964 },
    facts: [
      ["relationship", "Dad", 1400], ["from", "Grew up in Chico", 1400], ["working_on", "Restoring a 1972 Bronco in the garage", 60],
      ["interest", "Fly fishing", 500], ["interest", "Kings basketball", 300], ["interest", "Old cars", 200],
      ["matters", "That you're happy, but also have health insurance", 100], ["family", "Married to Mom for 32 years", 1400],
      ["place", "The Yuba River fishing spot", 500], ["style", "Short calls, saves the important thing for the end", 400],
      ["food", "Tri-tip on the grill", 400], ["gift_idea", "A new fly reel", 90],
    ],
    history: { count: 12, years: 3, cats: ["family"], mix: [0.3, 0.6, 0.1], minutes: [10, 40], depth: 2.8, fun: 3.2, shared: ["family", "sports"], sharedCount: [0, 1] },
  },
  {
    key: "demo-12", name: "Grandma", avatar: "p21", phone: "+1 530 555 0102",
    birthday: { month: 11, day: 22, year: 1942 },
    facts: [
      ["relationship", "Grandma", 1400], ["from", "Grew up on a farm in Iowa", 1200], ["interest", "Crossword puzzles", 600], ["interest", "Old Hollywood movies", 400],
      ["matters", "Family dinners, and hearing your voice", 200], ["family", "Twelve grandchildren, you're the one in tech", 900],
      ["life_event", "Turning 84 next week", 20], ["gift_idea", "Printed photos in a real album", 30],
      ["style", "Tells the same stories with new details each time", 500], ["food", "Her rhubarb pie", 800],
    ],
    history: { count: 6, years: 3, cats: ["family"], mix: [0.2, 0.8, 0], minutes: [20, 45], depth: 4.7, fun: 3.4, shared: ["family"], sharedCount: [0, 1] },
    promises: [{ kind: "you_owe", text: "Mail Grandma the printed photos", dueInDays: 5, importance: 3 }],
  },
  {
    key: "demo-13", name: "Marcus Lee", avatar: "p06", phone: "+1 650 555 0177", email: "marcus.lee@gmail.com",
    birthday: { month: 4, day: 25, year: 1999 },
    facts: [
      ["relationship", "College friend", 1100], ["how_met", "Intro to Econ, sat in the back row", 1300], ["from", "Vancouver, BC", 1200],
      ["working_on", "Planning a ski trip to Tahoe this winter", 41], ["interest", "Skiing", 800], ["interest", "Travel hacking with points", 300], ["interest", "F1", 200],
      ["family", "Parents still in Vancouver", 600], ["place", "Palisades Tahoe", 400], ["style", "Planner, makes the spreadsheet", 300],
      ["food", "Ramen at Ippudo", 300], ["gift_idea", "Ski wax kit", 100],
    ],
    history: { count: 12, years: 3.5, cats: ["friend"], mix: [0.6, 0.2, 0.2], minutes: [30, 120], depth: 2.6, fun: 4, shared: ["skiing", "travel"], sharedCount: [1, 2] },
    recent: [{ d: 41, h: 19, kind: "in_person", min: 90, place: "Ippudo, Berkeley", title: "Ramen and ski trip plans", points: ["Planning a ski trip this winter", "He found cheap flights to Japan", "Wants a group of six"], depth: 2, fun: 4, shared: ["skiing", "travel"] }],
  },
  {
    key: "demo-14", name: "Jess", avatar: "p07", phone: "+1 916 555 0149", email: "jessmorgan@gmail.com",
    birthday: { month: 9, day: 14, year: 1999 },
    facts: [
      ["relationship", "Friend from home", 1400], ["how_met", "Next-door neighbors in Sacramento growing up", 1400], ["from", "Sacramento", 1400],
      ["working_on", "Nursing school at UC Davis", 100], ["interest", "Sourdough baking", 300], ["interest", "Road trips", 200],
      ["matters", "Feeling like she didn't miss her twenties", 18], ["life_event", "Wishes she'd moved somewhere new at 22", 18],
      ["place", "Dinner in the Mission when she visits", 18], ["style", "Honest, sometimes blunt, always warm", 400], ["food", "Thai food, extra spicy", 300],
    ],
    history: { count: 8, years: 3, cats: ["friend"], mix: [0.5, 0.2, 0.3], minutes: [20, 120], depth: 3.4, fun: 3.7, shared: ["cooking", "travel"], sharedCount: [0, 2] },
    recent: [{ d: 18, h: 19, kind: "in_person", min: 90, place: "Lolinda", title: "Dinner when she visited", points: ["Moving somewhere new after college", "Shared groceries never get paid back", "She might apply to UCSF"], depth: 4, fun: 4, shared: ["travel"] }],
  },
  {
    key: "demo-15", name: "Rachel Goldberg", avatar: "p12", phone: "+1 415 555 0110", email: "rachel@northpoint.vc",
    birthday: { month: 10, day: 5 },
    facts: [
      ["relationship", "Investor", 120], ["how_met", "Intro from David Okafor after Demo Day prep", 150], ["working_on", "Partner at Northpoint Ventures, consumer seed", 120],
      ["interest", "Consumer social apps", 120], ["interest", "Marathon running", 90], ["matters", "Founders who know their users by name", 60],
      ["family", "Two teenage kids, Sam and Ruby", 60], ["style", "Sharp questions, warm afterwards", 60], ["food", "Zuni Café's roast chicken", 40],
    ],
    history: { count: 5, years: 0.4, cats: ["work"], mix: [0.6, 0.4, 0], minutes: [25, 60], depth: 3, fun: 2.6, shared: ["startups"], sharedCount: [0, 1] },
  },
  {
    key: "demo-16", name: "David Okafor", avatar: "p13", phone: "+1 415 555 0114", email: "david.okafor@gmail.com",
    birthday: { month: 8, day: 2 },
    facts: [
      ["relationship", "Mentor", 200], ["how_met", "Our YC interviewer, now our group partner", 220], ["from", "Lagos, then Houston", 200],
      ["working_on", "YC group partner, consumer and AI", 200], ["interest", "Afrobeats", 150], ["interest", "Chess", 100], ["interest", "Long-distance cycling", 100],
      ["matters", "Founders who ship weekly", 30], ["family", "Wife Chioma, three kids", 150], ["place", "Office hours at the YC office", 30],
      ["style", "Asks one question that reframes everything", 100], ["food", "Jollof rice debates", 90],
    ],
    history: { count: 12, years: 0.6, cats: ["work"], mix: [0.75, 0.2, 0.05], minutes: [20, 60], depth: 3.8, fun: 2.9, shared: ["startups", "AI"], sharedCount: [1, 2] },
  },
  {
    key: "demo-17", name: "Aisha Rahman", avatar: "p15", phone: "+1 510 555 0136", email: "aisha.rahman@berkeley.edu",
    birthday: { month: 11, day: 29, year: 2000 },
    facts: [
      ["relationship", "Hackathon teammate", 300], ["how_met", "CalHacks team, won best hardware hack", 380], ["from", "Dhaka, then Queens", 300],
      ["working_on", "PhD in HCI at Berkeley, studying memory aids", 40], ["interest", "Calligraphy", 200], ["interest", "Accessibility research", 200], ["interest", "Cricket", 100],
      ["matters", "Technology that helps older people", 100], ["family", "Younger brother Zayn applying to colleges", 80],
      ["style", "Quiet, then says the smartest thing in the room", 200], ["food", "Biryani from Kasa", 100], ["avoid", "No alcohol-centric plans", 300],
    ],
    history: { count: 12, years: 1.1, cats: ["founder", "friend"], mix: [0.6, 0.2, 0.2], minutes: [30, 120], depth: 3.9, fun: 3.6, shared: ["design", "AI", "research", "accessibility"], sharedCount: [1, 3] },
  },
  {
    key: "demo-18", name: "Jordan Brooks", avatar: "p16", phone: "+1 415 555 0181", email: "jordanbrooks@gmail.com",
    birthday: { month: 3, day: 21, year: 1996 },
    facts: [
      ["relationship", "Run club friend", 300], ["how_met", "Saturday run club at Crissy Field", 400], ["from", "Atlanta", 300],
      ["working_on", "Training for the CIM marathon in December", 20], ["interest", "Marathons", 300], ["interest", "Sneakers", 200], ["interest", "Hip hop production", 100],
      ["matters", "Consistency over intensity", 100], ["family", "Mom is his biggest fan, calls before every race", 100], ["place", "Crissy Field at 8am", 300],
      ["style", "Hype man energy", 200], ["food", "Post-run breakfast at Plow", 200],
    ],
    history: { count: 18, years: 1.2, cats: ["run"], mix: [0.9, 0, 0.1], minutes: [45, 100], depth: 2.2, fun: 4.3, shared: ["running", "fitness", "music"], sharedCount: [1, 2] },
  },
  {
    key: "demo-19", name: "Hannah Weiss", avatar: "p17", phone: "+1 415 555 0193", email: "hannah@weiss.studio",
    birthday: { month: 7, day: 7, year: 1992 },
    facts: [
      ["relationship", "Designer friend", 500], ["how_met", "Ceramics class with Maya at Clay by the Bay", 500], ["from", "Hamburg, Germany", 500],
      ["working_on", "Independent brand designer, redoing a coffee roaster's identity", 30], ["interest", "Ceramics", 500], ["interest", "Typography", 400], ["interest", "Mid-century furniture", 200], ["interest", "Design books", 200],
      ["matters", "Craft and doing fewer things well", 200], ["family", "Partner Felix, a cellist", 200], ["place", "Green Apple Books on Clement", 200],
      ["gift_idea", "A vintage Vignelli poster", 100], ["style", "Thoughtful, sketches while she talks", 200], ["food", "Pastries at Arsicault", 150],
    ],
    history: { count: 14, years: 1.5, cats: ["friend"], mix: [0.8, 0.05, 0.15], minutes: [40, 120], depth: 3.6, fun: 3.5, shared: ["design", "ceramics", "typography", "books"], sharedCount: [3, 4] },
  },
  {
    key: "demo-20", name: "Kenji Watanabe", avatar: "p18", phone: "+1 650 555 0108", email: "kenji.w@gmail.com",
    birthday: { month: 9, day: 1 },
    facts: [
      ["relationship", "Former manager", 600], ["how_met", "Your manager during the Apple internship", 700], ["from", "Osaka", 600],
      ["working_on", "Engineering director at Apple Maps", 200], ["interest", "Japanese whisky", 300], ["interest", "Bonsai", 200],
      ["matters", "Doing things the right way, even slowly", 300], ["family", "Wife Yuki, two sons in middle school", 300],
      ["style", "Calm, gives advice as questions", 300], ["food", "Omakase at Ju-Ni", 200],
    ],
    history: { count: 6, years: 2, cats: ["work"], mix: [0.6, 0.3, 0.1], minutes: [30, 75], depth: 3.9, fun: 2.8, shared: ["engineering", "careers"], sharedCount: [0, 2] },
  },
  {
    key: "demo-21", name: "Sofia Rossi", avatar: "p19", phone: "+1 415 555 0127", email: "sofia@rossicucina.com",
    birthday: { month: 11, day: 24, year: 1990 },
    facts: [
      ["relationship", "Friend", 400], ["how_met", "Her supper club in the Mission", 450], ["from", "Bologna", 400],
      ["working_on", "Opening a pasta counter on 24th Street", 30], ["interest", "Natural wine", 300], ["interest", "Opera", 200], ["interest", "Fermentation", 100],
      ["matters", "Feeding people, especially strangers", 200], ["family", "Brother Marco runs the family trattoria", 300],
      ["place", "Her supper club on Thursdays", 100], ["gift_idea", "A Microplane and good parmigiano", 60], ["style", "Loud, warm, hugs on arrival", 300], ["food", "Tortellini in brodo, obviously", 300],
    ],
    history: { count: 10, years: 1.3, cats: ["friend"], mix: [0.85, 0.05, 0.1], minutes: [60, 180], depth: 3, fun: 4.6, shared: ["food", "cooking", "wine"], sharedCount: [1, 3] },
  },
  {
    key: "demo-22", name: "Olivia Martinez", avatar: "p22", phone: "+1 415 555 0170",
    facts: [
      ["relationship", "Neighbor", 600], ["how_met", "She lent you a ladder the week you moved in", 700], ["from", "Michoacán, in the Mission for 20 years", 600],
      ["working_on", "Community garden on Shotwell", 100], ["interest", "Gardening", 300], ["interest", "Telenovelas", 200],
      ["family", "Son Mateo is 12 and loves coding", 200], ["style", "Talks over the fence for exactly 10 minutes", 300], ["food", "Brings tamales at Christmas", 330],
    ],
    history: { count: 7, years: 1.8, cats: ["friend"], mix: [1, 0, 0], minutes: [5, 20], depth: 2.4, fun: 3.2, shared: ["gardening"], sharedCount: [0, 1] },
  },
  {
    key: "demo-23", name: "Ethan Nguyen", avatar: "p23", phone: "+1 408 555 0151", email: "ethan@jesse.app",
    birthday: { month: 12, day: 12, year: 2000 },
    facts: [
      ["relationship", "Teammate", 100], ["how_met", "Answered our founding engineer post on Hacker News", 110], ["from", "San Jose", 100],
      ["working_on", "Convex backend and the extraction pipeline", 5], ["interest", "Rust", 100], ["interest", "Speedcubing", 80], ["interest", "Anime", 60],
      ["matters", "Clean code and long focus blocks", 50], ["family", "Parents run a pho shop in San Jose", 70], ["style", "Quiet in meetings, essays in Slack", 60], ["food", "Banh mi from Saigon Sandwich", 40],
    ],
    history: { count: 18, years: 0.3, cats: ["founder"], mix: [0.8, 0.1, 0.1], minutes: [20, 90], depth: 2.6, fun: 3, shared: ["engineering", "startups"], sharedCount: [1, 2] },
  },
  {
    key: "demo-24", name: "Zara Ahmed", avatar: "p24", phone: "+1 510 555 0122", email: "zara.ahmed@gmail.com",
    facts: [
      ["relationship", "Friend of Lena's", 200], ["how_met", "Lena's birthday dinner", 360], ["from", "London", 200],
      ["working_on", "Product design at Airbnb", 100], ["interest", "Stand-up comedy", 100], ["interest", "Thrifting", 100],
      ["style", "Witty, quick comebacks", 100], ["food", "Curry from Shalimar", 100],
    ],
    history: { count: 4, years: 1, cats: ["friend"], mix: [1, 0, 0], minutes: [30, 90], depth: 2.5, fun: 4.2, shared: ["comedy", "design"], sharedCount: [0, 2] },
  },
  {
    key: "demo-25", name: "Luca Bianchi", avatar: "p25", phone: "+1 415 555 0185",
    facts: [
      ["relationship", "Barista at Sightglass", 300], ["how_met", "He remembers your order: cortado, oat", 300], ["from", "Turin", 200],
      ["working_on", "Saving up to roast his own beans", 60], ["interest", "Coffee roasting", 200], ["interest", "Juventus", 100], ["style", "Short chats, always funny", 150],
    ],
    history: { count: 8, years: 1, cats: ["friend"], mix: [1, 0, 0], minutes: [4, 9], depth: 1.6, fun: 4, shared: ["coffee"], sharedCount: [0, 1] },
  },
  {
    key: "demo-26", name: "Chloe Dubois", avatar: "p26", phone: "+1 415 555 0139", email: "chloe.dubois@gmail.com",
    birthday: { month: 4, day: 2, year: 1998 },
    facts: [
      ["relationship", "Book club", 300], ["how_met", "Book club at Green Apple Books", 330], ["from", "Lyon", 300],
      ["working_on", "Translating a French novel into English", 60], ["interest", "Literary fiction", 300], ["interest", "Film noir", 100],
      ["style", "Precise, disagrees elegantly", 100], ["food", "Galettes at Ti Couz", 100],
    ],
    history: { count: 6, years: 0.9, cats: ["friend"], mix: [1, 0, 0], minutes: [60, 120], depth: 3.8, fun: 3, shared: ["books", "film"], sharedCount: [1, 2] },
  },
  {
    key: "demo-27", name: "Isaac Mensah", avatar: "p27", phone: "+1 415 555 0145", email: "isaac@lumen.health",
    birthday: { month: 6, day: 30, year: 1995 },
    facts: [
      ["relationship", "YC batchmate", 150], ["how_met", "Same YC group this batch", 160], ["from", "Accra, then Columbus", 150],
      ["working_on", "Lumen, an AI scribe for rural clinics", 20], ["interest", "Arsenal", 100], ["interest", "Highlife music", 80], ["interest", "Fundraising strategy", 60],
      ["matters", "Healthcare access back home", 100], ["family", "Wife Ama is expecting in February", 30], ["style", "Generous, shares every investor note", 100], ["food", "Jollof at Bissap Baobab", 80],
    ],
    history: { count: 14, years: 0.4, cats: ["work", "founder"], mix: [0.7, 0.2, 0.1], minutes: [30, 90], depth: 3.4, fun: 3.7, shared: ["startups", "AI", "health"], sharedCount: [1, 3] },
    promises: [{ kind: "they_owe", text: "Isaac intros you to his Sequoia scout", importance: 4 }],
  },
  {
    key: "demo-28", name: "Nora Lindqvist", avatar: "p28", phone: "+1 415 555 0116", email: "nora@stillwater.app",
    facts: [
      ["relationship", "Founder friend", 200], ["how_met", "Founder dinner at Zuni", 250], ["from", "Stockholm", 200],
      ["working_on", "A meditation app for teams", 60], ["interest", "Cold plunges", 100], ["interest", "Scandinavian design", 100],
      ["style", "Calm, asks how you're sleeping", 100], ["food", "Cardamom buns", 100],
    ],
    history: { count: 4, years: 0.7, cats: ["work"], mix: [0.75, 0.25, 0], minutes: [40, 90], depth: 4, fun: 3, shared: ["startups", "wellness"], sharedCount: [1, 2] },
  },
  {
    key: "demo-29", name: "Raj Iyer", avatar: "p29", phone: "+1 650 555 0103", email: "raj@iyer.capital",
    facts: [
      ["relationship", "Angel investor", 100], ["how_met", "Intro from Kenji", 130], ["from", "Chennai, in Palo Alto since 1995", 100],
      ["working_on", "Angel investing after selling his company", 100], ["interest", "Carnatic music", 80], ["interest", "Golf", 60],
      ["family", "Daughter at Stanford, son at Berkeley", 80], ["style", "Story first, numbers after", 80], ["food", "Dosa at Madras Café", 60],
    ],
    history: { count: 4, years: 0.35, cats: ["work"], mix: [0.5, 0.5, 0], minutes: [30, 60], depth: 3.1, fun: 2.7, shared: ["startups"], sharedCount: [0, 1] },
  },
  {
    key: "demo-30", name: "Emily Park", avatar: "p30", phone: "+1 415 555 0168", email: "emilypark@gmail.com",
    birthday: { month: 5, day: 16, year: 1998 },
    facts: [
      ["relationship", "Noah's partner", 700], ["how_met", "Noah brought her to Friendsgiving", 800], ["from", "Seoul, then LA", 600],
      ["working_on", "Pediatric resident at UCSF", 100], ["interest", "Pilates", 200], ["interest", "K-dramas", 150], ["interest", "Baking", 100],
      ["family", "Together with Noah 4 years", 700], ["style", "Funny, a little chaotic, great listener", 300], ["food", "Bingsu in the Richmond", 200],
      ["avoid", "Don't hint about the proposal", 3],
    ],
    history: { count: 12, years: 3, cats: ["friend"], mix: [0.8, 0, 0.2], minutes: [40, 150], depth: 3, fun: 4.2, shared: ["food", "relationships"], sharedCount: [0, 2] },
  },
  {
    key: "demo-31", name: "Diego Santos", avatar: "p31", phone: "+1 415 555 0174", email: "diegosurf@gmail.com",
    birthday: { month: 2, day: 28, year: 2001 },
    facts: [
      ["relationship", "Surf buddy", 400], ["how_met", "Waiting out a set together at Linda Mar", 500], ["from", "Florianópolis, Brazil", 400],
      ["working_on", "Bartending and finishing a biology degree at SF State", 100], ["interest", "Surfing", 400], ["interest", "Capoeira", 200], ["interest", "Samba", 100],
      ["matters", "Living near the ocean, always", 200], ["place", "Ocean Beach at dawn", 300], ["style", "Pure joy, zero planning", 200], ["food", "Açaí bowls and pão de queijo", 200],
    ],
    history: { count: 14, years: 1.4, cats: ["surf"], mix: [0.9, 0, 0.1], minutes: [60, 150], depth: 1.9, fun: 4.8, shared: ["surfing", "outdoors"], sharedCount: [1, 2] },
  },
  {
    key: "demo-32", name: "Fatima Diallo", avatar: "p32", phone: "+1 510 555 0158", email: "fatima.diallo@gmail.com",
    birthday: { month: 10, day: 20, year: 1990 },
    facts: [
      ["relationship", "Friend", 200], ["how_met", "Sat next to each other on a delayed flight from JFK", 260], ["from", "Dakar, then the Bronx", 200],
      ["working_on", "ER doctor at Highland Hospital", 100], ["interest", "Palliative care", 100], ["interest", "Sufi poetry", 100], ["interest", "Gardening", 50],
      ["matters", "Being present with people at the end of life", 100], ["family", "Her father passed in January", 120],
      ["style", "Asks questions nobody asks, makes long silences feel safe", 100], ["food", "Thieboudienne, her mom's recipe", 80],
    ],
    history: { count: 3, years: 0.7, cats: ["friend"], mix: [0.7, 0.3, 0], minutes: [60, 140], depth: 5, fun: 2.8, shared: ["poetry", "health"], sharedCount: [0, 1],
      points: ["Talked about what she's learned from dying patients", "She asked what I'd regret not doing", "Talked about her father's last week"] },
  },
  {
    key: "demo-33", name: "Will Thompson", avatar: "p33", phone: "+1 415 555 0101", email: "wthompson@sbcglobal.net",
    facts: [
      ["relationship", "Landlord", 700], ["how_met", "Signed the lease at his kitchen table", 720], ["from", "Born in the Mission in 1960", 700],
      ["interest", "Model trains", 200], ["interest", "SF history", 200], ["style", "Long stories about the old Mission", 300],
    ],
    history: { count: 5, years: 2, cats: ["home"], mix: [0.6, 0.3, 0.1], minutes: [5, 25], depth: 1.8, fun: 3, shared: ["SF history"], sharedCount: [0, 1] },
  },
  {
    key: "demo-34", name: "Mia Johnson", avatar: "p34", phone: "+1 650 555 0129", email: "mia.johnson@gmail.com",
    birthday: { month: 1, day: 6, year: 1999 },
    facts: [
      ["relationship", "College friend", 1100], ["how_met", "Same section in CS 106B", 1300], ["from", "Chicago, South Side", 1100],
      ["working_on", "Product at Duolingo, building the music course", 60], ["interest", "Gospel choir", 400], ["interest", "Roller skating", 200], ["interest", "Podcasting", 100],
      ["matters", "Representation in tech", 300], ["family", "Raised by her grandma and two aunts", 600], ["place", "Roller skating in Golden Gate Park", 200],
      ["style", "Big laugh, keeps you accountable", 300], ["food", "Chicken and waffles at Brenda's", 200],
    ],
    history: { count: 12, years: 3.5, cats: ["friend"], mix: [0.6, 0.15, 0.25], minutes: [30, 120], depth: 3.4, fun: 4.4, shared: ["music", "careers", "skating"], sharedCount: [1, 2] },
  },
  {
    key: "demo-35", name: "Alex Novak", avatar: "p35", phone: "+1 415 555 0196", email: "alexnovak@gmail.com",
    facts: [
      ["relationship", "DJ friend", 300], ["how_met", "They DJ'd Ben's birthday party", 350], ["from", "Prague, then Brooklyn", 300],
      ["working_on", "A monthly house night at Public Works", 40], ["interest", "House music", 300], ["interest", "Synthesizers", 200],
      ["style", "Deadpan, then suddenly earnest", 100], ["food", "Late-night dumplings", 100],
    ],
    history: { count: 5, years: 1, cats: ["friend"], mix: [0.8, 0, 0.2], minutes: [30, 180], depth: 2.3, fun: 4.7, shared: ["music"], sharedCount: [1, 1] },
  },
  {
    key: "demo-36", name: "Leo Hartmann", avatar: "p36", phone: "+1 650 555 0187", email: "leo.hartmann@gmail.com",
    facts: [
      ["relationship", "Cycling acquaintance", 200], ["how_met", "Fixed your flat on Old La Honda", 250], ["from", "Munich", 200],
      ["working_on", "Hardware lead at a battery startup", 100], ["interest", "Road cycling", 200], ["interest", "Espresso machines", 100],
      ["style", "Precise, a bit formal at first", 100], ["food", "Pretzels and Rapha café coffee", 100],
    ],
    history: { count: 4, years: 0.8, cats: ["run"], mix: [1, 0, 0], minutes: [45, 150], depth: 2.5, fun: 3.5, shared: ["cycling", "hardware"], sharedCount: [1, 2] },
  },
];

function interactionsFor(spec: Spec, now: number): Built[] {
  const rand = prng(spec.key);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const recent = spec.recent ?? [];
  const out: Built[] = recent.map((m) => ({
    startedAt: at(now, m.d, m.h),
    kind: m.kind,
    minutes: m.min,
    ...(m.place && m.kind === "in_person" ? { placeName: m.place } : {}),
    title: m.title,
    points: m.points,
    depth: m.depth,
    fun: m.fun,
    ...(m.shared ? { sharedInterests: m.shared } : {}),
  }));
  const h = spec.history;
  const endDay = recent.length ? Math.max(...recent.map((m) => m.d)) + 3 : 2;
  const span = Math.max(1, Math.round(h.years * 365) - endDay);
  const n = Math.max(0, h.count - recent.length);
  for (let i = 0; i < n; i++) {
    const day = endDay + Math.round(span * ((i + rand() * 0.9) / n) ** 1.15);
    const r = rand();
    const kind: Kind = r < h.mix[0] ? "in_person" : r < h.mix[0] + h.mix[1] ? "call" : "text";
    const cat = CATS[pick(h.cats)];
    const pool = [...cat.points, ...(h.points ?? [])];
    const want = Math.min(pool.length, 2 + Math.floor(rand() * 2));
    const points: string[] = [];
    while (points.length < want) {
      const p = pick(pool);
      if (!points.includes(p)) points.push(p);
    }
    const [lo, hi] = h.minutes;
    const minutes =
      kind === "text" ? 10 + Math.floor(rand() * 21) : kind === "call" ? Math.round(10 + rand() * 50) : Math.round(lo + rand() * (hi - lo));
    const sharedN = h.sharedCount[0] + Math.floor(rand() * (h.sharedCount[1] - h.sharedCount[0] + 1));
    const shared = h.shared
      .map((s) => ({ s, r: rand() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, sharedN)
      .map((x) => x.s);
    out.push({
      startedAt: at(now, day, kind === "in_person" ? 8 + rand() * 13 : 9 + rand() * 14),
      kind,
      minutes,
      ...(kind === "in_person" ? { placeName: pick(cat.places) } : {}),
      title: kind === "in_person" ? pick(cat.titles) : kind === "call" ? pick(CALL_TITLES) : pick(TEXT_TITLES),
      points,
      depth: clamp(h.depth + (rand() - 0.5) * 1.6),
      fun: clamp(h.fun + (rand() - 0.5) * 1.6),
      ...(shared.length ? { sharedInterests: shared } : {}),
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

export async function seedContacts(ctx: MutationCtx, ownerId: Id<"users">) {
  const now = Date.now();
  const contacts: SyncContact[] = SPECS.map((s) => ({
    contactId: s.key,
    name: s.name,
    phones: [s.phone],
    emails: s.email ? [s.email] : [],
    avatarKey: s.avatar,
    ...(s.birthday ? { birthday: s.birthday } : {}),
  }));
  const result = await upsertContacts(ctx, ownerId, "demo", contacts);

  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    const personId = result.ids[i];
    const existing = await ctx.db
      .query("interactions")
      .withIndex("by_personId_and_startedAt", (q) => q.eq("personId", personId))
      .take(500);
    for (const row of existing) await deleteInteraction(ctx, row);
    await ctx.db.patch("people", personId, {
      profile: spec.facts.map(([kind, text, daysAgo]) => ({ kind, text, learnedAt: at(now, daysAgo, 12) })),
      totalMinutes: undefined,
      encounterCount: undefined,
      depthScore: undefined,
      funScore: undefined,
      compatibilityScore: undefined,
      deepTalkScore: undefined,
      lastInteractionAt: undefined,
      knownSince: undefined,
    });
    for (const row of interactionsFor(spec, now)) {
      await addInteraction(ctx, { ownerId, personId, ...row });
    }
    if (!spec.promises?.length) continue;
    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .take(200);
    for (const p of spec.promises) {
      if (items.some((it) => it.text === p.text)) continue;
      await ctx.db.insert("items", {
        ownerId,
        personId,
        kind: p.kind,
        text: p.text,
        importance: p.importance,
        status: "open",
        editedByUser: false,
        ...(p.dueInDays !== undefined ? { dueAt: at(now, -p.dueInDays, 18) } : {}),
      });
    }
  }
  return { added: result.added, updated: result.updated, total: result.total };
}

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await seedContacts(ctx, ownerId);
  },
});
