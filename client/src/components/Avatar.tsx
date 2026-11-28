import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { API_URLS } from '@/lib/config';

import { colors } from './theme';

/** Culori pentru inițiale: aceeași persoană are mereu aceeași culoare (după username). */
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index++) value = (value * 31 + text.charCodeAt(index)) | 0;
  return Math.abs(value);
}

/** Linkul pozei (public); versiunea din link face ca o poză nouă să nu fie luată din cache. */
export function avatarUrl(username: string, version: number): string {
  return `${API_URLS.user}/avatars/${encodeURIComponent(username)}?v=${version}`;
}

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

/**
 * Poza de profil sau, dacă nu are (ori nu se încarcă), inițialele pe o culoare stabilă. E decorativă pentru
 * cititoarele de ecran: numele apare mereu lângă ea.
 */
export function Avatar({ username, name, version, size = 40 }: {
  username: string; name: string; version?: number | null; size?: number;
}) {
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (version && failedFor !== version) {
    return (
      <Image source={{ uri: avatarUrl(username, version) }} style={[box, styles.image]} accessible={false}
        onError={() => setFailedFor(version)} />
    );
  }
  const color = PALETTE[hash(username) % PALETTE.length];
  return (
    <View style={[box, styles.initials, { backgroundColor: `${color}33`, borderColor: color }]} accessible={false}>
      <Text style={[styles.text, { fontSize: Math.round(size * 0.38) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.elevated },
  initials: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { color: colors.text, fontWeight: '900' },
});
