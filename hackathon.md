# Hackathon log

- **Project:** Jesse
- **Event:** YC Consumer Mobile Hackathon
- **What it does:** A companion app that listens to your conversations with consent and keeps only short, editable notes (promises, plans, facts about people, topics, goals and concerns), never audio or transcripts, then helps you follow up and reflect.
- **Live app:** not deployed
- **Repo:** https://github.com/ma-xr/yc-app-hackathon
- **Frontend:** Other (Expo SDK 58 iOS app, run in Expo Go or a Release build; no hosted web frontend)
- **Convex deployment:** https://colorful-fish-461.convex.cloud
- **Components:** @convex-dev/auth (core, password and username components)
- **Convex features:** schema, tables, indexes, realtime queries, mutations, optimistic updates, actions, internal functions, scheduled functions, crons, HTTP actions (Keiki tool endpoint and an MCP server), file storage, typed env
- **Auth:** Convex Auth
- **AI models:** OpenAI gpt-4o-transcribe-diarize (speech-to-text with speakers), gpt-5-mini (note extraction, follow-up drafts, jesse.ask answers), gpt-4o-mini-transcribe (voice questions), gpt-4o-mini-tts (Jesse's voice); Supermemory API for optional long-term recall; the Keiki iMessage agent runs google/gemini-3.8-flash (configured in Keiki)
- **Started:** 2026-11-15T19:16:45Z
- **Last updated:** 2026-11-15T23:34:33Z

## Log

### 2026-11-15 - 80d7f1d
Scaffolded an Expo app with Expo Router and TypeScript at the repo root, with
file-based routes for a home and explore screen (`src/app/_layout.tsx`,
`src/app/index.tsx`, `src/app/explore.tsx`). Added Convex as the backend with
an empty schema and a `convex dev` script; no tables or functions yet
(`convex/schema.ts`, `package.json`).

### 2026-11-15 - 353aee4
Added username and password sign-in with Convex Auth v2. Signed-out users see a
log-in and sign-up screen, sessions persist in expo-secure-store on iOS and
Android, and the home screen has a sign-out link. Added users and moments
tables with a by_authorId index, a query for the signed-in user's moments and a
mutation to add one. Convex features: schema, indexes, query, mutation, Convex
Auth (`convex/schema.ts`, `convex/moments.ts`, `convex/auth.ts`,
`convex/convex.config.ts`, `src/components/sign-in.tsx`, `src/lib/convex.ts`).

### 2026-11-15 - bdee468
Replaced the moments table with Jesse's data model: people, conversations,
items, topics, followups, reflections and keikiLinks, each scoped to the
signed-in owner and indexed for the screens' reads. Added the read queries the
UI uses (today's conversations, ranked open items, people with their notes,
topics with the conversations they came from), user edits for items and
people, conversation start and stop, and a seed mutation that loads the demo
people, conversations, topics and urgent items for the signed-in user
(`convex/schema.ts`, `convex/conversations.ts`, `convex/items.ts`,
`convex/people.ts`, `convex/topics.ts`, `convex/seed.ts`,
`convex/lib/auth.ts`).

### 2026-11-15 - d761a56
Added listening. A `useListening` hook records the conversation in 45-second
chunks with expo-audio and sends each chunk's bytes straight to an authenticated
action (no file storage). The action transcribes the chunk with speaker labels
and asks an LLM
for strict JSON under Jesse's filtering rubric (commitments, small but urgent,
their life, open questions, themes, growth; small talk and gossip dropped; at
most 5 items of 12 words or fewer). A mutation matches heard names to people,
creates new people, merges facts, topics and the gist, infers how often you
talk, and counts the moments left out. The transcript only lives in the
action's memory (`src/lib/listening.ts`, `convex/extract.ts`,
`convex/conversations.ts`).

