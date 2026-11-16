import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { firstName, relativeDay, time } from '@/components/format';
import { Icon } from '@/components/icon';
import { LocationPrompt } from '@/components/location-settings';
import { formatMinutes, usePlacesNow } from '@/components/place-insights';
import { Avatar, Card, Divider, EmptyCard, SectionLabel } from '@/components/ui';
import { useLocationStatus } from '@/lib/location';
import { C, F, S, shadow, T } from '@/theme/tokens';

type Place = NonNullable<ReturnType<typeof useWeek>>['places'][number];

function useWeek() {
  const now = usePlacesNow();
  return useQuery(api.places.week, { now });
}

const placeLabel = (place: Pick<Place, 'name'>) => place.name ?? 'Unnamed spot';

export function PlacesSection() {
  const week = useWeek();
  const location = useLocationStatus();
  const total = week?.places.reduce((sum, p) => sum + p.minutes, 0) ?? 0;

  return (
    <View style={styles.section}>
      <LocationPrompt />
      {week === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : week.places.length === 0 ? (
        <EmptyCard>
          {location.permission === 'granted' && !location.paused
            ? 'Jesse is noting places. Where you spend time and talk to people shows up here.'
            : 'No places yet. Turn on location and Jesse will show where your week happens.'}
        </EmptyCard>
      ) : (
        <>
          <WeekMap places={week.places} />
          {total > 0 ? <TimeSplit places={week.places} total={total} /> : null}
          <SectionLabel>Where things happened</SectionLabel>
          {week.places.map((place) => (
            <PlaceCard key={place.key} place={place} />
          ))}
        </>
      )}
      <Text style={styles.footer}>Only you can see your places. Pause or delete them in Connections.</Text>
    </View>
  );
}

const MAP_H = 210;
const LABEL_W = 124;

