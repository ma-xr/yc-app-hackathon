export type ContactSort = 'recent' | 'time' | 'deepest' | 'encounters' | 'fun' | 'compatible' | 'deepTalk';
export type Relationship = 'work' | 'friend' | 'family' | 'other';
export type Channel = 'in_person' | 'call' | 'text';

export type FactSource = { title: string; at: number };
export type Fact = { text: string; source?: FactSource };

export type ContactSummary = {
  id: string;
  name: string;
  avatarKey?: string;
  photoUrl?: string | null;
  relationship: Relationship;
  roleLabel: string;
  relationshipSummary: string;
  lastInteractionAt?: number;
  totalMinutes: number;
  encounterCount: number;
  distinctTopicCount: number;
  funScore: number;
  compatibilityScore: number;
  deepTalkScore: number;
};

export type OpenPromise = { direction: 'you' | 'they'; text: string; dueAt?: number };

export type ContactProfile = ContactSummary & {
  phones: string[];
  emails: string[];
  birthday?: { month: number; day: number; year?: number };
  knownSince?: number;
  from?: Fact;
  workingOn?: Fact;
  interests: Fact[];
  whatMatters: Fact[];
  howWeMet?: Fact;
  family: Fact[];
  lifeEvents: Fact[];
  places: Fact[];
  giftIdeas: Fact[];
  style?: Fact;
  food: Fact[];
  avoid: Fact[];
  openPromises: OpenPromise[];
};

export type ConversationRecord = {
  id: string;
  startedAt: number;
  minutes: number;
  channel: Channel;
  placeName?: string;
  title: string;
  topics: string[];
  mood: number;
  points: string[];
};

export type ContactsOverview = {
  total: number;
  lastSyncedAt: number | null;
  focus: { contact: ContactSummary; reason: string }[];
};

type MockFact = { text: string; source?: { title: string; ago: number } };

export type MockContact = Omit<
  ContactProfile,
  | 'lastInteractionAt'
  | 'knownSince'
  | 'from'
  | 'workingOn'
  | 'interests'
  | 'whatMatters'
  | 'howWeMet'
  | 'family'
  | 'lifeEvents'
  | 'places'
  | 'giftIdeas'
  | 'style'
  | 'food'
  | 'avoid'
  | 'openPromises'
  | 'relationship'
> & {
  relationship: string;
  lastAgo?: number;
  knownAgo?: number;
  from?: MockFact;
  workingOn?: MockFact;
  interests: MockFact[];
  whatMatters: MockFact[];
  howWeMet?: MockFact;
  family: MockFact[];
  lifeEvents: MockFact[];
  places: MockFact[];
  giftIdeas: MockFact[];
  style?: MockFact;
  food: MockFact[];
  avoid: MockFact[];
  openPromises: { direction: string; text: string; dueIn?: number }[];
  conversations: (Omit<ConversationRecord, 'startedAt' | 'channel' | 'placeName'> & {
    ago: number;
    channel: string;
    placeName?: string | null;
  })[];
};
