import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Button, IconButton, Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Butonul „X” al ecranelor modale; funcționează și când ecranul a fost deschis direct (link, refresh). */
function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/tasks');
}

const modalOptions = {
  presentation: 'modal' as const,
  headerShown: true,
  headerLeft: () => (
    <View style={{ marginRight: 8 }}>
      <IconButton icon="close" label="Închide" onPress={closeModal} />
    </View>
  ),
};

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.cyan,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { status, message, retry, signOut } = useAuth();
  // Cât timp sesiunea se reface (loading/offline) ambele grupuri rămân accesibile, ca un link
  // direct (ex. /task/12 sau un refresh în browser) să nu fie redirecționat către „Acasă”.
  // Ecranele rămân acoperite de overlay până se știe dacă utilizatorul e autentificat.
  const appAvailable = status !== 'signedOut';
  const authAvailable = status !== 'signedIn';

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800' },
      }}>
        <Stack.Protected guard={appAvailable}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/new" options={{ ...modalOptions, title: 'Activitate nouă' }} />
          <Stack.Screen name="task/[id]" options={{ ...modalOptions, title: 'Editează activitatea' }} />
        </Stack.Protected>
        <Stack.Protected guard={authAvailable}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot" />
        </Stack.Protected>
        <Stack.Screen name="reset" />
      </Stack>

      {status === 'loading' && (
        <View style={styles.overlay}>
          <Loading text="Se reface sesiunea… Dacă serverul a stat nefolosit, pornirea durează câteva secunde." />
        </View>
      )}
      {status === 'offline' && (
        <View style={[styles.overlay, styles.offline]}>
          <AppText variant="heading">Serverul nu răspunde</AppText>
          <AppText variant="muted" style={{ textAlign: 'center' }}>{message ?? 'Verifică conexiunea la internet.'}</AppText>
          <Button title="Încearcă din nou" icon="refresh" onPress={retry} />
          <Button title="Deconectează-te" variant="ghost" onPress={signOut} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background },
  offline: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
});
