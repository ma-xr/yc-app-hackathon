# Hackathon log

- **Project:** yc-app-hackathon
- **What it does:** Not documented yet
- **Live app:** not deployed
- **Repo:** https://github.com/ma-xr/yc-app-hackathon
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/auth (core, password and username components)
- **Convex features:** schema, tables, indexes, queries, mutations, seed data, file storage, actions, scheduler
- **Auth:** Convex Auth
- **AI models:** OpenAI gpt-4o-transcribe-diarize (speech-to-text with speakers), gpt-5-mini (memory extraction), gpt-4o-mini-transcribe (voice questions), gpt-4o-mini-tts (Jesse's voice)
- **Started:** 2026-11-15T19:15:21Z
- **Last updated:** 2026-11-15T19:25:58Z

## Log

### 2026-11-15 - working tree
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

### 2026-11-15 - working tree
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

### 2026-11-15 - working tree
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

### 2026-11-15 - working tree
Added listening. A `useListening` hook records the conversation in 45-second
chunks with expo-audio and uploads each chunk to Convex file storage. An action
transcribes the chunk with speaker labels, deletes the audio, and asks an LLM
for strict JSON under Jesse's filtering rubric (commitments, small but urgent,
their life, open questions, themes, growth; small talk and gossip dropped; at
most 5 items of 12 words or fewer). A mutation matches heard names to people,
creates new people, merges facts, topics and the gist, infers how often you
talk, and counts the moments left out. The transcript only lives in the
action's memory (`src/lib/listening.ts`, `convex/extract.ts`,
`convex/conversations.ts`).

### 2026-11-15 - working tree
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

### 2026-11-15 - working tree
Extraction now hands every new promise or dated item to the follow-ups planner
through a typed internal reference, so a suggested text is planned as soon as a
conversation is processed (`convex/extract.ts`).

### 2026-11-15 - working tree
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

### 2026-11-15 - device config
Configured the native build for a real device and Revyl's cloud iPhone. The
app is named Jesse (bundle id com.maxr.jesse). Config plugins set the
microphone, calendar, reminders and contacts permission strings and turn on
background audio. Local notifications are on without the APNs entitlement, so
a free Apple Personal Team can sign the app. eas.json has simulator, preview
(ad hoc) and production profiles pointing at the dev Convex deployment. Checked
on a Revyl cloud iPhone 17 Pro Max: sign-up, sign-in, sign-out and session
persistence after relaunch all work (`app.json`, `eas.json`, `package.json`).

### 2026-11-15 - working tree
Built the People tab and person pages. The list shows recent people with
Jesse's latest note and what's open between you, plus "It's been a while" for
anyone past their inferred cadence, with a one-tap text. A person page shows
the archetype and cadence line, the Open strip (You owe / Owes you), Jesse's
notes on them (each editable, saved through people.update), suggested texts
from followups.forToday with Send and Not now, Coming up, and each
conversation's gist as Jesse's notes, never quotes. A composer adds a note
(`src/app/(tabs)/people.tsx`, `src/app/person/[id].tsx`,
`src/components/suggested-text.tsx`, `src/data/people.ts`).

### 2026-11-15 - working tree
Built the Plans tab, a trimmed calendar. A week switcher covers last, this and
next week, and a day strip marks days with conversations and days with plans.
Past days show each conversation's gist as Jesse's notes plus what was
promised, read from conversations.range. Future days show the open plans and
promises due that day, with Add to calendar and a text action, from
items.open. Nothing claims to come from email (`src/app/(tabs)/plans.tsx`,
`src/data/plans.ts`).

### 2026-11-15 - working tree
Built the Ideas tab ("On your mind"). An animated SVG brain fills four fixed
bubble slots with the top topics, with sparks for sub-ideas and a halo on the
selected one, all still under Reduce Motion. Below it are "Small but urgent"
items with Add to calendar and Done, topic folders with a sub-idea tree and
the conversations each idea came from, and a "Left out today" note summed from
today's conversations. Reads topics.list, items.open and conversations.today
(`src/app/(tabs)/ideas.tsx`, `src/components/brain.tsx`, `src/data/ideas.ts`).

### 2026-11-15 - working tree
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


### 2026-11-15 - working tree
Locked the Keiki secrets bootstrap: the public mutation now stores a value only
when its SHA-256 matches a hash committed in code, so nobody can claim the tool
token or API key on a fresh deployment. Convex features: mutation, Web Crypto in
the default runtime (`convex/keiki.ts`).