### 2026-11-15 - d9f5082
Added follow-ups: items with a date get a scheduled "before" text (good luck or
see you soon) and a "how did it go?" text, promises get a nudge, and people past
their usual cadence get an "it's been a while" nudge. Each follow-up carries 1-3
drafts written by OpenAI in the user's voice from their past sent texts, with
template fallbacks. Made Jesse reachable over iMessage through Keiki: a Keiki
agent's tools call a Convex HTTP endpoint to read the user's memory, list today's
drafts and save reminders, a 6-digit code links a phone to an account, and
Convex pushes due follow-ups and an evening nudge as Keiki notices. Added phone
actions for the UI: prefilled Messages composer, calendar event creation and a
call action. Convex features: scheduler (runAfter, runAt), crons, HTTP actions,
internal functions, typed env (`convex/followups.ts`, `convex/keiki.ts`,
`convex/http.ts`, `convex/crons.ts`, `convex/convex.config.ts`,
`src/lib/actions.ts`).

### 2026-11-15 - a938ee4
Extraction now hands every new promise or dated item to the follow-ups planner
through a typed internal reference, so a suggested text is planned as soon as a
conversation is processed (`convex/extract.ts`).

### 2026-11-15 - 8217e85
Added Jesse as a companion you can talk to. `jesse.ask` answers questions such
as "What did I promise Sam?" from the user's own people, open items, topics,
conversation notes and past reflections, with optional long-term recall through
Supermemory when its key is set. Added voice: speech-to-text for push-to-talk
(the audio is never stored) and a spoken reply whose audio file is deleted after
ten minutes. Added the evening check-in: a daily local notification at a
user-chosen time (default 9:30 PM) that mirrors to a paired Apple Watch and
opens the Reflect screen, a calm voice or text chat grounded in today that keeps
only a short summary of the user's answers. Convex features: actions, internal
queries and mutations, scheduled functions, file storage (`convex/jesse.ts`,
`convex/reflections.ts`, `src/app/reflect.tsx`, `src/lib/notifications.ts`,
`src/lib/voice.ts`).

### 2026-11-15 - 1f38550
Configured the native build for a real device and Revyl's cloud iPhone. The
app is named Jesse (bundle id com.maxr.jesse). Config plugins set the
microphone, calendar, reminders and contacts permission strings and turn on
background audio. Local notifications are on without the APNs entitlement, so
a free Apple Personal Team can sign the app. eas.json has simulator, preview
(ad hoc) and production profiles pointing at the dev Convex deployment. Checked
on a Revyl cloud iPhone 17 Pro Max: sign-up, sign-in, sign-out and session
persistence after relaunch all work (`app.json`, `eas.json`, `package.json`).

### 2026-11-15 - d832587
Replaced the starter screens with Jesse's four tabs (Home, Plans, People,
Ideas) behind the existing Convex Auth gate, with a custom tab bar, the design
tokens and the Bricolage Grotesque + Inter fonts. Home is Jesse: an SVG orb
with idle and listening animations that respect Reduce Motion, a "Jesse says"
line, Tonight's reflection in the evening, and up to three "Before you forget"
cards read live from the ranked open items, each with its action inline (Text,
Add to calendar, Done, with an optimistic update). Convex features: reactive
queries, mutations, optimistic updates (`src/app/_layout.tsx`,
`src/app/(tabs)/index.tsx`, `src/components/orb.tsx`,
`src/components/forget-card.tsx`, `src/data/hooks.ts`, `src/theme/tokens.ts`).

### 2026-11-15 - ff91cd6
Built the People tab and person pages. The list shows recent people with
Jesse's latest note and what's open between you, plus "It's been a while" for
anyone past their inferred cadence, with a one-tap text. A person page shows
the archetype and cadence line, the Open strip (You owe / Owes you), Jesse's
notes on them (each editable, saved through people.update), suggested texts
from followups.forToday with Send and Not now, Coming up, and each
conversation's gist as Jesse's notes, never quotes. A composer adds a note
(`src/app/(tabs)/people.tsx`, `src/app/person/[id].tsx`,
`src/components/suggested-text.tsx`, `src/data/people.ts`).

### 2026-11-15 - cfb9d5b
Built the Plans tab, a trimmed calendar. A week switcher covers last, this and
next week, and a day strip marks days with conversations and days with plans.
Past days show each conversation's gist as Jesse's notes plus what was
promised, read from conversations.range. Future days show the open plans and
promises due that day, with Add to calendar and a text action, from
items.open. Nothing claims to come from email (`src/app/(tabs)/plans.tsx`,
`src/data/plans.ts`).

