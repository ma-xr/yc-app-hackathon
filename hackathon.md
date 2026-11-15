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
- **AI models:** OpenAI gpt-4o-transcribe-diarize (speech-to-text with speakers), gpt-5-mini (memory extraction)
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
