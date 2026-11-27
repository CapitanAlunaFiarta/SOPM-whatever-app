import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { colors } from '@/components/theme';
import { AppText, Banner, Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { signIn, message } = useAuth();
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
    <AuthShell title="Intră în cont">
      {message && !error ? <Banner tone="info" text={message} /> : null}
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
        keyboardType="email-address" textContentType="emailAddress" placeholder="email@exemplu.ro" />
      <TextField label="Parolă" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"
        textContentType="password" placeholder="Parola ta" onSubmitEditing={submit} returnKeyType="go" />
      <Button title="Intră în cont" icon="log-in-outline" loading={busy} onPress={submit} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/register"><AppText style={{ color: colors.cyan, fontWeight: '700' }}>Cont nou</AppText></Link>
        <Link href="/forgot"><AppText style={{ color: colors.muted }}>Ai uitat parola?</AppText></Link>
      </View>
    </AuthShell>
  );
}
