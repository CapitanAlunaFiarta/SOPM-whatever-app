import { StyleSheet } from 'react-native';

export const colors = {
  background: '#070b14',
  surface: '#0f172a',
  elevated: '#172033',
  border: '#24324a',
  text: '#f8fafc',
  muted: '#94a3b8',
  cyan: '#38bdf8',
  indigo: '#6366f1',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#fb7185'
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 36 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16 },
  input: { backgroundColor: '#0a1020', borderColor: colors.border, borderWidth: 1, borderRadius: 12, color: colors.text, padding: 14, fontSize: 16 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 14 },
  button: { alignItems: 'center', backgroundColor: colors.indigo, borderRadius: 12, padding: 14, marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 12 },
  secondaryText: { color: colors.cyan, fontWeight: '800' },
  error: { color: '#fda4af', backgroundColor: '#451a1f', borderRadius: 10, padding: 12, marginTop: 14 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }
});
