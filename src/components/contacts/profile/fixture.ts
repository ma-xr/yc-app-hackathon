import type { Id } from '../../../../convex/_generated/dataModel';
import type { ContactProfile, Interaction } from '@/components/contacts/profile/types';

const DAY = 86_400_000;
const now = Date.now();
const conv = (n: number) => `fixture-conv-${n}` as Id<'conversations'>;
const src = (n: number, title: string, daysAgo: number) => ({
  conversationId: conv(n),
  title,
  startedAt: now - daysAgo * DAY,
});

export const FIXTURE_PROFILE = {
  person: {
    _id: 'fixture-person' as Id<'people'>,
    _creationTime: now - 600 * DAY,
    ownerId: 'fixture-user' as Id<'users'>,
    name: 'Maya Okafor',
    facts: [],
    lastSeenAt: now - 2 * DAY,
    conversationCount: 41,
    phones: ['+1 (415) 555-0142'],
    emails: ['maya@okafor.studio'],
    birthday: { month: 11, day: 27, year: 1995 },
    knownSince: new Date(2023, 2, 4).getTime(),
    lastInteractionAt: now - 2 * DAY,
    totalMinutes: 2_870,
    encounterCount: 41,
    depthScore: 4.3,
    photoUrl: null,
  },
  age: 30,
  nextBirthdayInDays: 12,
  facts: [
    { kind: 'from', text: 'Grew up in Lagos, moved to Oakland at 14', learnedAt: now - 400 * DAY, source: src(1, 'Dinner at Nopalito', 400) },
    { kind: 'relationship', text: 'Close friend', learnedAt: now - 300 * DAY, source: null },
    { kind: 'how_met', text: 'Pottery class at Clay by the Bay', learnedAt: now - 600 * DAY, source: null },
    { kind: 'working_on', text: 'Opening her own ceramics studio in the Mission', learnedAt: now - 34 * DAY, source: src(2, 'Coffee at Sightglass', 34) },
    { kind: 'working_on', text: 'Training for the Berkeley half marathon', learnedAt: now - 9 * DAY, source: src(3, 'Run at Lake Merritt', 9) },
    { kind: 'matters', text: 'Making work people use every day, not gallery pieces', learnedAt: now - 120 * DAY, source: src(4, 'Walk in Dolores Park', 120) },
    { kind: 'interest', text: 'Wheel throwing', learnedAt: now - 600 * DAY, source: null },
    { kind: 'interest', text: 'Afrobeat', learnedAt: now - 200 * DAY, source: null },
    { kind: 'interest', text: 'Bouldering', learnedAt: now - 90 * DAY, source: null },
    { kind: 'interest', text: 'Natural wine', learnedAt: now - 60 * DAY, source: null },
    { kind: 'family', text: 'Partner Theo, a nurse at UCSF', learnedAt: now - 250 * DAY, source: src(5, 'Theo’s birthday', 250) },
    { kind: 'family', text: 'Younger brother Dayo starting at Stanford', learnedAt: now - 70 * DAY, source: null },
    { kind: 'life_event', text: 'Signed the studio lease in October', learnedAt: now - 30 * DAY, source: src(6, 'Call about the lease', 30) },
    { kind: 'place', text: 'Sightglass Coffee, 7th St', learnedAt: now - 34 * DAY, source: null },
    { kind: 'place', text: 'Lake Merritt loop', learnedAt: now - 9 * DAY, source: null },
    { kind: 'gift_idea', text: 'A good apron with deep pockets', learnedAt: now - 20 * DAY, source: src(7, 'Studio visit', 20) },
    { kind: 'style', text: 'Thinks out loud; likes a direct second opinion', learnedAt: now - 100 * DAY, source: null },
    { kind: 'food', text: 'Vegetarian, loves anything with jollof', learnedAt: now - 300 * DAY, source: null },
    { kind: 'avoid', text: 'Asking about her old job at the agency', learnedAt: now - 150 * DAY, source: null },
  ],
  promises: {
    youOwe: [{ _id: 'fixture-item-1' as Id<'items'>, text: 'Intro her to Priya for the studio branding', dueAt: now + 3 * DAY }],
    theyOwe: [{ _id: 'fixture-item-2' as Id<'items'>, text: 'Send the kiln supplier list' }],
  },
} as unknown as ContactProfile;

const TITLES: [Interaction['kind'], string, string | undefined, number, string[]][] = [
  ['in_person', 'Run around Lake Merritt', 'Lake Merritt', 55, ['Half marathon is in five weeks', 'Her knee is holding up after physio', 'Wants to try a Sunday long-run group']],
  ['text', 'Lease paperwork questions', undefined, 0, ['Asked whether the landlord can require a personal guarantee', 'You sent the template Theo used']],
  ['in_person', 'Studio visit', 'Okafor Studio', 90, ['Walked through the empty space and the kiln corner', 'Needs a sink plumbed before January', 'Talked through pricing for the first classes', 'She wants a good apron']],
  ['call', 'Call about the lease', undefined, 25, ['Signed the lease Tuesday', 'Nervous about the first six months of rent', 'You promised the intro to Priya']],
  ['in_person', 'Coffee at Sightglass', 'Sightglass Coffee', 45, ['Decided to leave the shared studio', 'Comparing two spaces in the Mission', 'Asked for help with branding']],
  ['in_person', 'Bouldering at Mission Cliffs', 'Mission Cliffs', 80, ['First time on the overhang wall', 'Theo is thinking about night shifts']],
  ['text', 'Dayo moved into Stanford', undefined, 0, ['Sent photos of move-in day', 'Proud and a little sad']],
  ['in_person', 'Walk in Dolores Park', 'Dolores Park', 60, ['Wants her work used every day, not shelved', 'Thinking about teaching beginners', 'Recommended a ceramics podcast']],
  ['call', 'Catch-up call', undefined, 35, ['Summer plans in Lisbon fell through', 'Planning a trip to Lagos in spring']],
  ['in_person', 'Dinner at Nopalito', 'Nopalito', 110, ['Long talk about growing up in Lagos', 'Moved to Oakland at 14', 'Her mum taught her to cook jollof']],
];

export const FIXTURE_HISTORY: Interaction[] = Array.from({ length: 30 }, (_, i) => {
  const [kind, title, placeName, minutes, points] = TITLES[i % TITLES.length];
  return {
    _id: `fixture-int-${i}` as Id<'interactions'>,
    _creationTime: now,
    ownerId: 'fixture-user' as Id<'users'>,
    personId: 'fixture-person' as Id<'people'>,
    kind,
    startedAt: now - (2 + i * 9 + (i % 3)) * DAY,
    minutes,
    placeName,
    title,
    points,
    depth: 3 + (i % 3),
    fun: 3 + (i % 2),
  };
});
