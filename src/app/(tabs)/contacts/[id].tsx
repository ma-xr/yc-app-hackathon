import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useContact, useContactHistory, type ConversationRecord } from '@/components/contacts/data';
import { FactSections } from '@/components/contacts/profile/fact-sections';
import { monthKey } from '@/components/contacts/profile/format';
import { HistoryEntry, MonthHeader } from '@/components/contacts/profile/history-entry';
import { ProfileHeader } from '@/components/contacts/profile/profile-header';
import { Icon } from '@/components/icon';
import { SkeletonCard } from '@/components/motion';
import { IconButton, PressableScale } from '@/components/pressable-scale';
import { useNow } from '@/data/hooks';
import { C, F, S, T } from '@/theme/tokens';

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const data = useContact(id);
  const history = useContactHistory(id);
  const { results, status } = history;
  const now = useNow();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/contacts'));

  const sections = useMemo(() => {
    const out: { title: string; data: ConversationRecord[] }[] = [];
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
        <IconButton accessibilityLabel="Back" onPress={goBack}>
          <Icon name="chevronLeft" color={C.ink} />
        </IconButton>
      </View>
      {data === undefined ? (
        <View style={styles.loading}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : data === null ? (
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Contact not found</Text>
          <Text style={styles.empty}>They may have been removed.</Text>
          <PressableScale accessibilityRole="button" onPress={goBack} hitSlop={8} style={styles.missingBack}>
            <Text style={styles.missingBackText}>Back to contacts</Text>
          </PressableScale>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              <ProfileHeader data={data} now={now} />
              <FactSections data={data} now={now} />
              <Text accessibilityRole="header" style={styles.historyTitle}>
                Conversations
              </Text>
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
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: { height: S.touch, justifyContent: 'center', paddingHorizontal: S.screenX - 10 },
  loading: { paddingHorizontal: S.screenX, paddingTop: 16, gap: 12 },
  content: { paddingBottom: S.tabBar + 32 },
  historyTitle: { ...T.appName, marginTop: 40, marginBottom: 4, paddingHorizontal: S.screenX },
  missing: { alignItems: 'center', paddingTop: 80, paddingHorizontal: S.screenX, gap: 6 },
  missingTitle: { ...T.appName, textAlign: 'center' },
  missingBack: { minHeight: S.touch, justifyContent: 'center', marginTop: 12 },
  missingBackText: { fontFamily: F.semibold, fontSize: 15, color: C.accentDeep },
  empty: { ...T.bodySmall, color: C.muted, paddingHorizontal: S.screenX, marginTop: 8 },
});
