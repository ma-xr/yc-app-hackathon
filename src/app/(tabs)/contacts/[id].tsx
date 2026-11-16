import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { FactSections } from '@/components/contacts/profile/fact-sections';
import { monthKey } from '@/components/contacts/profile/format';
import { HistoryEntry, MonthHeader } from '@/components/contacts/profile/history-entry';
import { ProfileHeader } from '@/components/contacts/profile/profile-header';
import type { Interaction } from '@/components/contacts/profile/types';
import { Icon } from '@/components/icon';
import { useNow } from '@/data/hooks';
import { C, S, T } from '@/theme/tokens';

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personId = id as Id<'people'>;
  const router = useRouter();
  const data = useQuery(api.contacts.get, { personId });
  const history = usePaginatedQuery(api.contacts.history, { personId }, { initialNumItems: 20 });
  const { results, status } = history;
  const now = useNow();

  const sections = useMemo(() => {
    const out: { title: string; data: Interaction[] }[] = [];
    for (const item of results) {
      const title = monthKey(item.startedAt);
      const last = out[out.length - 1];
      if (last?.title === title) last.data.push(item);
      else out.push({ title, data: [item] });
    }
    return out;
  }, [results]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}>
          <Icon name="chevronLeft" color={C.ink} />
        </Pressable>
      </View>
      {data === undefined ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              <ProfileHeader data={data} now={now} />
              <FactSections data={data} now={now} />
              <Text accessibilityRole="header" style={styles.historyTitle}>
                History
              </Text>
              {status === 'LoadingFirstPage' ? <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} /> : null}
              {status === 'Exhausted' && results.length === 0 ? (
                <Text style={styles.empty}>Nothing yet. Time together will show up here.</Text>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => <MonthHeader title={section.title} />}
          renderItem={({ item, index, section }) => (
            <HistoryEntry item={item} last={index === section.data.length - 1} />
          )}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (status === 'CanLoadMore') history.loadMore(20);
          }}
          ListFooterComponent={
            status === 'LoadingMore' ? <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} /> : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: { height: S.touch, justifyContent: 'center', paddingHorizontal: S.screenX - 10 },
  back: { width: S.touch, height: S.touch, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: S.tabBar + 32 },
  historyTitle: { ...T.appName, marginTop: 40, marginBottom: 4, paddingHorizontal: S.screenX },
  empty: { ...T.bodySmall, color: C.muted, paddingHorizontal: S.screenX, marginTop: 8 },
});
