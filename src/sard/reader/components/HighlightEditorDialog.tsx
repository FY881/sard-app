import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { Dialog } from '@components';
import { useTheme } from '@hooks/persisted';
import { SARD_READER_STRINGS as S } from '../strings';
import { HIGHLIGHT_COLORS, HighlightColor } from '../settings';

export interface HighlightDraft {
  id?: number;
  text: string;
  note?: string | null;
  color: HighlightColor;
  orphaned?: boolean;
}

interface Props {
  visible: boolean;
  draft: HighlightDraft | null;
  /** Focus the note field on open (the "note" selection action). */
  focusNote?: boolean;
  onDismiss: () => void;
  onSave: (values: { note: string; color: HighlightColor }) => void;
  onDelete?: () => void;
  onShare?: () => void;
  onCopy?: () => void;
}

export const ColorDots: React.FC<{
  value: HighlightColor;
  onChange: (c: HighlightColor) => void;
  dark: boolean;
  size?: number;
}> = ({ value, onChange, dark, size = 34 }) => {
  const theme = useTheme();
  return (
    <View style={styles.colors}>
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map(c => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={HIGHLIGHT_COLORS[c].label}
            onPress={() => onChange(c)}
            style={[
              styles.dot,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: dark ? HIGHLIGHT_COLORS[c].dark : HIGHLIGHT_COLORS[c].light,
                borderColor: selected ? theme.primary : theme.outlineVariant,
                borderWidth: selected ? 3 : 1,
              },
            ]}
          >
            {selected ? (
              <MaterialCommunityIcons
                name="check"
                size={size * 0.5}
                color={dark ? '#fff' : '#000'}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

const HighlightEditorDialog: React.FC<Props> = ({
  visible,
  draft,
  focusNote,
  onDismiss,
  onSave,
  onDelete,
  onShare,
  onCopy,
}) => {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [color, setColor] = useState<HighlightColor>('yellow');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (visible && draft) {
      setNote(draft.note ?? '');
      setColor(draft.color);
      setConfirmDelete(false);
    }
  }, [visible, draft]);

  if (!draft) return null;
  const isEdit = draft.id !== undefined;
  const swatch = theme.isDark ? HIGHLIGHT_COLORS[color].dark : HIGHLIGHT_COLORS[color].light;

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        {isEdit ? (draft.note ? S.editNote : S.highlight) : focusNote ? S.addNote : S.highlight}
      </Dialog.Title>
      <Dialog.Content>
        <View
          style={[
            styles.quoteBox,
            { borderColor: swatch, backgroundColor: theme.surfaceVariant },
          ]}
        >
          <Text numberOfLines={6} style={[styles.quote, { color: theme.onSurface }]}>
            {draft.text}
          </Text>
        </View>
        {draft.orphaned ? (
          <Text style={[styles.warn, { color: theme.error }]}>{S.orphaned}</Text>
        ) : null}
        <ColorDots value={color} onChange={setColor} dark={!!theme.isDark} />
        <TextInput
          mode="outlined"
          label={S.note}
          placeholder={S.notePlaceholder}
          value={note}
          onChangeText={setNote}
          multiline
          autoFocus={!!focusNote}
          style={styles.input}
          theme={{ colors: { background: theme.surface } }}
        />
        {isEdit && (onShare || onCopy) ? (
          <View style={styles.inlineActions}>
            {onCopy ? (
              <Pressable
                onPress={onCopy}
                style={styles.inlineAction}
                android_ripple={{ color: theme.rippleColor }}
              >
                <MaterialCommunityIcons
                  name="content-copy"
                  size={20}
                  color={theme.onSurfaceVariant}
                />
                <Text style={{ color: theme.onSurfaceVariant }}>{S.copy}</Text>
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                onPress={onShare}
                style={styles.inlineAction}
                android_ripple={{ color: theme.rippleColor }}
              >
                <MaterialCommunityIcons
                  name="share-variant"
                  size={20}
                  color={theme.onSurfaceVariant}
                />
                <Text style={{ color: theme.onSurfaceVariant }}>{S.quoteCard}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Dialog.Content>
      <Dialog.Actions>
        {isEdit && onDelete ? (
          <Dialog.Action
            tone="danger"
            onPress={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          >
            {confirmDelete ? S.deleteConfirm : S.delete}
          </Dialog.Action>
        ) : null}
        <Dialog.Action onPress={onDismiss}>{S.cancel}</Dialog.Action>
        <Dialog.Action onPress={() => onSave({ note, color })}>{S.save}</Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default HighlightEditorDialog;

const styles = StyleSheet.create({
  quoteBox: {
    borderRadius: 8,
    borderStartWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quote: {
    fontSize: 15,
    lineHeight: 24,
  },
  warn: {
    fontSize: 12,
    marginTop: 6,
  },
  colors: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    maxHeight: 160,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  inlineAction: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
