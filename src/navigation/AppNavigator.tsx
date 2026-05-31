import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList, RootTabParamList } from '../types';
import { useTheme } from '../hooks/useTheme';
import ArchiveScreen from '../screens/ArchiveScreen';
import StageScreen from '../screens/StageScreen';
import ChroniclesScreen from '../screens/ChroniclesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CreateCharacterScreen from '../screens/CreateCharacterScreen';
import CreateWorldScreen from '../screens/CreateWorldScreen';
import CharacterDetailScreen from '../screens/CharacterDetailScreen';
import WorldDetailScreen from '../screens/WorldDetailScreen';
import PromptBlueprintScreen from '../screens/PromptBlueprintScreen';
import StageSetupScreen from '../screens/StageSetupScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function TabNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          backgroundColor: colors.background,
        },
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
      }}
    >
      <Tab.Screen name="Archive" component={ArchiveScreen} options={{ title: '图鉴', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📖</Text> }} />
      <Tab.Screen name="Stage" component={StageScreen} options={{ title: '舞台', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🎭</Text> }} />
      <Tab.Screen name="Chronicles" component={ChroniclesScreen} options={{ title: '历史', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📜</Text> }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '设置', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>⚙️</Text> }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="CreateCharacter" component={CreateCharacterScreen} />
      <Stack.Screen name="CreateWorld" component={CreateWorldScreen} />
      <Stack.Screen name="CharacterDetail" component={CharacterDetailScreen} />
      <Stack.Screen name="WorldDetail" component={WorldDetailScreen} />
      <Stack.Screen name="PromptBlueprint" component={PromptBlueprintScreen} />
      <Stack.Screen name="StageSetup" component={StageSetupScreen} />
    </Stack.Navigator>
  );
}
