import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Button, IconButton, Loading } from '@/components/ui';
import { I18nProvider, useI18n } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Butonul „X” al ecranelor modale; funcționează și când ecranul a fost deschis direct (link, refresh). */
function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/tasks');
}

function CloseButton() {
  const { t } = useI18n();
  return (
    <View style={{ marginRight: 8 }}>
      <IconButton icon="close" label={t('common.close')} onPress={closeModal} />
    </View>
  );
}

const modalOptions = {
  presentation: 'modal' as const,
  headerShown: true,
  headerLeft: () => <CloseButton />,
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
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="light" />
            <RootNavigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

function RootNavigator() {
  const { status, message, retry, signOut } = useAuth();
  const { t, ready } = useI18n();
  // Cât timp sesiunea se reface (loading/offline) ambele grupuri rămân accesibile, ca un link
  // direct (ex. /task/12 sau un refresh în browser) să nu fie redirecționat către „Acasă”.
  // Ecranele rămân acoperite de overlay până se știe dacă utilizatorul e autentificat.
  const appAvailable = status !== 'signedOut';
  const authAvailable = status !== 'signedIn';

  // Splash-ul rămâne până se știu și sesiunea, și limba aleasă (citită din SecureStore pe telefon).
  useEffect(() => {
    if (status !== 'loading' && ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [status, ready]);

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
          <Stack.Screen name="task/new" options={{ ...modalOptions, title: t('task.newTitle') }} />
          <Stack.Screen name="task/[id]" options={{ ...modalOptions, title: t('task.editTitle') }} />
          <Stack.Screen name="recap" options={{ ...modalOptions, title: t('recap.title') }} />
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
          <Loading text={t('root.restoring')} />
        </View>
      )}
      {status === 'offline' && (
        <View style={[styles.overlay, styles.offline]}>
          <AppText variant="heading">{t('root.offlineTitle')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center' }}>{message ?? t('root.checkConnection')}</AppText>
          <Button title={t('common.retry')} icon="refresh" onPress={retry} />
          <Button title={t('common.signOut')} variant="ghost" onPress={signOut} />
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
