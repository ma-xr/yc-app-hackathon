import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ContactAvatar } from '@/components/contacts/contact-avatar';
import type { ContactsOverview } from '@/components/contacts/list/sort';
import { firstName } from '@/components/format';
import { SectionLabel } from '@/components/ui';
import { C, F, S } from '@/theme/tokens';

export function FocusRow({
  people,
  onOpen,
}: {
  people: ContactsOverview['focus'];
  onOpen: (id: ContactsOverview['focus'][number]['_id']) => void;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionLabel style={styles.label}>Right now</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {people.slice(0, 5).map((p) => (
          <Pressable
            key={p._id}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${p.reason}`}
            onPress={() => onOpen(p._id)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
            <ContactAvatar name={p.name} photoUrl={p.photoUrl} avatarKey={p.avatarKey} size={56} />
            <Text style={styles.name} numberOfLines={1}>
              {firstName(p.name)}
            </Text>
            <Text style={styles.reason} numberOfLines={2}>
              {p.reason}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { paddingHorizontal: S.screenX },
  scroll: { paddingHorizontal: S.screenX, gap: 14 },
  item: { width: 84, alignItems: 'center', gap: 4 },
  name: { fontFamily: F.semibold, fontSize: 14, color: C.ink, marginTop: 4 },
  reason: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted, textAlign: 'center' },
});
