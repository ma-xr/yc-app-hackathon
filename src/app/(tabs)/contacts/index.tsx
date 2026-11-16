import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useContactsSync } from '@/lib/contacts-source';
import { useContacts, useContactsOverview, type ContactSummary } from '@/components/contacts/data';
import { ContactRow, ROW_HEIGHT, RowDivider } from '@/components/contacts/list/contact-row';
import { FocusRow } from '@/components/contacts/list/focus-row';
import { metricFor, syncedLabel, type ContactSort } from '@/components/contacts/list/sort';
import { SortPill, SortSheet } from '@/components/contacts/list/sort-sheet';
import { Icon } from '@/components/icon';
import { SkeletonCard } from '@/components/motion';
import { IconButton } from '@/components/pressable-scale';
import { Button } from '@/components/ui';
import { useNow } from '@/data/hooks';
import { C, F, S, T } from '@/theme/tokens';

export default function ContactsScreen() {
  const router = useRouter();
  const now = useNow();
  const [sort, setSort] = useState<ContactSort>('recent');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [connecting, setConnecting] = useState(false);

  const rows = useContacts(sort);
  const overview = useContactsOverview();
  const { sync } = useContactsSync();

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      !rows || !query
        ? rows
        : rows.filter((r) => [r.name, r.relationshipSummary, r.roleLabel].some((s) => s.toLowerCase().includes(query))),
    [rows, query],
  );

  const open = useCallback((id: string) => router.push(`/contacts/${id}` as Href), [router]);

  const connect = async () => {
    setConnecting(true);
    try {
      await sync();
    } finally {
      setConnecting(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: ContactSummary }) => (
      <ContactRow
        name={item.name}
        photoUrl={item.photoUrl ?? null}
        avatarKey={item.avatarKey}
        subtitle={item.relationshipSummary}
        metric={metricFor(sort, item, now)}
        onPress={() => open(item.id)}
      />
    ),
    [sort, now, open],
  );

  const loading = rows === undefined || overview === undefined;
  const empty = !loading && rows.length === 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={T.h1}>
          Contacts
        </Text>
        {overview && overview.total > 0 ? (
          <View style={styles.synced}>
            <Icon name="check" size={13} color={C.greenText} strokeWidth={2.4} />
            <Text style={styles.syncedText}>
              {syncedLabel(overview.lastSyncedAt, now)} · {overview.total.toLocaleString()} contacts
            </Text>
          </View>
        ) : null}
      </View>
      {empty ? null : (
        <>
          <View style={styles.search}>
            <Icon name="search" size={16} color={C.mutedIcon} strokeWidth={2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={C.mutedIcon}
              accessibilityLabel="Search contacts"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={styles.searchInput}
            />
            {search ? (
              <IconButton accessibilityLabel="Clear search" size={24} onPress={() => setSearch('')}>
                <Icon name="x" size={14} color={C.mutedIcon} strokeWidth={2.2} />
              </IconButton>
            ) : null}
          </View>
          {query || !overview ? null : <FocusRow people={overview.focus} onOpen={open} />}
          <View style={styles.sortBar}>
            <SortPill sort={sort} onPress={() => setSheetOpen(true)} />
          </View>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        data={loading ? [] : visible}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT + StyleSheet.hairlineWidth, offset: (ROW_HEIGHT + StyleSheet.hairlineWidth) * index, index })}
        ItemSeparatorComponent={RowDivider}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : empty ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Connect your contacts</Text>
              <Text style={[T.body, { color: C.muted, textAlign: 'center' }]}>
                Jesse keeps each person’s story — what they care about, what you promised, and every moment you’ve
                shared.
              </Text>
              <Button
                label={connecting ? 'Connecting…' : 'Connect contacts'}
                icon="users"
                onPress={connecting ? undefined : connect}
                style={{ marginTop: 8, alignSelf: 'center' }}
              />
            </View>
          ) : (
            <Text style={[T.meta, styles.noMatch]}>No one matches “{search.trim()}”</Text>
          )
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
      <SortSheet visible={sheetOpen} sort={sort} onSelect={setSort} onClose={() => setSheetOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: S.screenTop, gap: 20, paddingBottom: 8 },
  titleBlock: { paddingHorizontal: S.screenX, gap: 6 },
  synced: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncedText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  search: {
    marginHorizontal: S.screenX,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 40, fontFamily: F.regular, fontSize: 15, color: C.ink, outlineStyle: 'none' } as object,
  loading: { paddingHorizontal: S.screenX, paddingTop: 16, gap: 12 },
  sortBar: { paddingHorizontal: S.screenX, paddingTop: 4 },
  empty: { paddingHorizontal: 32, paddingTop: 72, gap: 10, alignItems: 'center' },
  emptyTitle: { fontFamily: F.display, fontSize: 24, lineHeight: 30, color: C.ink, textAlign: 'center' },
  noMatch: { paddingHorizontal: S.screenX, paddingTop: 24, textAlign: 'center' },
});
