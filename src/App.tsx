import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import RecordScreen from './screens/RecordScreen';

const tabs = ['Record', 'History', 'Settings'] as const;

type AppTab = (typeof tabs)[number];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('Record');

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>{renderActiveTab(activeTab)}</View>
      <View accessibilityRole="tablist" style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            accessibilityLabel={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            onPress={() => setActiveTab(tab)}
            style={styles.tab}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function renderActiveTab(activeTab: AppTab) {
  if (activeTab === 'Record') {
    return <RecordScreen />;
  }

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{activeTab}</Text>
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
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabLabel: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#111827',
    fontWeight: '800',
  },
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  placeholderTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
});
