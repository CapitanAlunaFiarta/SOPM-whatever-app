import { Link } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError(null);
    if (form.password.length < 12) {
      setError('Parola trebuie să aibă cel puțin 12 caractere.');
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
    <AuthShell title="Cont nou" subtitle="Streak-ul tău începe cu prima activitate finalizată.">
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label="Nume complet" value={form.fullName} onChangeText={set('fullName')} autoComplete="name" />
      <TextField label="Username" value={form.username} onChangeText={set('username')} autoCapitalize="none"
        autoComplete="username" placeholder="3-30 caractere: litere, cifre, . _ -" />
      <TextField label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" />
      <TextField label="Parolă (minim 12 caractere)" value={form.password} onChangeText={set('password')}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Button title="Creează contul" icon="person-add-outline" loading={busy} onPress={submit} />
      <Link href="/login"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>Am deja cont</AppText></Link>
    </AuthShell>
  );
}
