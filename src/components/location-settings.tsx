import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { relativeDay, time } from '@/components/format';
import { Button, Card, Chip, Divider, SectionLabel } from '@/components/ui';
import {
  enableBackgroundLocation,
  enableLocation,
  setLocationPaused,
  useLocationStatus,
  type LocationStatus,
} from '@/lib/location';
import { C, T } from '@/theme/tokens';

export function locationState(s: LocationStatus) {
  if (!s.ready) return { label: 'Checking', tone: 'neutral' as const };
  if (s.permission !== 'granted') return { label: 'Off', tone: 'neutral' as const };
  if (s.paused) return { label: 'Paused', tone: 'amber' as const };
  return s.background ? { label: 'Always', tone: 'green' as const } : { label: 'While open', tone: 'green' as const };
}

function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export function LocationPrompt() {
  const s = useLocationStatus();
  if (!s.ready) return null;

  if (s.permission !== 'granted') {
    return (
      <Card style={styles.card}>
        <Text style={T.cardTitle}>Remember where things happen</Text>
        <Text style={T.bodySmall}>
          With your location, Jesse notes where each conversation happens and where you spend your time, so it can say
          things like “you and Sam keep meeting at Blue Bottle”.
        </Text>
        <Text style={T.meta}>
          Places stay in your Jesse account. Pause it or delete every place in Connections whenever you like.
        </Text>
        <View style={styles.actions}>
          <Button
            compact
            icon="pin"
            label={s.permission === 'denied' && !s.canAskAgain ? 'Open Settings' : 'Turn on location'}
            onPress={() => void enableLocation()}
          />
        </View>
      </Card>
    );
  }

  if (s.paused) {
    return (
      <Card style={styles.card}>
        <Text style={T.cardTitle}>Location is paused</Text>
        <Text style={T.bodySmall}>Jesse isn’t noting new places. What it already kept stays until you delete it.</Text>
        <View style={styles.actions}>
          <Button compact label="Resume" onPress={() => void setLocationPaused(false)} />
        </View>
      </Card>
    );
  }

  if (s.backgroundAvailable && !s.background) {
    return (
      <Card style={styles.card}>
        <Text style={T.cardTitle}>Keep noting places while Jesse is closed</Text>
        <Text style={T.bodySmall}>
          Right now Jesse only notes places while it’s open. Allow location all the time to see the whole week.
        </Text>
        <View style={styles.actions}>
          <Button compact variant="outline" label="Allow all the time" onPress={() => void enableBackgroundLocation()} />
        </View>
      </Card>
    );
  }

  return null;
}

export function LocationSettings() {
  const s = useLocationStatus();
  const info = useQuery(api.places.status, {});
  const deleteHistory = useMutation(api.places.deleteHistory);
  const [note, setNote] = useState<string | null>(null);
  const state = locationState(s);

  const detail =
    s.permission !== 'granted'
      ? 'Off. Jesse doesn’t know where conversations happen.'
      : s.paused
        ? 'Paused. Jesse isn’t noting new places.'
        : s.background
          ? 'Jesse notes where you are every few minutes, and where each conversation starts, even while it’s closed.'
          : s.backgroundAvailable
            ? 'Jesse notes where you are while it’s open, and where each conversation starts.'
            : 'Jesse notes where you are while it’s open, and where each conversation starts. The full Jesse app can also keep noting while it’s closed.';

  const remove = () =>
    confirm(
      'Delete location history?',
      'This deletes every place Jesse noted and removes the place from your conversations. Your notes stay.',
      'Delete',
      () =>
        void deleteHistory({})
          .then(() => setNote('Location history deleted.'))
          .catch(() => setNote('That didn’t work. Try again.')),
    );

  return (
    <>
      <SectionLabel style={{ marginTop: 8 }}>Location</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        <View style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={[T.cardTitle, { flex: 1 }]}>Places</Text>
            <Chip tone={state.tone}>{state.label}</Chip>
          </View>
          <Text style={T.bodySmall}>{detail}</Text>
          {info?.lastPingAt ? (
            <Text style={T.meta}>
              Last place noted {relativeDay(info.lastPingAt)} at {time(info.lastPingAt)}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {s.permission !== 'granted' ? (
              <Button compact icon="pin" label="Turn on location" onPress={() => void enableLocation()} />
            ) : (
              <Button
                compact
                variant="outline"
                label={s.paused ? 'Resume' : 'Pause location'}
                onPress={() => void setLocationPaused(!s.paused)}
              />
            )}
            {s.permission === 'granted' && !s.paused && s.backgroundAvailable && !s.background ? (
              <Button compact variant="outline" label="Allow all the time" onPress={() => void enableBackgroundLocation()} />
            ) : null}
          </View>
        </View>
        <Divider />
        <View style={styles.row}>
          <Text style={T.cardTitle}>Delete location history</Text>
          <Text style={T.bodySmall}>Removes every place Jesse noted and the place on each conversation.</Text>
          <View style={styles.actions}>
            <Button compact variant="outline" label="Delete history" onPress={remove} />
            {note ? <Text style={[T.meta, { flexShrink: 1, color: C.muted }]}>{note}</Text> : null}
          </View>
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { paddingVertical: 14, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4 },
});
