import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import SocialScreen from '../screens/SocialScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const icons = { Map: 'map-outline', Social: 'people-outline', Profile: 'person-outline' };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="Map" component={MapScreen} options={{ title: 'Hartă' }} />
      <Tabs.Screen name="Social" component={SocialScreen} options={{ title: 'Social' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tabs.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading } = useAuth();
  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#38bdf8" /></View>;
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070b14' },
  tabBar: { backgroundColor: '#0f172a', borderTopColor: '#1e293b', height: 66, paddingBottom: 8, paddingTop: 6 },
  tabLabel: { fontSize: 12, fontWeight: '700' }
});
