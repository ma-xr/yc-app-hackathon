import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { Icon } from '@/components/icon';
import { OrbArt } from '@/components/orb';
import { LocationSettings } from '@/components/location-settings';
import { Enter, SkeletonCard } from '@/components/motion';
import { IconButton } from '@/components/pressable-scale';
import { Button, Card, Chip, Divider, EmptyCard, SectionLabel, type Tone } from '@/components/ui';
import { openComposer } from '@/lib/actions';
import { importDeviceContacts } from '@/lib/contacts';
import { useCheckInNow } from '@/lib/notifications';
import { fadeIn, fadeOut, layout } from '@/theme/motion';
import { C, F, S, T } from '@/theme/tokens';

const MODE: Record<'live' | 'sample' | 'off', { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'green' },
  sample: { label: 'Sample data', tone: 'amber' },
  off: { label: 'Off', tone: 'neutral' },
};

function ago(ms: number) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function Result({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Animated.Text key={text} entering={fadeIn} exiting={fadeOut} layout={layout} style={[T.meta, { flexShrink: 1 }]}>
      {text}
    </Animated.Text>
  );
}

function queuedMessage(res: { queued: number; skipped: number }, skippedText: string, home = false) {
  if (res.queued === 0) return skippedText;
  const base = `Queued ${res.queued} event${res.queued === 1 ? '' : 's'}`;
  return home ? `${base} — check Home in a few seconds` : base;
}

