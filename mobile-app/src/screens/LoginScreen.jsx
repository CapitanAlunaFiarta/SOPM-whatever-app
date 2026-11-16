import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { styles, colors } from '../theme';

export default function LoginScreen() {
  const { login, refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(async (hasHardware) => {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && enrolled && Boolean(await SecureStore.getItemAsync('whatever.jwt')));
    });
  }, []);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const biometricLogin = async () => {
    setBusy(true); setError('');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Deblochează Whatever',
        cancelLabel: 'Anulează',
        disableDeviceFallback: false
      });
      if (!result.success) throw new Error('Autentificarea biometrică a fost anulată.');
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Image source={require('../../assets/logo.jpg')} style={{ width: 76, height: 76, borderRadius: 20 }} />
          <Text style={[styles.title, { marginTop: 14 }]}>WHATEVER</Text>
          <Text style={styles.subtitle}>Planifică. Acționează. Progresează.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="email@exemplu.ro" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
          <Text style={styles.label}>Parolă</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="Parola ta" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Se verifică…' : 'Intră în cont'}</Text>
          </TouchableOpacity>
          {biometricAvailable && (
            <TouchableOpacity style={styles.secondaryButton} onPress={biometricLogin} disabled={busy}>
              <Text style={styles.secondaryText}>🔐 Deblochează cu biometrie</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