### 2026-11-15 - working tree
Fixed three iOS issues from the cloud-iPhone run. Mic failures on the orb, the
person page and Reflect now show "I can't hear you here, so try typing" instead
of the native error, and a failed hold-to-ask opens a text ask field on Home
that calls jesse.ask and speaks the answer. Reflect opens as a full-screen modal
so its composer stays above the keyboard, and Home shows a small "Talk to Jesse"
entry to Reflect whenever the evening card isn't up. Reads reflections.tonight,
calls jesse.ask (`src/app/(tabs)/index.tsx`, `src/app/_layout.tsx`,
`src/app/person/[id].tsx`, `src/app/reflect.tsx`).

### 2026-11-15 - working tree
Made the app boot and run in Expo Go (SDK 58) as a demo fallback. expo-calendar
is the only dependency Expo Go doesn't support, so it now loads lazily and only
outside Expo Go. Inside Expo Go, Add to calendar explains that it needs the
installed app, while listening, Jesse's answers, voice and every screen keep
working (`src/lib/actions.ts`).

### 2026-11-15 - working tree
Added a conversation page at /conversation/[id], opened from every conversation
card on Plans. It shows when and where the conversation was, who was there (each
person opens their page), Jesse's gist, and the promises, plans, notes, open
questions and topics that came out of it. Each item can be edited or forgotten,
and the page ends with "Jesse keeps notes, not words". The card widget moved to a
shared component. Reads conversations.get and topics.list
(`src/app/conversation/[id].tsx`, `src/components/conversation-card.tsx`,
`src/app/(tabs)/plans.tsx`).

### 2026-11-15 - working tree
The person page now lists "Your conversations" newest first, with the same card
as Plans (time, kind chip, title, gist and promises). Each card opens the
conversation page. Jesse's notes moved to the end of the page, after Ready to
send, Coming up and the conversation history. Reads people.get
(`src/app/person/[id].tsx`).

### 2026-11-15 - working tree
Dropped the "Small but urgent" section from the Ideas tab (it stays on Home) and
removed its now-unused hooks. The "From conversations" rows in each topic folder
are now buttons with a chevron and a pressed state: they open that conversation's
page, or the person's page when the item has no conversation. Reads topics.list
(`src/app/(tabs)/ideas.tsx`, `src/data/ideas.ts`).

### 2026-11-15 - working tree
Home is talk-first: a greeting under the orb names the user and today's latest
conversation ("Hey Poom, how was lunch with Sam?"), Jesse says it out loud once a
day unless the new Voice on/off chip is off, and a big "Talk with Jesse" button
opens Reflect. After a mic failure, "Try a sample conversation" sends a bundled
44 s TTS clip through conversations.start, extract.processChunk and
conversations.stop (`src/app/(tabs)/index.tsx`, `src/components/greeting.ts`,
`src/components/sign-in.tsx`, `src/lib/prefs.ts`, `src/lib/sample-conversation.ts`,
`src/data/hooks.ts`, `assets/audio/sample-conversation.m4a`).

### 2026-11-15 - working tree
Round-2 polish after the cloud-iPhone run. Once a sample conversation finishes,
typed answers show again. Voice off now stops answers and the greeting that are
still on their way. The daily greeting checks the date again when the app comes
back the next day. Plans hides empty conversations left behind by a mic failure.
The conversation page shows an end time only when it differs from the start
(`src/app/(tabs)/index.tsx`, `src/lib/sample-conversation.ts`,
`src/data/plans.ts`, `src/app/conversation/[id].tsx`).

### 2026-11-15 - working tree
Final polish. Nobody in the sample clip says the listener's name anymore, and the
extraction prompt now treats a name used to address the owner as the owner's,
never as a fact about someone else. Extraction skips a new open item that nearly
matches an open item already kept for the same person, so a second sample run
doesn't duplicate promises. The person page's Open strip shows three chips and a
"+N more" chip that scrolls to the conversation history. Added expo-asset to
package.json. Convex features: internal mutation, index query
(`convex/conversations.ts`, `convex/extract.ts`, `src/app/person/[id].tsx`,
`assets/audio/sample-conversation.m4a`).

### 2026-11-15 - working tree
Home has a gear in the top-left that opens /connections, the connectors and MCP
screen that other threads are building (`src/app/(tabs)/index.tsx`,
`src/components/icon.tsx`).

### 2026-11-15 - working tree
Home is now just Jesse: the orb, one warm question ("Hey Poom, how was lunch with
Sam?" or "how are you feeling?"), the Talk with Jesse button, the Voice chip and
the Connections gear. Before you forget, the evening card and the demo-seed button
are gone from Home. The typed ask and the sample conversation still show only
when there's no mic (`src/app/(tabs)/index.tsx`, `src/components/greeting.ts`).

### 2026-11-15 - working tree
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
