import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { C, F } from '@/theme/tokens';

export default function Contacts() {
  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Text style={styles.title} accessibilityRole="header">
          Contacts
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 34, color: C.ink },
});
