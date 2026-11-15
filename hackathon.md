# Hackathon log

- **Project:** yc-app-hackathon
- **What it does:** Not documented yet
- **Live app:** not deployed
- **Repo:** https://github.com/ma-xr/yc-app-hackathon
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @convex-dev/auth (core, password and username components)
- **Convex features:** schema, tables, indexes, queries, mutations, seed data
- **Auth:** Convex Auth
- **AI models:** none
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

