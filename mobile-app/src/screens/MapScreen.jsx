import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { taskApi, apiMessage } from '../services/api';
import { styles, colors } from '../theme';

export default function MapScreen() {
  const [location, setLocation] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Permite accesul la locație pentru a vedea harta.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(current.coords);
      const { data } = await taskApi.get('/tasks');
      setTasks(data.filter(task => task.requiresLocation && task.latitude && task.longitude));
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.cyan} size="large" /></View>;
  const region = location ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 } : { latitude: 45.6525, longitude: 25.5888, latitudeDelta: 0.08, longitudeDelta: 0.08 };

  return (
    <View style={styles.screen}>
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation showsMyLocationButton>
        {location && <Marker coordinate={location} title="Locația mea" pinColor={colors.cyan} />}
        {tasks.map(task => (
          <React.Fragment key={task.id}>
            <Marker coordinate={{ latitude: task.latitude, longitude: task.longitude }} title={task.title} description={`${task.category} · ${task.status}`} />
            <Circle center={{ latitude: task.latitude, longitude: task.longitude }} radius={task.allowedRadiusMeters || task.radius || 150} fillColor="rgba(56,189,248,0.16)" strokeColor={colors.cyan} />
          </React.Fragment>
        ))}
      </MapView>
      <View style={[styles.card, { position: 'absolute', top: 16, left: 16, right: 16, marginTop: 0 }]}>
        <View style={styles.row}><View><Text style={styles.title}>Hartă & task-uri</Text><Text style={styles.subtitle}>{tasks.length} activități cu locație</Text></View><TouchableOpacity onPress={load}><Text style={styles.secondaryText}>Reîncarcă</Text></TouchableOpacity></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}
