import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { C, F } from '@/theme/tokens';

export type BrainTopic = { id: string; label: string; chats: number; subIdeas: string[] };

const W = 350;
const H = 250;
const SLOTS = [
  { x: 120, y: 112, size: 104, sparks: [[54, 88], [102, 44], [54, 136]] },
  { x: 268, y: 74, size: 88, sparks: [[299, 20], [328, 90], [220, 34]] },
  { x: 262, y: 190, size: 76, sparks: [[305, 226], [219, 226]] },
  { x: 66, y: 196, size: 64, sparks: [[41, 239], [19, 179]] },
] as const;
const HALO_EXTRA = 36;
const SPARK = 10;

function useLoop(duration: number, delay: number) {
  const reduce = useReducedMotion();
  const v = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      v.value = 1;
      return;
    }
    v.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [reduce, duration, delay, v]);
  return { v, reduce };
}

function Spark({ x, y, active, index }: { x: number; y: number; active: boolean; index: number }) {
  const { v, reduce } = useLoop(2600 + (index % 4) * 460, index * 300);
  const style = useAnimatedStyle(() =>
    reduce ? {} : { opacity: 0.4 + 0.6 * v.value, transform: [{ scale: 0.85 + 0.3 * v.value }] },
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - SPARK / 2,
          top: y - SPARK / 2,
          width: SPARK,
          height: SPARK,
          borderRadius: SPARK / 2,
          backgroundColor: active ? C.accent : '#A79CEB',
        },
        style,
      ]}
    />
  );
}

function Halo({ x, y, size }: { x: number; y: number; size: number }) {
  const { v, reduce } = useLoop(4000, 0);
  const d = size + HALO_EXTRA;
  const style = useAnimatedStyle(() => ({ opacity: reduce ? 0.3 : 0.18 + 0.22 * v.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: x - d / 2, top: y - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: C.accent },
        style,
      ]}
    />
  );
}

function Bubble({
  topic,
  slot,
  index,
  selected,
  onPress,
}: {
  topic: BrainTopic;
  slot: (typeof SLOTS)[number];
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { v, reduce } = useLoop(5500 + index * 700, index * 500);
  const drift = useAnimatedStyle(() => (reduce ? {} : { transform: [{ translateY: -6 * v.value }] }));
  const fontSize = slot.size >= 100 ? 15 : slot.size >= 85 ? 12 : slot.size >= 75 ? 11 : 10;
  const fg = selected ? '#FFFFFF' : C.orbDeep;
  return (
    <Animated.View
      style={[{ position: 'absolute', left: slot.x - slot.size / 2, top: slot.y - slot.size / 2 }, drift]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${topic.label}, ${topic.chats} chats`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={{
          width: slot.size,
          height: slot.size,
          borderRadius: slot.size / 2,
          backgroundColor: selected ? C.accent : '#FFFFFF',
          borderWidth: 2,
          borderColor: C.accent,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: slot.size * 0.07,
        }}>
        <Text
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ fontFamily: F.bold, fontSize, lineHeight: fontSize + 3, color: fg, textAlign: 'center' }}>
          {topic.label}
        </Text>
        <Text style={{ fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: fg, textAlign: 'center' }}>
          {topic.chats} {topic.chats === 1 ? 'chat' : 'chats'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function Brain({
  topics,
  selectedId,
  onSelect,
}: {
  topics: BrainTopic[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [width, setWidth] = useState(W);
  const scale = width / W;
  const placed = topics.slice(0, SLOTS.length).map((topic, i) => ({ topic, slot: SLOTS[i], i }));
  const selected = placed.find((p) => p.topic.id === selectedId);
  const sparks = placed.flatMap(({ topic, slot, i }) =>
    slot.sparks.slice(0, topic.subIdeas.length).map(([x, y], j) => ({
      x,
      y,
      from: slot,
      active: topic.id === selectedId,
      index: i * 3 + j,
    })),
  );

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: H * scale }}>
      <View
        style={{
          position: 'absolute',
          left: (width - W) / 2,
          top: (H * scale - H) / 2,
          width: W,
          height: H,
          transform: [{ scale }],
        }}>
        <Svg width={W} height={H} style={{ position: 'absolute' }}>
          {[[110, 92, 70], [175, 72, 70], [242, 92, 70], [82, 160, 64], [268, 160, 64], [175, 162, 82]].map(
            ([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#ECE8FB" />
            ),
          )}
          {[
            'M175 14 Q165 50 175 80 T175 150 T175 242',
            'M70 120 Q95 110 118 126 T150 124',
            'M280 120 Q255 110 232 126 T200 124',
            'M135 205 Q155 195 175 208 T215 205',
          ].map((d) => (
            <Path key={d} d={d} stroke="#DAD3F7" strokeWidth={2} strokeLinecap="round" fill="none" />
          ))}
          {placed.slice(1).map(({ slot }, k) => (
            <Line
              key={k}
              x1={placed[0].slot.x}
              y1={placed[0].slot.y}
              x2={slot.x}
              y2={slot.y}
              stroke="#CFC8F2"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          ))}
          {sparks.map((s) => (
            <Line key={s.index} x1={s.from.x} y1={s.from.y} x2={s.x} y2={s.y} stroke="#B9AFF2" strokeWidth={1.5} />
          ))}
        </Svg>
        {sparks.map((s) => (
          <Spark key={s.index} x={s.x} y={s.y} active={s.active} index={s.index} />
        ))}
        {selected ? <Halo x={selected.slot.x} y={selected.slot.y} size={selected.slot.size} /> : null}
        {placed.map(({ topic, slot, i }) => (
          <Bubble
            key={topic.id}
            topic={topic}
            slot={slot}
            index={i}
            selected={topic.id === selectedId}
            onPress={() => onSelect(topic.id)}
          />
        ))}
      </View>
    </View>
  );
}
