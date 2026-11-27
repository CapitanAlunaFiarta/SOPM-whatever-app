import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Confirmarea resetării. Linkul din email deschide /reset?code=XXXXX-XXXXX. */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string; sent?: string }>();
  const { status } = useAuth();
  const { t } = useI18n();
  const [code, setCode] = useState(params.code ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 12) {
      setError(t('password.tooShortNew'));
      return;
    }
    setBusy(true);
    try {
      await request('user', '/users/password-reset/confirm', {
        method: 'POST', body: { resetToken: code.trim(), newPassword: password },
      }, { auth: false });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('reset.title')} subtitle={params.sent ? t('reset.sent') : undefined}>
      {done ? (
        <>
          <Banner tone="success" text={t('reset.done')} />
          <Button title={status === 'signedIn' ? t('reset.backToApp') : t('reset.signIn')} icon="log-in-outline"
            onPress={() => router.replace(status === 'signedIn' ? '/' : '/login')} />
        </>
      ) : (
        <>
          {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
          <TextField label={t('reset.code')} value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXXX-XXXXX" />
          <TextField label={t('password.newLabel')} value={password} onChangeText={setPassword} secureTextEntry
            autoComplete="new-password" textContentType="newPassword" />
          <Button title={t('reset.submit')} icon="key-outline" loading={busy} onPress={submit} />
          <Link href="/login"><AppText style={{ color: colors.muted }}>{t('auth.backToLogin')}</AppText></Link>
        </>
      )}
    </AuthShell>
  );
}
