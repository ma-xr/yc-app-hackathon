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
Built the Plans tab, a trimmed calendar. A week switcher covers last, this and
next week, and a day strip marks days with conversations and days with plans.
Past days show each conversation's gist as Jesse's notes plus what was
promised, read from conversations.range. Future days show the open plans and
promises due that day, with Add to calendar and a text action, from
items.open. Nothing claims to come from email (`src/app/(tabs)/plans.tsx`,
`src/data/plans.ts`).
