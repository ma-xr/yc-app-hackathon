import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import { ContactAvatar } from '@/components/contacts/contact-avatar';

const FIXTURE = __DEV__ && !!process.env.EXPO_PUBLIC_INSIGHTS_FIXTURE;

export function PersonAvatar({ id, name, size }: { id: string; name: string; size: number }) {
  const contacts = useQuery(api.contacts.list, FIXTURE ? 'skip' : {});
  const match = contacts?.find((c) => c._id === id);
  return <ContactAvatar name={name} size={size} photoUrl={match?.photoUrl} avatarKey={match?.avatarKey ?? undefined} />;
}
