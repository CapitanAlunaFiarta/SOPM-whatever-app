import { Link } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { register } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError(null);
    if (form.password.length < 12) {
      setError(t('password.tooShort'));
      return;
    }
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim(), username: form.username.trim().replace(/^@/, '') });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('register.title')} subtitle={t('register.subtitle')}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label={t('field.fullName')} value={form.fullName} onChangeText={set('fullName')} autoComplete="name" />
      <TextField label={t('field.username')} value={form.username} onChangeText={set('username')} autoCapitalize="none"
        autoComplete="username" placeholder={t('register.usernamePlaceholder')} />
      <TextField label={t('field.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" />
      <TextField label={t('register.passwordLabel')} value={form.password} onChangeText={set('password')}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Button title={t('register.submit')} icon="person-add-outline" loading={busy} onPress={submit} />
      <Link href="/login"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>{t('register.haveAccount')}</AppText></Link>
    </AuthShell>
  );
}
