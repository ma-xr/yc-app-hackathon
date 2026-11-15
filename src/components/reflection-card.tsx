import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { C, F, S, T } from '@/theme/tokens';

export function ReflectionCard({ question }: { question: string }) {
  const router = useRouter();
  const [later, setLater] = useState(false);
  if (later) return null;
  return (
    <View style={styles.card}>
      <Text style={[T.label, { color: C.darkCardMuted }]}>Tonight’s reflection</Text>
      <Text style={styles.question}>{question}</Text>
      <View style={styles.actions}>
        <Button label="Reflect · 2 min" onPress={() => router.push('/reflect')} />
        <Button label="Later" variant="outlineLight" onPress={() => setLater(true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.ink, borderRadius: S.cardRadius, padding: 20, gap: 12 },
  question: { fontFamily: F.display, fontSize: 20, lineHeight: 26, color: '#FFFFFF' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
