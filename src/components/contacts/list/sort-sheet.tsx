import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SORT_GROUPS, SORT_OPTIONS, type ContactSort } from '@/components/contacts/list/sort';
import { SectionLabel } from '@/components/ui';
import { C, F, S, T } from '@/theme/tokens';

export function SortPill({ sort, onPress }: { sort: ContactSort; onPress: () => void }) {
  const label = SORT_OPTIONS.find((o) => o.key === sort)!.short;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sorted by ${label}. Change sort`}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
      <Text style={styles.pillText}>
        Sorted by <Text style={{ color: C.ink }}>{label}</Text>
      </Text>
      <Icon name="chevronDown" size={14} color={C.muted} strokeWidth={2} />
    </Pressable>
  );
}

export function SortSheet({
  visible,
  sort,
  onSelect,
  onClose,
}: {
  visible: boolean;
  sort: ContactSort;
  onSelect: (sort: ContactSort) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Close sort" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.grabber} />
          {SORT_GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <SectionLabel style={styles.groupLabel}>{group.title}</SectionLabel>
              {group.options.map((o) => {
                const selected = o.key === sort;
                return (
                  <Pressable
                    key={o.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${o.label}. ${o.description}`}
                    onPress={() => {
                      onSelect(o.key);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.option, pressed && { backgroundColor: C.accentWash }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.optionLabel, selected && { color: C.accent }]}>{o.label}</Text>
                      <Text style={[T.meta, { fontFamily: F.regular }]}>{o.description}</Text>
                    </View>
                    {selected ? <Icon name="check" size={18} color={C.accent} strokeWidth={2.2} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.chipBorder,
  },
  pillText: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: S.cardRadius,
    borderTopRightRadius: S.cardRadius,
    paddingTop: 10,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 6 },
  group: { gap: 2 },
  groupLabel: { paddingHorizontal: S.screenX, paddingTop: 8, paddingBottom: 4 },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: S.screenX,
    paddingVertical: 8,
  },
  optionLabel: { fontFamily: F.semibold, fontSize: 16, color: C.ink },
});