### 2026-11-15 - 0930029
Built the Ideas tab ("On your mind"). An animated SVG brain fills four fixed
bubble slots with the top topics, with sparks for sub-ideas and a halo on the
selected one, all still under Reduce Motion. Below it are "Small but urgent"
items with Add to calendar and Done, topic folders with a sub-idea tree and
the conversations each idea came from, and a "Left out today" note summed from
today's conversations. Reads topics.list, items.open and conversations.today
(`src/app/(tabs)/ideas.tsx`, `src/components/brain.tsx`, `src/data/ideas.ts`).

### 2026-11-15 - 22908eb
Moved Jesse's Keiki config off Convex env vars, because the shared dev deploy
key can't write them: the agent id, shared iMessage number and join code are
constants, and the tool token and Keiki API key live in a write-once appSecrets
table seeded once by a bootstrap mutation and read through an internal query.
Ran the iMessage round trip: a phone linked by code, Jesse answered "what did I
promise Sam?" and "who should I text today?" from Convex, and a reminder's due
nudge went out as an iMessage with drafts. Drafts no longer invent links.
Convex features: schema table and index, internal query, HTTP action
(`convex/keiki.ts`, `convex/http.ts`, `convex/schema.ts`,
`convex/convex.config.ts`, `convex/followups.ts`).

### 2026-11-15 - 5cceecd
Locked the Keiki secrets bootstrap: the public mutation now stores a value only
when its SHA-256 matches a hash committed in code, so nobody can claim the tool
token or API key on a fresh deployment. Convex features: mutation, Web Crypto in
the default runtime (`convex/keiki.ts`).

### 2026-11-15 - 4f53847
Fixed three iOS issues from the cloud-iPhone run. Mic failures on the orb, the
person page and Reflect now show "I can't hear you here, so try typing" instead
of the native error, and a failed hold-to-ask opens a text ask field on Home
that calls jesse.ask and speaks the answer. Reflect opens as a full-screen modal
so its composer stays above the keyboard, and Home shows a small "Talk to Jesse"
entry to Reflect whenever the evening card isn't up. Reads reflections.tonight,
calls jesse.ask (`src/app/(tabs)/index.tsx`, `src/app/_layout.tsx`,
`src/app/person/[id].tsx`, `src/app/reflect.tsx`).

### 2026-11-15 - 51bd690
Made the app boot and run in Expo Go (SDK 58) as a demo fallback. expo-calendar
is the only dependency Expo Go doesn't support, so it now loads lazily and only
outside Expo Go. Inside Expo Go, Add to calendar explains that it needs the
installed app, while listening, Jesse's answers, voice and every screen keep
working (`src/lib/actions.ts`).

### 2026-11-15 - 514d160
Added a conversation page at /conversation/[id], opened from every conversation
card on Plans. It shows when and where the conversation was, who was there (each
person opens their page), Jesse's gist, and the promises, plans, notes, open
questions and topics that came out of it. Each item can be edited or forgotten,
and the page ends with "Jesse keeps notes, not words". The card widget moved to a
shared component. Reads conversations.get and topics.list
(`src/app/conversation/[id].tsx`, `src/components/conversation-card.tsx`,
`src/app/(tabs)/plans.tsx`).

### 2026-11-15 - a9e2e69
The person page now lists "Your conversations" newest first, with the same card
as Plans (time, kind chip, title, gist and promises). Each card opens the
conversation page. Jesse's notes moved to the end of the page, after Ready to
send, Coming up and the conversation history. Reads people.get
(`src/app/person/[id].tsx`).

### 2026-11-15 - 0d37afc
Dropped the "Small but urgent" section from the Ideas tab (it stays on Home) and
removed its now-unused hooks. The "From conversations" rows in each topic folder
are now buttons with a chevron and a pressed state: they open that conversation's
page, or the person's page when the item has no conversation. Reads topics.list
(`src/app/(tabs)/ideas.tsx`, `src/data/ideas.ts`).

