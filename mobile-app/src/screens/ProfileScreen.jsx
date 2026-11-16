import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { userApi, apiMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { styles, colors } from '../theme';

export default function ProfileScreen() {
  const { session, logout, refreshUser } = useAuth();
  const [user, setUser] = useState(session.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await userApi.get('/users/me');
      setUser(data);
    } catch (err) {
      setError(apiMessage(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const consumeFreeze = () => {
    Alert.alert('Streak Freeze', 'Înghețarea se consumă când protejezi o activitate restantă din tabul Hartă. Pentru administrare, folosește task-ul restant.', [{ text: 'Am înțeles' }]);
  };

  const signOut = async () => {
    setLoading(true);
    await logout();
    setLoading(false);
  };

  if (loading) return <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.subtitle}>Contul și progresul tău</Text>
        <View style={styles.card}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{user.fullName}</Text>
          <Text style={styles.subtitle}>@{user.username} · {user.email}</Text>
          <View style={[styles.row, { marginTop: 22 }]}><View><Text style={styles.subtitle}>Streak general</Text><Text style={{ color: colors.amber, fontSize: 36, fontWeight: '900' }}>🔥 {user.streak || 0}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.subtitle}>Freeze-uri lunare</Text><Text style={{ color: colors.cyan, fontSize: 28, fontWeight: '900' }}>❄️ {user.freezesLeft ?? 3}/3</Text></View></View>
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={consumeFreeze}><Text style={styles.secondaryText}>❄️ Gestionează înghețările</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={async () => { await refreshUser(); await load(); }}><Text style={styles.secondaryText}>Sincronizează profilul</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.red }]} onPress={signOut}><Text style={styles.buttonText}>Deconectare</Text></TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}
