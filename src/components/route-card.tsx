import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { C, F, S, shadow, T } from '@/theme/tokens';

const H = 170;
const LEVELS = [0.82, 0.42, 0.66, 0.3, 0.55, 0.22];

export function RouteCard({ labels, reached, title }: { labels: string[]; reached: number; title: string }) {
  const [w, setW] = useState(0);
  const points = labels.map((_, i) => ({
    x: w * (0.12 + (0.76 * i) / Math.max(1, labels.length - 1)),
    y: 34 + (H - 54) * LEVELS[i % LEVELS.length],
  }));
  const segment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = (b.x - a.x) / 2;
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };
  return (
    <View style={styles.card} onLayout={(e) => setW(e.nativeEvent.layout.width - 32)} accessibilityLabel={`${title}. Stops: ${labels.join(', ')}`}>
      <Text style={[T.meta, { color: C.muted }]}>{title}</Text>
      <View style={{ height: H }}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            {points.slice(1).map((p, i) => (
              <Path
                key={i}
                d={segment(points[i], p)}
                stroke={i < reached ? C.accent : C.chipBorder}
                strokeWidth={i < reached ? 6 : 5}
                strokeLinecap="round"
                fill="none"
              />
            ))}
            {points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={i === reached ? 7 : 5} fill={i <= reached ? C.accent : C.chipBorder} />
            ))}
          </Svg>
        ) : null}
        {w > 0
          ? labels.map((label, i) => (
              <View
                key={label + i}
                style={[
                  styles.pin,
                  { left: Math.min(Math.max(points[i].x - 50, -6), w - 94), top: points[i].y - 36 },
                  i === reached && { backgroundColor: C.accent },
                ]}>
                <Text style={[styles.pinText, i === reached && { color: C.onAccent }]}>
                  {label}
                </Text>
              </View>
            ))
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, gap: 4, ...shadow },
  pin: {
    position: 'absolute',
    width: 100,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.bg,
  },
  pinText: { fontFamily: F.semibold, fontSize: 12, color: C.ink, textAlign: 'center' },
});