### 2026-11-15 - 84a7367
Home is talk-first: a greeting under the orb names the user and today's latest
conversation ("Hey Poom, how was lunch with Sam?"), Jesse says it out loud once a
day unless the new Voice on/off chip is off, and a big "Talk with Jesse" button
opens Reflect. After a mic failure, "Try a sample conversation" sends a bundled
44 s TTS clip through conversations.start, extract.processChunk and
conversations.stop (`src/app/(tabs)/index.tsx`, `src/components/greeting.ts`,
`src/components/sign-in.tsx`, `src/lib/prefs.ts`, `src/lib/sample-conversation.ts`,
`src/data/hooks.ts`, `assets/audio/sample-conversation.m4a`).

### 2026-11-15 - 766f06e
Round-2 polish after the cloud-iPhone run. Once a sample conversation finishes,
typed answers show again. Voice off now stops answers and the greeting that are
still on their way. The daily greeting checks the date again when the app comes
back the next day. Plans hides empty conversations left behind by a mic failure.
The conversation page shows an end time only when it differs from the start
(`src/app/(tabs)/index.tsx`, `src/lib/sample-conversation.ts`,
`src/data/plans.ts`, `src/app/conversation/[id].tsx`).

### 2026-11-15 - 828dd34
Final polish. Nobody in the sample clip says the listener's name anymore, and the
extraction prompt now treats a name used to address the owner as the owner's,
never as a fact about someone else. Extraction skips a new open item that nearly
matches an open item already kept for the same person, so a second sample run
doesn't duplicate promises. The person page's Open strip shows three chips and a
"+N more" chip that scrolls to the conversation history. Added expo-asset to
package.json. Convex features: internal mutation, index query
(`convex/conversations.ts`, `convex/extract.ts`, `src/app/person/[id].tsx`,
`assets/audio/sample-conversation.m4a`).

### 2026-11-15 - 1a133b2
Home has a gear in the top-left that opens /connections, the connectors and MCP
screen that other threads are building (`src/app/(tabs)/index.tsx`,
`src/components/icon.tsx`).

### 2026-11-15 - a178b97
Home is now just Jesse: the orb, one warm question ("Hey Poom, how was lunch with
Sam?" or "how are you feeling?"), the Talk with Jesse button, the Voice chip and
the Connections gear. Before you forget, the evening card and the demo-seed button
are gone from Home. The typed ask and the sample conversation still show only
when there's no mic (`src/app/(tabs)/index.tsx`, `src/components/greeting.ts`).

### 2026-11-15 - 119963e
Listening keeps going with the phone locked. The audio session now asks for
background recording (allowsBackgroundRecording, shouldPlayInBackground) and the
expo-audio plugin sets enableBackgroundRecording, which adds the Android
microphone foreground service; iOS already had the audio background mode.
Chunks roll over on a 5 s check once 45 s have passed, and again when the app
comes back to the foreground, so a throttled timer can't stall them. Each chunk
file is deleted after upload even when the upload fails, and stop or unmount
removes any file left behind. Home shows a "Listening · since 2:10 PM" pill that
stops listening when tapped (`src/lib/listening.ts`, `src/app/(tabs)/index.tsx`,
`app.json`).

### 2026-11-15 - 7523eb4
The evening check-in notification now asks "Is now a good time?" with two
actions that also show on a paired Apple Watch: "Yes, let's talk" opens Reflect
in voice mode, where Jesse says tonight's question out loud first (tap Voice off
to silence it), and "Later" snoozes it for 30 minutes without opening the app.
A small "Check in now" button next to Sign out on Home fires the same
notification in 3 seconds for demos. Each step is recorded on tonight's
reflection as asked, accepted, snoozed or talked (`src/lib/notifications.ts`,
`src/app/reflect.tsx`, `src/app/(tabs)/index.tsx`, `convex/reflections.ts`,
`convex/schema.ts`). Convex features: public mutation with auth and ownership
check, index query, optional schema fields.