function WeekMap({ places }: { places: Place[] }) {
  const [w, setW] = useState(0);
  const stops = places.slice(0, 6);
  const norm = (v: number, lo: number, hi: number) => (hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo));
  const [minLat, maxLat] = [Math.min(...stops.map((p) => p.lat)), Math.max(...stops.map((p) => p.lat))];
  const [minLng, maxLng] = [Math.min(...stops.map((p) => p.lng)), Math.max(...stops.map((p) => p.lng))];
  const maxMinutes = Math.max(...stops.map((p) => p.minutes), 1);
  const placed: { x: number; y: number }[] = [];
  const points = stops.map((p) => {
    const x = 48 + norm(p.lng, minLng, maxLng) * (w - 96);
    const y = 46 + (1 - norm(p.lat, minLat, maxLat)) * (MAP_H - 80);
    const r = 6 + 12 * Math.sqrt(p.minutes / maxMinutes);
    const left = Math.min(Math.max(x - LABEL_W / 2, -6), w - LABEL_W + 6);
    const clash = (top: number) => placed.some((q) => Math.abs(q.x - left) < LABEL_W && Math.abs(q.y - top) < 28);
    const above = y - r - 30;
    const below = y + r + 4;
    const top = !clash(above) && above > -8 ? above : !clash(below) ? below : above;
    placed.push({ x: left, y: top });
    return { place: p, x, y, r, left, top };
  });
  const route = [...points].sort((a, b) => a.place.firstAt - b.place.firstAt);
  const segment = (a: (typeof points)[number], b: (typeof points)[number]) => {
    const dx = (b.x - a.x) / 2;
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <View
      style={styles.mapCard}
      onLayout={(e) => setW(e.nativeEvent.layout.width - 32)}
      accessibilityLabel={`Your week went through ${stops.map(placeLabel).join(', ')}`}>
      <Text style={T.meta}>Your week, place by place</Text>
      <View style={{ height: MAP_H }}>
        {w > 0 ? (
          <>
            <Svg width={w} height={MAP_H}>
              {route.slice(1).map((p, i) => (
                <Path key={p.place.key} d={segment(route[i], p)} stroke={C.chipBorder} strokeWidth={5} strokeLinecap="round" fill="none" />
              ))}
              {points.map((p, i) => (
                <Circle key={p.place.key} cx={p.x} cy={p.y} r={p.r} fill={i === 0 ? C.accent : C.accentTint} stroke={C.accent} strokeWidth={i === 0 ? 0 : 2} />
              ))}
            </Svg>
            {points.map((p, i) => (
              <View
                key={p.place.key}
                style={[
                  styles.pin,
                  { left: p.left, top: p.top },
                  i === 0 && { backgroundColor: C.accent },
                ]}>
                <Text numberOfLines={1} style={[styles.pinText, i === 0 && { color: C.surface }]}>
                  {placeLabel(p.place)}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}

function TimeSplit({ places, total }: { places: Place[]; total: number }) {
  const rows = places.filter((p) => p.minutes > 0).slice(0, 5);
  return (
    <Card style={{ gap: 12 }}>
      <Text style={T.cardTitle}>Where you spent your time</Text>
      {rows.map((p) => (
        <View key={p.key} style={{ gap: 6 }} accessibilityLabel={`${placeLabel(p)}, ${formatMinutes(p.minutes)}`}>
          <View style={styles.splitTop}>
            <Text style={[T.bodySmall, { flex: 1, color: C.ink }]} numberOfLines={1}>
              {placeLabel(p)}
            </Text>
            <Text style={T.meta}>{formatMinutes(p.minutes)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, (100 * p.minutes) / total)}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const stats = [
    place.minutes > 0 ? formatMinutes(place.minutes) : null,
    `${place.visits} visit${place.visits === 1 ? '' : 's'}`,
    place.conversationCount ? `${place.conversationCount} conversation${place.conversationCount === 1 ? '' : 's'}` : null,
    `last ${relativeDay(place.lastAt)}`,
  ].filter(Boolean);
  const openConversation = (id: Id<'conversations'>) => router.push({ pathname: '/conversation/[id]', params: { id } });

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.placeTop}>
        <View style={styles.pinBadge}>
          <Icon name="pin" size={18} color={C.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.placeName}>{placeLabel(place)}</Text>
          <Text style={T.meta}>{stats.join(' · ')}</Text>
        </View>
      </View>

      {place.people.length ? (
        <View style={styles.people}>
          {place.people.slice(0, 6).map((p) => (
            <Pressable
              key={p._id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.name}, ${p.count} conversation${p.count === 1 ? '' : 's'} here`}
              onPress={() => router.push({ pathname: '/person/[id]', params: { id: p._id } })}
              style={styles.person}>
              <Avatar name={p.name} size={24} />
              <Text style={styles.personName}>
                {firstName(p.name)}
                {p.count > 1 ? ` ×${p.count}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {place.conversations.length ? (
        <View>
          {place.conversations.map((c, i) => (
            <View key={c._id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open conversation from ${relativeDay(c.startedAt)}`}
                onPress={() => openConversation(c._id)}
                style={({ pressed }) => [styles.conversation, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.meta, { color: C.inkSoft }]}>
                    {relativeDay(c.startedAt)} · {time(c.startedAt)}
                    {c.people.length ? ` · with ${c.people.map(firstName).join(', ')}` : ''}
                  </Text>
                  {c.gist ? (
                    <Text style={T.bodySmall} numberOfLines={2}>
                      {c.gist}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevronRight" size={16} color={C.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: S.gap },
  mapCard: { backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, gap: 4, ...shadow },
  pin: {
    position: 'absolute',
    width: LABEL_W,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: C.bg,
  },
  pinText: { fontFamily: F.semibold, fontSize: 12, color: C.ink },
  splitTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.neutralChip, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.accent },
  placeTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontFamily: F.display, fontSize: 20, lineHeight: 25, color: C.ink },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: C.bg,
  },
  personName: { fontFamily: F.semibold, fontSize: 13, color: C.ink },
  conversation: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: S.touch, paddingVertical: 10 },
  footer: { textAlign: 'center', fontFamily: F.medium, fontSize: 13, color: C.muted, marginTop: 8 },
});
