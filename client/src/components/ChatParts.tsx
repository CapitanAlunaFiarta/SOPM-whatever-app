import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Modal, Platform, Pressable, type StyleProp, StyleSheet, Text, type TextInputInstance, View, type ViewStyle,
} from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { showMessage } from '@/lib/dialogs';
import { REACTIONS, type Reaction, type ReplyPreview } from '@/lib/types';

import { colors, radius } from './theme';
import { Button, Card, IconButton, Row, TextField } from './ui';

/** Mesajul la care răspund, cum apare deasupra câmpului de scris. */
export type ReplyTarget = { id: number; fullName: string; text: string };

/**
 * Starea comună a unui chat: la ce mesaj răspund și ce mesaj are meniul deschis (reacții, răspuns, ștergere).
 * „Răspunde” mută cursorul în câmpul de scris.
 */
export function useChatState<T extends { id: number }>() {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [menuFor, setMenuFor] = useState<T | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  return {
    replyTo,
    menuFor,
    inputRef,
    openMenu: (message: T) => setMenuFor(message),
    closeMenu: () => setMenuFor(null),
    reply: (target: ReplyTarget) => {
      setReplyTo(target);
      // După ce se închide meniul (pe Android focusul cerut cât e deschis un Modal se pierde).
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    clearReply: () => setReplyTo(null),
  };
}

/** Rulează o acțiune pe un mesaj; dacă nu reușește, spune de ce (fără să strice ecranul). */
export function runMessageAction(title: string, action: () => Promise<unknown>) {
  action().catch((error) => showMessage(title, errorMessage(error)));
}

/** Citatul de deasupra unui răspuns: cui i se răspunde și începutul mesajului lui. */
export function ReplyQuote({ reply, text, onDark }: { reply: ReplyPreview; text?: string; onDark?: boolean }) {
  return (
    <View style={[styles.quote, onDark && styles.quoteOnBubble]}>
      <Row gap={4}>
        <Ionicons name="arrow-undo" size={12} color={colors.cyan} />
        <Text style={styles.quoteName} numberOfLines={1}>{reply.fullName}</Text>
      </Row>
      <Text style={styles.quoteText} numberOfLines={2}>{text ?? reply.text}</Text>
    </View>
  );
}

/** Reacțiile unui mesaj: câte de fiecare; a mea e evidențiată, iar apăsarea pe una o pune sau o scoate. */
export function ReactionChips({ reactions, onToggle, align = 'flex-start' }: {
  reactions?: Reaction[]; onToggle?: (emoji: string) => void; align?: 'flex-start' | 'flex-end';
}) {
  const { t } = useI18n();
  if (!reactions?.length) return null;
  return (
    <View style={[styles.reactions, { justifyContent: align }]}>
      {reactions.map((reaction) => (
        <Pressable key={reaction.emoji} accessibilityRole="button" disabled={!onToggle}
          accessibilityState={{ selected: reaction.mine }}
          accessibilityLabel={t(reaction.mine ? 'reactions.chipMine' : 'reactions.chip', { emoji: reaction.emoji, count: reaction.count })}
          onPress={() => onToggle?.(reaction.emoji)} hitSlop={4}
          style={({ pressed }) => [styles.reaction, reaction.mine && styles.reactionMine, pressed && { opacity: 0.75 }]}>
          <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
          <Text style={[styles.reactionCount, reaction.mine && { color: colors.text }]}>{reaction.count}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Învelișul unui mesaj: pe telefon, apăsarea lungă deschide meniul mesajului. Pe web e doar butonul „…”
 * (un Pressable pe web ar face fiecare mesaj un element în plus în ordinea de la Tab).
 */
export function MessageShell({ onLongPress, style, children }: {
  onLongPress?: () => void; style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  if (Platform.OS === 'web' || !onLongPress) return <View style={style}>{children}</View>;
  return <Pressable onLongPress={onLongPress} delayLongPress={350} accessible={false} style={style}>{children}</Pressable>;
}

/** Butonul mic de lângă oră care deschide meniul mesajului (pe telefon merge și apăsarea lungă pe mesaj). */
export function MessageOptionsButton({ name, onPress }: { name: string; onPress: () => void }) {
  const { t } = useI18n();
  return <IconButton icon="ellipsis-horizontal" label={t('message.options', { name })} onPress={onPress} />;
}

/**
 * Meniul unui mesaj: cele 6 reacții (cea pusă de mine e marcată și a doua apăsare o scoate), „Răspunde” și,
 * dacă am voie, „Șterge mesajul”.
 */
export function MessageMenu({ open, author, text, reactions, onClose, onReact, onReply, onDelete }: {
  open: boolean;
  author: string;
  text: string;
  reactions?: Reaction[];
  onClose: () => void;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const mine = reactions?.find((reaction) => reaction.mine)?.emoji;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} />
        <Card style={styles.menu}>
          <View style={{ gap: 2 }}>
            <Text style={styles.menuAuthor} numberOfLines={1}>{author}</Text>
            <Text style={styles.menuText} numberOfLines={3}>{text}</Text>
          </View>
          {onReact ? (
            <View style={styles.emojiRow}>
              {REACTIONS.map((emoji) => {
                const selected = mine === emoji;
                return (
                  <Pressable key={emoji} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={t('reactions.react', { emoji })}
                    onPress={() => { onClose(); onReact(emoji); }}
                    style={({ pressed }) => [styles.emojiButton, selected && styles.emojiSelected, pressed && { opacity: 0.7 }]}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {onReply ? (
            <Button variant="secondary" icon="arrow-undo-outline" title={t('message.reply')} onPress={() => { onClose(); onReply(); }} />
          ) : null}
          {onDelete ? (
            <Button variant="danger" icon="trash-outline" title={t('chat.deleteLabel')} onPress={() => { onClose(); onDelete(); }} />
          ) : null}
          <Button variant="ghost" title={t('common.cancel')} onPress={onClose} />
        </Card>
      </View>
    </Modal>
  );
}

/** Câmpul de scris al unui chat, cu banda „Răspunzi lui …” deasupra când răspunzi la un mesaj. */
export function ChatComposer({ value, onChangeText, onSubmit, placeholder, sending, replyTo, onCancelReply, inputRef }: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder: string;
  sending?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  inputRef?: RefObject<TextInputInstance | null>;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      {replyTo ? (
        <View style={styles.replyBanner}>
          <Ionicons name="arrow-undo-outline" size={16} color={colors.cyan} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.replyBannerTitle} numberOfLines={1}>{t('message.replyingTo', { name: replyTo.fullName })}</Text>
            <Text style={styles.quoteText} numberOfLines={1}>{replyTo.text}</Text>
          </View>
          {onCancelReply ? <IconButton icon="close" label={t('message.cancelReply')} onPress={onCancelReply} /> : null}
        </View>
      ) : null}
      <Row>
        <View style={{ flex: 1 }}>
          <TextField inputRef={inputRef} value={value} onChangeText={onChangeText} placeholder={placeholder} maxLength={2000}
            onSubmitEditing={onSubmit} returnKeyType="send" />
        </View>
        <Button title={t('chat.send')} icon="send" compact loading={sending} onPress={onSubmit} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  quote: {
    gap: 2, paddingVertical: 6, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: colors.cyan,
    backgroundColor: colors.elevated, borderRadius: 8,
  },
  quoteOnBubble: { backgroundColor: 'rgba(0,0,0,0.22)' },
  quoteName: { color: colors.cyan, fontWeight: '800', fontSize: 12.5, flexShrink: 1 },
  quoteText: { color: colors.muted, fontSize: 13 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border,
  },
  reactionMine: { borderColor: colors.cyan, backgroundColor: `${colors.cyan}22` },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: colors.muted, fontSize: 12.5, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  menu: { width: '100%', maxWidth: 420, borderColor: colors.indigo },
  menuAuthor: { color: colors.cyan, fontWeight: '800' },
  menuText: { color: colors.text, fontSize: 15 },
  // Cele 6 reacții încap pe un rând și pe un telefon îngust (se micșorează împreună, fără să treacă pe rândul doi).
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  emojiButton: {
    flex: 1, maxWidth: 48, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border,
  },
  emojiSelected: { borderColor: colors.cyan, backgroundColor: `${colors.cyan}2A` },
  emoji: { fontSize: 22 },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.md, backgroundColor: colors.elevated, borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  replyBannerTitle: { color: colors.cyan, fontWeight: '800', fontSize: 13 },
});
