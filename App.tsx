import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { getDB, seedDatabase } from './src/services/db';
import { useArchiveStore } from './src/stores/useArchiveStore';
import { useSettingsStore } from './src/stores/useSettingsStore';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await getDB();
        await seedDatabase();
        // Load archive (characters & worlds) from SQLite into Zustand
        await useArchiveStore.getState().load();
        // Load user settings from SecureStore/localStorage
        await useSettingsStore.getState().load();
        setReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[Genesis::App] DB init failed:', e);
        setError(msg);
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>数据库初始化失败:</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>初始化中...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  errorText: {
    fontSize: 12,
    color: '#CC4444',
    marginTop: 8,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
});
