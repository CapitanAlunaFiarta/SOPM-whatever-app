import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { signIn, message } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('login.title')}>
      {message && !error ? <Banner tone="info" text={message} /> : null}
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label={t('field.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
        keyboardType="email-address" textContentType="emailAddress" placeholder={t('login.emailPlaceholder')} />
      <TextField label={t('field.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"
        textContentType="password" placeholder={t('login.passwordPlaceholder')} onSubmitEditing={submit} returnKeyType="go" />
      <Button title={t('login.submit')} icon="log-in-outline" loading={busy} onPress={submit} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/register"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>{t('login.register')}</AppText></Link>
        <Link href="/forgot"><AppText style={{ color: colors.muted }}>{t('login.forgot')}</AppText></Link>
      </View>
    </AuthShell>
  );
}
