import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { userApi, apiMessage } from '../services/api';
import { styles, colors } from '../theme';

export default function SocialScreen() {
  const [section, setSection] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [text, setText] = useState('');
  const [friendUsername, setFriendUsername] = useState('');
  const [friendModalOpen, setFriendModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
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
    setSending(true);
    try {
      await userApi.post('/chat', { text: text.trim() });
      setText('');
      await load();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSending(false);
    }
  };

  const addFriend = async () => {
    const username = friendUsername.trim().replace(/^@/, '');
    if (!username) return;
    setSending(true);
    setError('');
    try {
      await userApi.post('/friends', { username });
      setFriendUsername('');
      setFriendModalOpen(false);
      await load();
      Alert.alert('Prieten adăugat', `@${username} a fost adăugat în lista ta.`);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { flex: 1 }]}>
        <Text style={styles.title}>Comunitate</Text>
        <Text style={styles.subtitle}>Chat global, prieteni și streak-uri</Text>
        <View style={[styles.row, { marginTop: 20, gap: 10 }]}>
          <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: section === 'chat' ? colors.indigo : colors.elevated }]} onPress={() => setSection('chat')}><Text style={styles.buttonText}>💬 Chat global</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: section === 'friends' ? colors.indigo : colors.elevated }]} onPress={() => setSection('friends')}><Text style={styles.buttonText}>🔥 Prieteni</Text></TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {section === 'chat' ? (
          <View style={[styles.card, { flex: 1 }]}>
            <FlatList style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} data={messages} inverted keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.cyan, fontWeight: '800' }}>{item.senderName} <Text style={{ color: colors.muted }}>@{item.senderUsername}</Text></Text><Text style={{ color: colors.text, marginTop: 4 }}>{item.text}</Text></View>} ListEmptyComponent={<Text style={styles.subtitle}>Nu există mesaje încă.</Text>} />
            <KeyboardAvoidingView behavior="padding">
              <View style={[styles.row, { gap: 8, marginTop: 14 }]}><TextInput value={text} onChangeText={setText} placeholder="Scrie un mesaj…" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} multiline maxLength={1000} /><TouchableOpacity style={[styles.button, { marginTop: 0, paddingHorizontal: 16 }]} onPress={send} disabled={sending}><Text style={styles.buttonText}>{sending ? '…' : 'Trimite'}</Text></TouchableOpacity></View>
            </KeyboardAvoidingView>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.button} onPress={() => setFriendModalOpen(true)}><Text style={styles.buttonText}>+ Adaugă un prieten</Text></TouchableOpacity>
            <FlatList data={friends} keyExtractor={(item) => `${item.direction}-${item.email}`} contentContainerStyle={{ paddingTop: 16 }} renderItem={({ item }) => <View style={[styles.card, { marginTop: 10 }]}><View style={styles.row}><View><Text style={{ color: colors.text, fontWeight: '800' }}>{item.fullName}</Text><Text style={styles.subtitle}>@{item.username}</Text></View><Text style={{ color: colors.amber, fontSize: 18, fontWeight: '800' }}>🔥 {item.streak || 0}</Text></View><Text style={[styles.subtitle, { color: item.direction === 'incoming' ? colors.green : colors.muted }]}>{item.direction === 'incoming' ? 'Te-a adăugat la prieteni' : 'Adăugat de tine'}</Text></View>} ListEmptyComponent={<Text style={styles.subtitle}>Nu ai prieteni sau conexiuni încă.</Text>} />
          </>
        )}
      </View>
      <Modal visible={friendModalOpen} animationType="fade" transparent onRequestClose={() => setFriendModalOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={[styles.card, { marginTop: 0 }]}>
            <View style={styles.row}><Text style={styles.title}>Adaugă prieten</Text><TouchableOpacity onPress={() => setFriendModalOpen(false)}><Text style={styles.secondaryText}>Închide</Text></TouchableOpacity></View>
            <Text style={styles.subtitle}>Introdu username-ul exact al persoanei.</Text>
            <TextInput value={friendUsername} onChangeText={setFriendUsername} placeholder="@username" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { marginTop: 16 }]} />
            <TouchableOpacity style={styles.button} onPress={addFriend} disabled={sending}><Text style={styles.buttonText}>{sending ? 'Se adaugă…' : 'Adaugă prietenul'}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
