import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Confirmarea resetării. Linkul din email deschide /reset?code=XXXXX-XXXXX. */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string; sent?: string }>();
  const { status } = useAuth();
  const [code, setCode] = useState(params.code ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 12) {
      setError('Parola nouă trebuie să aibă cel puțin 12 caractere.');
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ message: string }>('user', '/users/password-reset/confirm', {
        method: 'POST', body: { resetToken: code.trim(), newPassword: password },
      }, { auth: false });
      setDone(result.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Parolă nouă" subtitle={params.sent ? 'Dacă datele sunt corecte, codul a ajuns pe email.' : undefined}>
      {done ? (
        <>
          <Banner tone="success" text={done} />
          <Button title={status === 'signedIn' ? 'Înapoi în aplicație' : 'Autentifică-te'} icon="log-in-outline"
            onPress={() => router.replace(status === 'signedIn' ? '/' : '/login')} />
        </>
      ) : (
        <>
          {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
          <TextField label="Codul din email" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXXX-XXXXX" />
          <TextField label="Parola nouă (minim 12 caractere)" value={password} onChangeText={setPassword} secureTextEntry
            autoComplete="new-password" textContentType="newPassword" />
          <Button title="Schimbă parola" icon="key-outline" loading={busy} onPress={submit} />
          <Link href="/login"><AppText style={{ color: colors.muted }}>Înapoi la autentificare</AppText></Link>
        </>
      )}
    </AuthShell>
  );
}
