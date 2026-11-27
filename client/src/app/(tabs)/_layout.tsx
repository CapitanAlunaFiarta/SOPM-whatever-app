import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';

import { colors } from '@/components/theme';
import type { IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

/** Tab-uri jos pe telefon, bară laterală pe ecrane late (web pe desktop, tabletă). */
export default function TabsLayout() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarPosition: wide ? 'left' : 'bottom',
      tabBarActiveTintColor: colors.cyan,
      tabBarInactiveTintColor: colors.faint,
      // Implicit, în bara laterală elementul activ primește fundal plin în culoarea temei (cyan),
      // iar textul cyan devenea invizibil. Folosim un fundal discret.
      tabBarActiveBackgroundColor: wide ? colors.elevated : 'transparent',
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderRightColor: colors.border },
      tabBarLabelStyle: { fontWeight: '700' },
      sceneStyle: { backgroundColor: colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Acasă', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Activități', tabBarIcon: icon('checkmark-done-outline') }} />
      <Tabs.Screen name="map" options={{ title: 'Hartă', tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="social" options={{ title: 'Social', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person-circle-outline') }} />
      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        tabBarIcon: icon('shield-checkmark-outline'),
        href: user?.role === 'ADMIN' ? undefined : null,
      }} />
    </Tabs>
  );
}
