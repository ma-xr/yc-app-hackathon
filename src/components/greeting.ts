import { firstName } from '@/components/format';
import type { Conversation, Person } from '@/data/hooks';

const MEALS = ['coffee', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks', 'class'];

export function displayName(username: string | null) {
  const letters = username?.match(/^[a-zA-Z]+/)?.[0];
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
  const hey = name ? `Hey ${name}` : 'Hey there';
  const latest = conversations.find((c) => c.status !== 'listening' && c.people.length > 0);
  if (latest) {
    const place = latest.place?.toLowerCase();
    const what = place && MEALS.includes(place) ? place : 'catching up';
    return `${hey}, how was ${what} with ${names(latest.people)}?`;
  }
  return `${hey}, how are you feeling?`;
}
