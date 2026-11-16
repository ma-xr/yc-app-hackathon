import { Stack } from 'expo-router/stack';

import { C } from '@/theme/tokens';

export default function ContactsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
