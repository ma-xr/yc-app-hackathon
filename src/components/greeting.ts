import { firstName } from '@/components/format';
import type { Conversation, Person } from '@/data/hooks';

const MEALS = ['coffee', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks', 'class'];

export function displayName(username: string | null) {
  const letters = username?.match(/^[a-zA-Z]+/)?.[0]?.replace(/(.{2,})demo$/i, '$1');
  return letters ? letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() : null;
}

function names(people: Person[]) {
  const first = people.slice(0, 2).map((p) => firstName(p.name));
  return first.join(' and ');
}

export function greetingLine(
  name: string | null,
  conversations: (Conversation & { people: Person[] })[],
) {
  const hey = name ? `Hey ${name}!` : 'Hey, you!';
  const live = conversations
    .filter((c) => c.status !== 'listening' && c.people.length > 0)
    .reduce<(Conversation & { people: Person[] }) | undefined>(
      (best, c) => (!best || Math.abs(c.mood ?? 0) > Math.abs(best.mood ?? 0) ? c : best),
      undefined,
    );
  if (!live) return `${hey} I'm so glad you're here. How's your day going?`;
  const who = names(live.people);
  const place = live.place?.toLowerCase();
  const meal = place && MEALS.includes(place) ? place : null;
  const mood = live.mood ?? 0;
  if (mood < 0) return `${hey} I'm really glad you came by. How are you doing after ${meal ? `${meal} with` : 'seeing'} ${who}?`;
  if (mood > 0) return `${hey} Okay, I need to hear about ${meal ? `${meal} with` : 'seeing'} ${who}. That seemed like a good one!`;
  return meal
    ? `${hey} So good to see you. How ${meal === 'drinks' ? 'were' : 'was'} ${meal} with ${who}?`
    : `${hey} So good to see you. How'd it go with ${who}?`;
}
