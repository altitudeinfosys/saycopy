import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

const tabs = ['Record', 'History', 'Settings'] as const;

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>Tarek Wisper</Text>
      </View>
      <View accessibilityRole="tablist" style={styles.tabBar}>
        {tabs.map((tab) => (
          <Text key={tab} accessibilityRole="tab" style={styles.tabLabel}>
            {tab}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
  tabBar: {
    minHeight: 72,
    borderTopColor: '#E5E7EB',
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  tabLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
});
