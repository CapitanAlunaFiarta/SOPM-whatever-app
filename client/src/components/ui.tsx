import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';

import { colors, MAX_CONTENT_WIDTH, radius, toneColor, type Tone } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type ScreenProps = {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Ecran standard: fundal întunecat, zonă sigură, conținut centrat (lățime maximă pe web). */
export function Screen({ title, subtitle, right, children, scroll = true, refreshing, onRefresh, contentStyle }: ScreenProps) {
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.cyan} />
          ) : undefined}>
          <View style={styles.container}>
            {header}
            {children}
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.container, styles.fill, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

type TextVariant = 'heading' | 'body' | 'muted' | 'small' | 'label' | 'big';

export function AppText({ children, variant = 'body', style, numberOfLines }: {
  children: ReactNode; variant?: TextVariant; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  return <Text style={[textStyles[variant], style]} numberOfLines={numberOfLines}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, compact, style }: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const foreground = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? colors.muted : colors.cyan;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      // `disabled` pune și aria-disabled pe web (react-native-web nu traduce accessibilityState),
      // deci cititoarele de ecran și testele văd că butonul nu se poate apăsa încă.
      disabled={inactive}
      accessibilityState={{ disabled: inactive }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        buttonVariants[variant],
        (pressed || inactive) && { opacity: inactive ? 0.55 : 0.8 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={foreground} size="small" />
        : icon ? <Ionicons name={icon} size={compact ? 15 : 18} color={foreground} /> : null}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = 'neutral' }: {
  icon: IconName; onPress: () => void; label: string; tone?: Tone;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color={toneColor[tone]} />
    </Pressable>
  );
}

export function TextField({ label, error, style, ...props }: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={textStyles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, props.multiline && styles.inputMultiline, error ? { borderColor: colors.red } : null, style]}
        accessibilityLabel={label ?? props.placeholder}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[]; value: T; onChange: (value: T) => void; labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(option)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{labels?.[option] ?? option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ca ChipGroup, dar cu mai multe alegeri (ex. prietenii invitați la o activitate). */
export function MultiChipGroup({ options, values, onChange, labels }: {
  options: readonly string[]; values: readonly string[]; onChange: (values: string[]) => void; labels?: Record<string, string>;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <Pressable key={option} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
            accessibilityLabel={labels?.[option] ?? option}
            onPress={() => onChange(selected ? values.filter((value) => value !== option) : [...values, option])}
            style={[styles.chip, selected && styles.chipSelected]}>
            {selected ? <Ionicons name="checkmark" size={14} color={colors.text} /> : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{labels?.[option] ?? option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, description, value, onChange, icon }: {
  label: string; description?: string; value: boolean; onChange: (value: boolean) => void; icon?: IconName;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow} accessibilityRole="switch"
      accessibilityLabel={label} accessibilityState={{ checked: value }}>
      {icon ? <Ionicons name={icon} size={20} color={value ? colors.cyan : colors.faint} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={textStyles.small}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.indigo }}
        thumbColor={value ? colors.cyan : colors.muted} />
    </Pressable>
  );
}

export function Badge({ text, tone = 'neutral', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const color = toneColor[tone];
  return (
    <View style={[styles.badge, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'danger', onClose }: { text: string; tone?: 'danger' | 'success' | 'info'; onClose?: () => void }) {
  const { t } = useI18n();
  const color = tone === 'danger' ? colors.red : tone === 'success' ? colors.green : colors.cyan;
  return (
    <View style={[styles.banner, { borderColor: `${color}66`, backgroundColor: `${color}1F` }]}>
      <Ionicons name={tone === 'danger' ? 'alert-circle' : tone === 'success' ? 'checkmark-circle' : 'information-circle'}
        size={18} color={color} />
      <Text style={[styles.bannerText, { color: colors.text }]}>{text}</Text>
      {onClose ? <IconButton icon="close" label={t('common.close')} onPress={onClose} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={colors.faint} />
      <Text style={textStyles.heading}>{title}</Text>
      {text ? <Text style={[textStyles.muted, { textAlign: 'center' }]}>{text}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (value: T) => void;
}) {
  // De la 4 opțiuni în sus, iconița trece deasupra textului, ca etichetele să încapă pe telefon.
  const stacked = options.length >= 4;
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="tab"
            accessibilityState={{ selected }} style={[styles.segment, stacked && styles.segmentStacked, selected && styles.segmentSelected]}>
            {option.icon ? <Ionicons name={option.icon} size={15} color={selected ? '#fff' : colors.muted} /> : null}
            <Text style={[styles.segmentText, stacked && styles.segmentTextStacked, selected && { color: '#fff' }]}
              numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatTile({ label, value, hint, tone = 'info', icon }: {
  label: string; value: string | number; hint?: string; tone?: Tone; icon?: IconName;
}) {
  return (
    <View style={styles.stat}>
      <Row gap={6}>
        {icon ? <Ionicons name={icon} size={16} color={toneColor[tone]} /> : null}
        <Text style={textStyles.small}>{label}</Text>
      </Row>
      <Text style={[styles.statValue, { color: toneColor[tone] }]}>{value}</Text>
      {hint ? <Text style={textStyles.small}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.cyan} size="large" />
      {text ? <Text style={[textStyles.muted, { textAlign: 'center' }]}>{text}</Text> : null}
    </View>
  );
}

const textStyles = StyleSheet.create({
  big: { color: colors.text, fontSize: 30, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 12.5, lineHeight: 17 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
});

const buttonVariants = StyleSheet.create({
  primary: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  secondary: { backgroundColor: colors.elevated, borderColor: colors.border },
  danger: { backgroundColor: '#be123c', borderColor: '#be123c' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, alignItems: 'center' },
  container: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 14 },
  fill: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1,
    borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 16,
  },
  buttonCompact: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm },
  buttonText: { fontSize: 15, fontWeight: '800' },
  buttonTextCompact: { fontSize: 13 },
  iconButton: { padding: 6, borderRadius: radius.sm },
  field: { gap: 0 },
  input: {
    backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
    color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  inputMultiline: { minHeight: 44, maxHeight: 120 },
  fieldError: { color: colors.red, fontSize: 12.5, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.elevated, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13,
  },
  chipSelected: { backgroundColor: `${colors.indigo}33`, borderColor: colors.indigo },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  chipTextSelected: { color: colors.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segmentSelected: { backgroundColor: colors.indigo },
  segmentStacked: { flexDirection: 'column', gap: 2, paddingVertical: 7, paddingHorizontal: 2 },
  segmentTextStacked: { fontSize: 12 },
  segmentText: { color: colors.muted, fontWeight: '800', fontSize: 13.5 },
  stat: { flexGrow: 1, flexBasis: 140, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 4 },
  statValue: { fontSize: 28, fontWeight: '900' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: colors.background },
});
