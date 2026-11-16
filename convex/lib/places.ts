import type { Id } from "../_generated/dataModel";

export const PLACE_RADIUS_M = 150;
export const DWELL_CAP_MS = 30 * 60 * 1000;
export const MAX_ACCURACY_M = 500;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type Ping = { lat: number; lng: number; ts: number; accuracy?: number; placeName?: string };

export type PlaceConversation = {
  _id: Id<"conversations">;
  startedAt: number;
  lat: number;
  lng: number;
  placeName?: string;
  participantIds: Id<"people">[];
};

export type Place = {
  key: string;
  name: string | null;
  lat: number;
  lng: number;
  minutes: number;
  visits: number;
  firstAt: number;
  lastAt: number;
  conversationIds: Id<"conversations">[];
  people: { personId: Id<"people">; count: number }[];
};

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Cluster = {
  lat: number;
  lng: number;
  weight: number;
  minutes: number;
  visits: number;
  firstAt: number;
  lastAt: number;
  names: Map<string, number>;
  conversations: PlaceConversation[];
};

function nearest(clusters: Cluster[], point: { lat: number; lng: number }) {
  let best: Cluster | null = null;
  let bestDistance = PLACE_RADIUS_M;
  for (const c of clusters) {
    const d = distanceM(c, point);
    if (d <= bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

function join(clusters: Cluster[], point: { lat: number; lng: number }, at: number, name?: string) {
  let cluster = nearest(clusters, point);
  if (cluster === null) {
    cluster = { lat: point.lat, lng: point.lng, weight: 0, minutes: 0, visits: 0, firstAt: at, lastAt: at, names: new Map(), conversations: [] };
    clusters.push(cluster);
  }
  cluster.weight += 1;
  cluster.lat += (point.lat - cluster.lat) / cluster.weight;
  cluster.lng += (point.lng - cluster.lng) / cluster.weight;
  cluster.firstAt = Math.min(cluster.firstAt, at);
  cluster.lastAt = Math.max(cluster.lastAt, at);
  if (name) cluster.names.set(name, (cluster.names.get(name) ?? 0) + 1);
  return cluster;
}

export function clusterPlaces(pings: Ping[], conversations: PlaceConversation[]): Place[] {
  const clusters: Cluster[] = [];
  const usable = pings
    .filter((p) => p.accuracy === undefined || p.accuracy <= MAX_ACCURACY_M)
    .sort((a, b) => a.ts - b.ts);
  const assigned = usable.map((p) => join(clusters, p, p.ts, p.placeName));

  for (let i = 0; i < usable.length; i++) {
    const cluster = assigned[i];
    const gap = i > 0 ? usable[i].ts - usable[i - 1].ts : Infinity;
    if (i === 0 || assigned[i - 1] !== cluster || gap > DWELL_CAP_MS) cluster.visits += 1;
    const next = usable[i + 1];
    if (next && assigned[i + 1] === cluster) cluster.minutes += Math.min(next.ts - usable[i].ts, DWELL_CAP_MS) / 60_000;
  }

  for (const conversation of [...conversations].sort((a, b) => a.startedAt - b.startedAt)) {
    const cluster = join(clusters, conversation, conversation.startedAt, conversation.placeName);
    cluster.conversations.push(conversation);
    if (cluster.visits === 0) cluster.visits = 1;
  }

  return clusters.map((c) => {
    const counts = new Map<Id<"people">, number>();
    for (const conversation of c.conversations) {
      for (const personId of new Set(conversation.participantIds)) counts.set(personId, (counts.get(personId) ?? 0) + 1);
    }
    const name = [...c.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      key: `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`,
      name,
      lat: c.lat,
      lng: c.lng,
      minutes: Math.round(c.minutes),
      visits: c.visits,
      firstAt: c.firstAt,
      lastAt: c.lastAt,
      conversationIds: c.conversations.sort((a, b) => b.startedAt - a.startedAt).map((x) => x._id),
      people: [...counts.entries()]
        .map(([personId, count]) => ({ personId, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
}
