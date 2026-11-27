export const colors = {
  background: '#070b14',
  surface: '#0f172a',
  elevated: '#172033',
  input: '#0a1020',
  border: '#24324a',
  text: '#f8fafc',
  muted: '#94a3b8',
  faint: '#64748b',
  cyan: '#38bdf8',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#fb7185',
} as const;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export const toneColor: Record<Tone, string> = {
  neutral: colors.muted,
  info: colors.cyan,
  success: colors.green,
  warning: colors.amber,
  danger: colors.red,
  accent: colors.indigo,
};

export const radius = { sm: 8, md: 12, lg: 18 } as const;
export const MAX_CONTENT_WIDTH = 920;
