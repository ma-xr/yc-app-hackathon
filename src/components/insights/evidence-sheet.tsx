import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { time, weekdayDate } from '@/components/format';
import { useEvidence, useInsightActions } from '@/components/insights/data';
import { MoodDot, moodWord } from '@/components/insights/parts';
import { Enter, SkeletonCard } from '@/components/motion';
import { EvidenceContext, type EvidenceRequest } from '@/components/insights/sheet-context';
import { Button, Chip, Divider } from '@/components/ui';
import { C, F, S, T } from '@/theme/tokens';

export function EvidenceProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<EvidenceRequest | null>(null);
  return (
    <EvidenceContext.Provider value={setReq}>
      {children}
      <Modal visible={req !== null} transparent animationType="slide" onRequestClose={() => setReq(null)}>
        {req ? <EvidenceSheet req={req} onClose={() => setReq(null)} /> : null}
      </Modal>
    </EvidenceContext.Provider>
  );
}

export function EvidenceSheet({ req, onClose }: { req: EvidenceRequest; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const moments = useEvidence(req.conversationIds);
  const { removeTrait } = useInsightActions();
  const [flagged, setFlagged] = useState(false);
  const openContact = (id: string) => {
    onClose();
    router.push({ pathname: '/person/[id]', params: { id } });
  };
  const personId = req.personId ?? moments?.find((m) => m.people.length)?.people[0]?._id;

  return (
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text accessibilityRole="header" style={styles.title}>
          {req.title}
        </Text>
        {req.sub ? <Text style={[T.bodySmall, { color: C.muted }]}>{req.sub}</Text> : null}
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 0 }}>
          <Text style={[T.label, { marginTop: 8, marginBottom: 4 }]}>
            {req.traitId && !req.conversationIds.length ? 'Where this came from' : 'From these conversations'}
          </Text>
          {moments === undefined ? (
            <SkeletonCard />
          ) : moments.length === 0 ? (
            <Text style={T.meta}>
              {req.traitId ? 'You told Jesse this yourself in Talk.' : 'Worked out from your stored labels. Nothing to replay.'}
            </Text>
          ) : (
            moments.map((m, i) => (
              <Enter key={m._id} index={i}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.moment}>
                  <View style={styles.momentTop}>
                    <MoodDot mood={m.mood} />
                    <Text style={[T.cardTitle, { flex: 1 }]} numberOfLines={1}>
                      {m.place ?? 'Somewhere'}
                    </Text>
                    <Text style={T.meta}>
                      {weekdayDate(m.startedAt)} · {time(m.startedAt)}
                    </Text>
                  </View>
                  <Text style={T.meta}>
                    {[m.people.map((p) => p.name).join(', '), `${m.minutes} min`, `felt ${moodWord(m.mood)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {m.summaryLine ? <Text style={T.bodySmall}>{m.summaryLine}</Text> : null}
                  {m.topics.length ? (
                    <View style={styles.chips}>
                      {m.topics.slice(0, 4).map((t) => (
                        <Chip key={t} tone="neutral">
                          {t}
                        </Chip>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Enter>
            ))
          )}
          <Text style={[T.meta, { marginTop: 8 }]}>Labels only. Jesse keeps no transcript.</Text>
        </ScrollView>
        {flagged ? <Text style={[T.meta, { color: C.greenText }]}>Got it. Tell Jesse in Talk what was off so it can learn from it.</Text> : null}
        <View style={styles.actions}>
          {req.traitId ? (
            <Button
              label="Remove"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => {
                removeTrait({ traitId: req.traitId! }).catch(() => {});
                onClose();
              }}
            />
          ) : (
            <Button label="This is off" variant="outline" style={{ flex: 1 }} onPress={() => setFlagged(true)} />
          )}
          {personId ? <Button label="Open contact" style={{ flex: 1 }} onPress={() => openContact(personId)} /> : null}
        </View>
        <Button label="Close" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: S.cardRadius,
    borderTopRightRadius: S.cardRadius,
    paddingHorizontal: S.screenX,
    paddingTop: 10,
    gap: 8,
  },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.chipBorder, marginBottom: 6 },
  title: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink },
  moment: { gap: 4, paddingVertical: 10 },
  momentTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