### 2026-11-15 - 2a17039
Connector infrastructure. One internal `ingest` action takes a normalized event
(source, kind, occurredAt, people, text) and runs the same rubric extractor as the
audio path (`extractNotes` in `convex/extract.ts`), so events from calendar,
iMessage, email or a conversation create the same people, items, topics and
follow-ups. Only Jesse's notes and a minimal source record (source, kind, time,
dedup hash) are stored, never the text. A `connections` table and screen show each
source as Live, Sample or Off; sample fixtures under
`convex/integrations/fixtures/` are marked as sample data. Three demo scenarios
(tim, mom, deck) feed events through the same path. New item kinds "goal" and
"concern" feed jesse.ask and the evening question. Convex features: internal
action, scheduler, index query, auth-scoped mutations (`convex/integrations/`,
`convex/connections.ts`, `convex/scenarios.ts`, `src/app/connections.tsx`).

### 2026-11-15 - b319baf
Jesse now runs its own MCP server, so a user's own Claude can read their Jesse
notes. It speaks MCP over Streamable HTTP at /mcp from a Convex httpAction:
JSON-RPC initialize, server/discover, tools/list and tools/call, stateless, with
JSON responses, for protocol versions 2025-03-26 through 2026-07-28. Each user
mints a personal access token in the app under "Connect your Claude". The app
shows it once, stores only its SHA-256 hash, and lets the user revoke it. Scopes
are read:memory and, optionally, write:notes. Requests without a valid token get
a 401, and every tool is scoped to the token's owner. The tools are
search_memory, list_open_promises, list_followups, get_person,
recent_conversations, get_goals_and_concerns and add_note (write:notes only).
They read the live tables, so an edit in the app shows up in the next call, and
they only return Jesse's notes because no raw text is kept. Convex features:
httpAction, internal query and mutation, index queries (`convex/mcp/*`,
`convex/http.ts`, `convex/schema.ts`, `src/app/mcp.tsx`).

### 2026-11-15 - bc71d62
Texts to Jesse become notes. A new Keiki tool, note_message, sends what the user
tells Jesse over iMessage to the same ingest action as every other source (kind
text_to_jesse on the live "iMessage with Jesse" connection), so a text like "had
coffee with Dev, he's moving to Austin" turns into a fact, plans and follow-ups.
The text itself is never stored. Convex features: HTTP action, internal action
(`convex/http.ts`, `convex/integrations/ingest.ts`).

### 2026-11-15 - 029419a
The Home greeting drops a trailing "demo" from the username, so the poomdemo
account says "Hey Poom" (`src/components/greeting.ts`).

### 2026-11-15 - aba09c7
Plans now shows each conversation's takeaways right under it: promises, plans,
small-but-urgent items and what others owe you, each with one inline action
(Going / Not now on plans, Add to calendar, Done, and Send follow-up when a
follow-up draft exists). A person's page is just their upcoming plans and the
conversation history. The suggested texts, notes composer and open-items strip
are gone from it (`src/app/(tabs)/plans.tsx`, `src/app/person/[id].tsx`,
`src/components/takeaway.tsx`, `src/data/plans.ts`).

### 2026-11-15 - 70b7e4e
The Home gear that opens Connections now sits above the title, so taps reach it
(`src/app/(tabs)/index.tsx`).

### 2026-11-15 - a938170
Two demo helpers on Connections. On the "iMessage with Jesse" row, Link my
iMessage creates a link code and opens Messages to Jesse's number with the link
text prefilled. A Load demo memories card asks for confirmation, then runs
seed.demo and the Tim, Mom and deck scenarios, so a fresh account fills Plans,
People and Ideas in one tap. Calls keiki.createLinkCode, seed.demo and
scenarios.run (`src/app/connections.tsx`).

### 2026-11-15 - 7d3c611
Warm Apricot theme, which Poom picked from three previews: a blush background, a
coral accent, a peach-to-rose orb, rounded Nunito type, softer and rounder cards
and softer shadows. All of it comes from one theme layer in the design tokens
(colors, fonts, radii, shadows, orb gradient). Linen and Sage stay available
through EXPO_PUBLIC_THEME. The orb glow, the Reflect screen and the Ideas brain
now follow the theme instead of hard-coded lavender, and the Home question uses
the heading font (`src/theme/tokens.ts`, `src/theme/fonts.ts`,
`src/components/orb.tsx`, `src/app/reflect.tsx`, `src/components/brain.tsx`).

