import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import { taskApi, apiMessage } from '../services/api';
import { styles, colors } from '../theme';

export default function MapScreen() {
  const [location, setLocation] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [completingId, setCompletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'General',
    priority: 'Normal',
    dueDate: new Date().toISOString().slice(0, 10),
    friend: '',
    requiresLocation: false,
    requiresBiometrics: false,
    isRecurring: false,
    radius: '150'
  });

  const load = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Permite accesul la locație pentru a vedea harta.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(current.coords);
      const { data } = await taskApi.get('/tasks');
      setTasks(data);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const completeTask = async task => {
    setCompletingId(task.id);
    setError('');
    try {
      let mobileBiometricConfirmed = false;
      if (task.requiresBiometrics) {
        const [hasHardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync()
        ]);
        if (!hasHardware || !enrolled) throw new Error('Telefonul nu are biometrie configurată. Activează amprenta sau Face ID din setările telefonului.');
        const authentication = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirmă finalizarea activității',
          cancelLabel: 'Anulează',
          disableDeviceFallback: false
        });
        if (!authentication.success) throw new Error('Confirmarea biometrică a fost anulată.');
        mobileBiometricConfirmed = true;
      }
      await taskApi.post(`/tasks/${task.id}/verify-complete`, {
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        biometricToken: null,
        mobileBiometricConfirmed
      });
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: 'Completed' } : item));
      Alert.alert('Task finalizat', 'Progresul și streak-ul au fost actualizate.');
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setCompletingId(null);
    }
  };

  const createTask = async () => {
    if (!form.title.trim() || !form.dueDate) {
      setError('Completează titlul și data scadenței.');
      return;
    }
    if (form.requiresLocation && !location) {
      setError('Activează locația înainte să creezi un task cu verificare GPS.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await taskApi.post('/tasks', {
        title: form.title.trim(),
        category: form.category.trim() || 'General',
        priority: form.priority.trim() || 'Normal',
        dueDate: form.dueDate,
        friend: form.friend.trim(),
        isRecurring: form.isRecurring,
        requiresLocation: form.requiresLocation,
        latitude: location?.latitude || 0,
        longitude: location?.longitude || 0,
        radius: Math.max(10, Number(form.radius) || 150),
        requiresBiometrics: form.requiresBiometrics
      });
      setFormOpen(false);
      setForm(current => ({ ...current, title: '', friend: '' }));
      await load();
      Alert.alert('Task adăugat', 'Activitatea a fost salvată în workspace.');
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.cyan} size="large" /></View>;
  const region = location ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 } : { latitude: 45.6525, longitude: 25.5888, latitudeDelta: 0.08, longitudeDelta: 0.08 };

  return (
    <View style={styles.screen}>
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation showsMyLocationButton>
        {location && <Marker coordinate={location} title="Locația mea" pinColor={colors.cyan} />}
        {tasks.filter(task => task.requiresLocation && task.latitude && task.longitude).map(task => (
          <React.Fragment key={task.id}>
            <Marker coordinate={{ latitude: task.latitude, longitude: task.longitude }} title={task.title} description={`${task.category} · ${task.status}`} />
            <Circle center={{ latitude: task.latitude, longitude: task.longitude }} radius={task.allowedRadiusMeters || task.radius || 150} fillColor="rgba(56,189,248,0.16)" strokeColor={colors.cyan} />
          </React.Fragment>
        ))}
      </MapView>
      <View style={[styles.card, { position: 'absolute', top: 16, left: 16, right: 16, marginTop: 0 }]}>
        <View style={styles.row}><View><Text style={styles.title}>Hartă & task-uri</Text><Text style={styles.subtitle}>{tasks.length} activități cu locație</Text></View><View style={[styles.row, { gap: 12 }]}><TouchableOpacity onPress={() => setFormOpen(true)}><Text style={styles.secondaryText}>+ Task</Text></TouchableOpacity><TouchableOpacity onPress={load}><Text style={styles.secondaryText}>Reîncarcă</Text></TouchableOpacity></View></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={[styles.card, { position: 'absolute', bottom: 12, left: 12, right: 12, maxHeight: '38%', marginTop: 0, padding: 14 }]}>
        <Text style={styles.subtitle}>Activitățile mele ({tasks.length})</Text>
        <FlatList
          data={tasks}
          keyExtractor={task => String(task.id)}
          contentContainerStyle={{ paddingTop: 6 }}
          renderItem={({ item }) => (
            <View style={[styles.row, { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.category} · {item.status} · {item.dueDate || 'fără scadență'}</Text>
              </View>
              {item.status === 'Completed' ? <Text style={{ color: colors.green, fontWeight: '800' }}>Finalizat</Text> : <TouchableOpacity style={[styles.secondaryButton, { marginTop: 0, paddingVertical: 8, paddingHorizontal: 10 }]} onPress={() => completeTask(item)} disabled={completingId === item.id}><Text style={styles.secondaryText}>{completingId === item.id ? '…' : 'Finalizează'}</Text></TouchableOpacity>}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.subtitle}>Nu ai activități încă. Apasă + Task.</Text>}
        />
      </View>
      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <View style={[styles.card, { marginTop: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '90%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.row}><Text style={styles.title}>Creează o activitate</Text><TouchableOpacity onPress={() => setFormOpen(false)}><Text style={styles.secondaryText}>Închide</Text></TouchableOpacity></View>
              <Text style={styles.label}>Titlu</Text>
              <TextInput value={form.title} onChangeText={value => updateForm('title', value)} placeholder="Ex: Aleargă 20 de minute" placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.label}>Categorie</Text>
              <TextInput value={form.category} onChangeText={value => updateForm('category', value)} placeholder="General" placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.label}>Prioritate</Text>
              <TextInput value={form.priority} onChangeText={value => updateForm('priority', value)} placeholder="Normal" placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.label}>Scadență (AAAA-LL-ZZ)</Text>
              <TextInput value={form.dueDate} onChangeText={value => updateForm('dueDate', value)} placeholder="2026-12-31" placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.label}>Username prieten (opțional)</Text>
              <TextInput value={form.friend} onChangeText={value => updateForm('friend', value)} placeholder="@username" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
              <View style={[styles.row, { marginTop: 16 }]}><Text style={styles.subtitle}>Confirmare în locație</Text><Switch value={form.requiresLocation} onValueChange={value => updateForm('requiresLocation', value)} trackColor={{ false: colors.border, true: colors.cyan }} /></View>
              <View style={styles.row}><Text style={styles.subtitle}>Passkey la finalizare</Text><Switch value={form.requiresBiometrics} onValueChange={value => updateForm('requiresBiometrics', value)} trackColor={{ false: colors.border, true: colors.cyan }} /></View>
              <View style={styles.row}><Text style={styles.subtitle}>Activitate recurentă</Text><Switch value={form.isRecurring} onValueChange={value => updateForm('isRecurring', value)} trackColor={{ false: colors.border, true: colors.cyan }} /></View>
              {form.requiresLocation ? <><Text style={styles.label}>Rază permisă (metri)</Text><TextInput value={form.radius} onChangeText={value => updateForm('radius', value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="150" placeholderTextColor={colors.muted} style={styles.input} /></> : null}
              <TouchableOpacity style={styles.button} onPress={createTask} disabled={saving}><Text style={styles.buttonText}>{saving ? 'Se salvează…' : 'Adaugă activitatea'}</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
