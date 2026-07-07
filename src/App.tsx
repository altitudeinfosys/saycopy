import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import RecordScreen from './screens/RecordScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import { createAppDependencies, type AppDependencies } from './runtime/appDependencies';

const tabs = ['Record', 'History', 'Settings'] as const;

type AppTab = (typeof tabs)[number];

type AppProps = {
  readonly dependencies?: AppDependencies;
};

export default function App() {
  return <AppShell />;
}

export function AppShell({ dependencies: injectedDependencies }: AppProps = {}) {
  const [activeTab, setActiveTab] = useState<AppTab>('Record');
  const [dependencies] = useState(() => injectedDependencies ?? createAppDependencies());

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={styles.container} testID="app-top-safe-area">
        <StatusBar style="dark" />
        <View style={styles.content}>{renderActiveTab(activeTab, dependencies)}</View>
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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function renderActiveTab(activeTab: AppTab, dependencies: AppDependencies) {
  if (activeTab === 'Record') {
    return (
      <RecordScreen
        historyRepository={dependencies.historyRepository}
        recordFlowProcessors={dependencies.recordFlowProcessors}
        settingsRepository={dependencies.settingsRepository}
      />
    );
  }

  if (activeTab === 'History') {
    return <HistoryScreen repository={dependencies.historyRepository} />;
  }

  return (
    <SettingsScreen
      settingsRepository={dependencies.settingsRepository}
      tokenStore={dependencies.tokenStore}
    />
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
});