### 2026-11-15 - cc82c0a
Jesse is now a capybara instead of an orb, on Home, the Home tab icon and the
Reflect header. It has four generated poses (idle, blink, talking, happy) and is
animated with Reanimated. It breathes, sways and blinks every few seconds. While
listening it leans in and bounces with ripples. While Jesse speaks, its mouth
moves in time with the voice (voice.ts now reports when it's speaking). It hops
and smiles when an answer or a new conversation arrives, and hops when tapped.
Reduce Motion is respected and the orb's accessibility labels are kept
(`src/components/orb.tsx`, `src/lib/voice.ts`, `src/app/(tabs)/index.tsx`,
`src/app/reflect.tsx`, `assets/jesse/`).

## Clay capybara assets (YCAP-9)

- Swapped Jesse's capybara art to Poom's pick, "soft clay 3D". Idle, blink, talk and happy come from one base image; the expression poses were generated as edits of it and only their face regions were blended onto idle, so ears, body and framing match frame to frame.
- Added a 96px `icon.png` that `OrbArt` uses for idle at 64px and below (tab icon, Reflect header). Animation code is unchanged.
- Verified: tsc and expo lint clean; Home and Reflect rendered on Expo web.

## Always-on Jesse and the abstract clay capybara (YCAP-9)

- Home no longer has a "Talk with Jesse" button. The capybara sits in the centre with the day's question under it and a small status pill: "Say “Hi Jesse” to start", "Listening", "Thinking…" or "Jesse is talking".
- New `src/lib/always-on.ts` records rolling 6-second chunks with expo-audio and transcribes each one through the existing `jesse.transcribe` action, so it works in Expo Go with no wake-word module. Saying "Hi Jesse" or "Hey Jesse" starts a conversation, and every following chunk goes to the existing `extract.processChunk` ingest. After about 48 seconds of silence it closes the conversation and goes back to waiting.
- `src/lib/wake.ts` holds the wake and address rules: it fuzzy-matches the name (Jessie, Jessy, Jess and similar) and only treats an utterance as addressed when it starts with the name, or has "Jesse," followed by a question or request. Only then does Jesse answer through `jesse.ask` and TTS. Recording pauses while Jesse speaks so it never hears itself.
- New capybara art: a rounder, simpler soft clay figure with dot eyes and tiny ears. Idle, blink, talk and happy come from one base image, with only the face blended onto idle, plus the 96px tab icon.
- Verified on Expo web with a fake microphone playing "Hey Jesse, what's on my plate tomorrow?": wake, Listening, the spoken answer and the status pill all worked end to end. tsc and expo lint are clean.

## Always-on review fixes (YCAP-9)

- Pausing Jesse while a chunk is still being transcribed no longer flips it back to Listening or answers while paused: transcriptions that finish after a stop are dropped.
- Ending a capture now waits for in-flight extraction requests before closing the conversation, so the last chunk's notes are not rejected.
- Verified: tsc and expo lint clean.

## Walk home redesign and Your Jesse (YCAP-9)

- New `walk` theme, now the default: a warm dark-brown background, cream Fraunces serif headlines, coral pill buttons. Every screen picks it up through the tokens, and hard-coded whites became `onAccent` / `onNight` tokens.
- Home is now the walk. The capybara sits in the centre, and under it a route card is built from real open items: up to three people with something open, then tonight's reflection as "One thought". "Start the walk" goes stop by stop: "Stop 2 of 4 · Mom", a progress bar, Jesse's line in big serif quotes (spoken unless voice is off), and Yes or Skip. Yes runs the existing action: send the drafted text, add the plan to the calendar, mark it done, or open the check-in. A spoken "yes" or "skip" works too, through the always-on listener; wake word, addressed replies and TTS are unchanged.
- "Your Jesse" customizer (`src/app/your-jesse.tsx`) with a live preview. Fur: six clay recolours made from the same art. Wearing: a scarf, beanie, headphones or flower, drawn in react-native-svg with clay-style gradients, in five colours. Mood: calm, happy or sleepy. Glow: five halo colours. The choice is saved on the device with the existing SecureStore/localStorage prefs, and the customised capybara shows everywhere, tab icon included.
- No new packages and no Convex changes. tsc and expo lint are clean.
