import { Link, router } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage, request } from '@/lib/api';

export default function ForgotPasswordScreen() {
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
    <AuthShell title="Resetează parola" subtitle="Îți trimitem pe email un cod valabil 15 minute.">
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Button title="Trimite codul" icon="mail-outline" loading={busy} onPress={submit} />
      <Link href="/reset"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>Am deja un cod</AppText></Link>
      <Link href="/login"><AppText style={{ color: colors.muted }}>Înapoi la autentificare</AppText></Link>
    </AuthShell>
  );
}
