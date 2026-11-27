import { Link, router } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage, request } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await request('user', '/users/password-reset/request', {
        method: 'POST', body: { email: email.trim(), username: username.trim().replace(/^@/, '') },
      }, { auth: false });
      router.push({ pathname: '/reset', params: { sent: '1' } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('forgot.title')} subtitle={t('forgot.subtitle')}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label={t('field.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField label={t('field.username')} value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Button title={t('forgot.submit')} icon="mail-outline" loading={busy} onPress={submit} />
      <Link href="/reset"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>{t('forgot.haveCode')}</AppText></Link>
      <Link href="/login"><AppText style={{ color: colors.muted }}>{t('auth.backToLogin')}</AppText></Link>
    </AuthShell>
  );
}
