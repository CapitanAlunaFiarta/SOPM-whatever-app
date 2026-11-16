import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { userApi, apiMessage } from '../services/api';
import { styles, colors } from '../theme';

export default function SocialScreen() {
  const [section, setSection] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: chat }, { data: friendList }, { data: leaderboard }] = await Promise.all([
        userApi.get('/chat'),
        userApi.get('/friends'),
        userApi.get('/leaderboard')
      ]);
      setMessages(chat);
      setFriends(friendList.map(friend => ({
        ...friend,
        streak: leaderboard.find(entry => entry.username === friend.username)?.streak || 0
      })));
    } catch (err) {
      setError(apiMessage(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await userApi.post('/chat', { text: text.trim() });
      setText('');
      await load();
    } catch (err) {
      setError(apiMessage(err));
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Comunitate</Text>
        <Text style={styles.subtitle}>Chat global, prieteni și streak-uri</Text>
        <View style={[styles.row, { marginTop: 20, gap: 10 }]}>
          <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: section === 'chat' ? colors.indigo : colors.elevated }]} onPress={() => setSection('chat')}><Text style={styles.buttonText}>💬 Chat global</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: section === 'friends' ? colors.indigo : colors.elevated }]} onPress={() => setSection('friends')}><Text style={styles.buttonText}>🔥 Prieteni</Text></TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {section === 'chat' ? (
          <View style={styles.card}>
            <FlatList data={messages} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.cyan, fontWeight: '800' }}>{item.senderName} <Text style={{ color: colors.muted }}>@{item.senderUsername}</Text></Text><Text style={{ color: colors.text, marginTop: 4 }}>{item.text}</Text></View>} ListEmptyComponent={<Text style={styles.subtitle}>Nu există mesaje încă.</Text>} />
            <View style={[styles.row, { gap: 8, marginTop: 14 }]}><TextInput value={text} onChangeText={setText} placeholder="Scrie un mesaj…" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /><TouchableOpacity style={[styles.button, { marginTop: 0, paddingHorizontal: 16 }]} onPress={send}><Text style={styles.buttonText}>Trimite</Text></TouchableOpacity></View>
          </View>
        ) : (
          <FlatList data={friends} keyExtractor={(item) => item.email} contentContainerStyle={{ paddingTop: 16 }} renderItem={({ item }) => <View style={[styles.card, styles.row, { marginTop: 10 }]}><View><Text style={{ color: colors.text, fontWeight: '800' }}>{item.fullName}</Text><Text style={styles.subtitle}>@{item.username}</Text></View><Text style={{ color: colors.amber, fontSize: 18, fontWeight: '800' }}>🔥 {item.streak || 0}</Text></View>} ListEmptyComponent={<Text style={styles.subtitle}>Nu ai prieteni adăugați.</Text>} />
        )}
      </View>
    </View>
  );
}
