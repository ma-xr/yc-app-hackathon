import { StyleSheet, Text, View } from 'react-native';

import { OrbArt } from '@/components/orb';
import { Screen } from '@/components/ui';
import { C, F } from '@/theme/tokens';

export default function Insights() {
  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <OrbArt size={140} />
        <Text style={styles.title} accessibilityRole="header">
          Insights are coming
        </Text>
        <Text style={styles.line}>Jesse is learning what matters to you.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 34, color: C.ink, marginTop: 12 },
  line: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center' },
});