export default function ConnectionsScreen() {
  const { signOut } = useAuthActions();
  const checkInNow = useCheckInNow();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const connections = useQuery(api.connections.list);
  const scenarios = useQuery(api.scenarios.list);
  const loadSample = useMutation(api.connections.loadSample);
  const importContacts = useMutation(api.connections.importContacts);
  const runScenario = useMutation(api.scenarios.run);
  const createLinkCode = useMutation(api.keiki.createLinkCode);
  const seedDemo = useMutation(api.seed.demo);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const act = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    try {
      const msg = await fn();
      setResults((r) => ({ ...r, [id]: msg }));
    } catch {
      setResults((r) => ({ ...r, [id]: 'That didn’t work. Try again.' }));
    } finally {
      setBusy(null);
    }
  };

  const linkIMessage = (id: string) =>
    act(id, async () => {
      const { text, number } = await createLinkCode({});
      if (!number) return 'Jesse’s number isn’t set up yet';
      const result = await openComposer({ phone: number, body: text });
      if (result === 'unavailable') return `Text “${text}” to ${number}`;
      return result === 'cancelled' ? 'Not sent' : 'Sent. Jesse replies once it’s linked';
    });

  const loadDemo = () =>
    act('demo', async () => {
      await seedDemo({});
      let queued = 0;
      for (const name of ['tim', 'mom', 'deck'] as const) {
        queued += (await runScenario({ name })).queued;
      }
      return `Demo memories loaded, plus ${queued} scenario events. Check Plans in a few seconds`;
    });

  const confirmLoadDemo = () => {
    const message = 'This replaces everything Jesse has kept on this account with demo memories.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) void loadDemo();
      return;
    }
    Alert.alert('Load demo memories?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => void loadDemo() },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Icon name="chevronLeft" color={C.ink} />
        </IconButton>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          Connections
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never">
        <Enter index={0} style={styles.section}>
          <SectionLabel>You</SectionLabel>
          <Card style={styles.you}>
            <OrbArt size={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={T.cardTitle}>Your Jesse</Text>
              <Text style={T.bodySmall}>Fur, something to wear, mood and glow.</Text>
            </View>
            <Button compact label="Customize" haptic={false} onPress={() => router.push('/your-jesse' as Href)} />
          </Card>
          <View style={styles.actions}>
            <Button compact variant="outline" label="Check in now" onPress={() => void checkInNow()} />
            <Button compact variant="outline" label="Sign out" onPress={() => void signOut()} />
          </View>
        </Enter>

        <Enter index={1} style={styles.section}>
          <SectionLabel style={{ marginTop: 8 }}>Sources</SectionLabel>
          {connections === undefined ? (
            <SkeletonCard lines={3} />
          ) : connections.length === 0 ? (
            <EmptyCard>No sources yet. They show up here once Jesse can reach them.</EmptyCard>
          ) : (
            <Animated.View entering={fadeIn} layout={layout}>
              <Card style={{ paddingVertical: 4 }}>
                {connections.map((c, i) => {
                  const mode = MODE[c.mode];
                  const id = `conn:${c.key}`;
                  const isContacts = c.key === 'contacts';
                  const onWeb = Platform.OS === 'web';
                  const stats = [
                    c.itemCount > 0 ? `${c.itemCount} item${c.itemCount === 1 ? '' : 's'}` : null,
                    c.lastSyncAt ? `last synced ${ago(c.lastSyncAt)}` : null,
                  ].filter(Boolean);
                  return (
                    <Animated.View key={c.key} layout={layout}>
                      {i > 0 ? <Divider /> : null}
                      <View style={styles.row}>
                        <View style={styles.rowTop}>
                          <Text style={[T.cardTitle, { flex: 1 }]}>{c.label}</Text>
                          <Chip tone={mode.tone}>{mode.label}</Chip>
                        </View>
                        <Text style={T.bodySmall}>{c.detail}</Text>
                        {stats.length ? <Text style={T.meta}>{stats.join(' · ')}</Text> : null}
                        <Animated.View layout={layout} style={styles.actions}>
                          {c.canLoadSample ? (
                            <Button
                              compact
                              variant="outline"
                              label={busy === id ? 'Loading…' : 'Load sample'}
                              disabled={busy === id}
                              onPress={() =>
                                busy ? undefined : act(id, async () =>
                                  queuedMessage(await loadSample({ key: c.key }), 'Already loaded'),
                                )
                              }
                            />
                          ) : null}
                          {c.key === 'imessage_jesse' ? (
                            <Button
                              compact
                              label={busy === `${id}:link` ? 'Opening…' : 'Link my iMessage'}
                              icon="message"
                              disabled={busy === `${id}:link`}
                              onPress={() => (busy ? undefined : linkIMessage(`${id}:link`))}
                            />
                          ) : null}
                          {isContacts ? (
                            <Button
                              compact
                              variant="outline"
                              label={onWeb ? 'On device only' : busy === `${id}:import` ? 'Importing…' : 'Import contacts'}
                              disabled={onWeb || busy === `${id}:import`}
                              onPress={() =>
                                busy ? undefined : act(`${id}:import`, async () => {
                                  const res = await importDeviceContacts(importContacts);
                                  if (res.denied) return 'Contacts access was not granted';
                                  return `Imported ${res.added} new, updated ${res.updated}`;
                                })
                              }
                            />
                          ) : null}
                          <Result text={results[id] ?? results[`${id}:import`] ?? results[`${id}:link`]} />
                        </Animated.View>
                      </View>
                    </Animated.View>
                  );
                })}
              </Card>
            </Animated.View>
          )}
          <Text style={T.meta}>
            Sample sources run bundled sample events through the same processing as live ones. Jesse keeps only its own
            short notes, never message or email text.
          </Text>
        </Enter>

        <Enter index={2} style={styles.section}>
          <LocationSettings />
        </Enter>

        <Enter index={3} style={styles.section}>
          <SectionLabel style={{ marginTop: 8 }}>Your Claude</SectionLabel>
          <Card style={{ gap: 8 }}>
            <View style={styles.rowTop}>
              <Text style={[T.cardTitle, { flex: 1 }]}>Connect your Claude</Text>
              <Chip tone="green">Live</Chip>
            </View>
            <Text style={T.bodySmall}>Let your own Claude read Jesse’s notes over MCP with a token you can revoke.</Text>
            <View style={styles.actions}>
              <Button compact label="Set up" haptic={false} onPress={() => router.push('/mcp')} />
            </View>
          </Card>
        </Enter>

        <Enter index={4} style={styles.section}>
          <SectionLabel style={{ marginTop: 8 }}>Demo</SectionLabel>
          <Card style={{ gap: 8 }}>
            <Text style={T.cardTitle}>Load demo memories</Text>
            <Text style={T.bodySmall}>
              Fills Plans, People and Ideas with sample memories and runs the Tim, Mom and deck scenarios. Replaces this
              account’s current data.
            </Text>
            <Animated.View layout={layout} style={styles.actions}>
              <Button
                compact
                label={busy === 'demo' ? 'Loading…' : 'Load demo memories'}
                disabled={busy === 'demo'}
                onPress={busy ? undefined : confirmLoadDemo}
              />
              <Result text={results.demo} />
            </Animated.View>
          </Card>
        </Enter>

        <Enter index={5} style={styles.section}>
          <SectionLabel style={{ marginTop: 8 }}>Run demo scenario</SectionLabel>
          {scenarios === undefined ? (
            <SkeletonCard />
          ) : scenarios.length === 0 ? (
            <EmptyCard>No scenarios available.</EmptyCard>
          ) : (
            scenarios.map((s, i) => {
              const id = `scn:${s.name}`;
              return (
                <Enter key={s.name} index={i}>
                  <Card style={{ gap: 8 }}>
                    <Text style={T.cardTitle}>{s.title}</Text>
                    <Text style={T.bodySmall}>{s.description}</Text>
                    <Animated.View layout={layout} style={styles.actions}>
                      <Button
                        compact
                        label={busy === id ? 'Running…' : 'Run'}
                        disabled={busy === id}
                        onPress={() =>
                          busy ? undefined : act(id, async () =>
                            queuedMessage(await runScenario({ name: s.name }), 'Already ran today', true),
                          )
                        }
                      />
                      <Result text={results[id]} />
                    </Animated.View>
                  </Card>
                </Enter>
              );
            })
          )}
        </Enter>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.bg,
  },
  title: { flexShrink: 1, fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink },
  you: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { paddingHorizontal: S.screenX, paddingTop: S.screenTop, gap: S.gap },
  section: { gap: S.gap },
  row: { paddingVertical: 14, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4 },
});
