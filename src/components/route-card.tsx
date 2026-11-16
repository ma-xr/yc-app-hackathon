import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { fadeIn } from '@/theme/motion';
import { C, F, S, shadow, T } from '@/theme/tokens';

const H = 170;
const LEVELS = [0.82, 0.42, 0.66, 0.3, 0.55, 0.22];
const PIN_W = 88;
const PIN_H = 22;

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
          <Animated.View entering={fadeIn} style={StyleSheet.absoluteFill}>
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
            {labels.map((label, i) => (
              <View
                key={label + i}
                style={[
                  styles.pin,
                  {
                    left: Math.min(Math.max(points[i].x - PIN_W / 2, -6), w - PIN_W + 6),
                    // Stops alternate high/low, so put each label on the open side of its dot:
                    // above the high ones, below the low ones. Neighbouring labels then never collide.
                    top: LEVELS[i % LEVELS.length] < 0.5 ? points[i].y - PIN_H - 12 : points[i].y + 12,
                  },
                  i === reached && { backgroundColor: C.accent },
                ]}>
                <Text style={[styles.pinText, i === reached && { color: C.onAccent }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, gap: 4, ...shadow },
  pin: {
    position: 'absolute',
    width: PIN_W,
    height: PIN_H,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: C.bg,
  },
  pinText: { fontFamily: F.semibold, fontSize: 12, color: C.ink, textAlign: 'center' },
});
