/** Small dialogs shared by the «سَرد+» screens (react-native-paper, LNReader theme). */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { t } from '../../i18n';

export const TextPromptDialog = ({
  visible,
  title,
  label,
  initial = '',
  multiline,
  secure,
  keyboardType,
  onDismiss,
  onSubmit,
  submitLabel,
  help,
  testID = 'sard-text-prompt',
}: {
  visible: boolean;
  title: string;
  label?: string;
  initial?: string;
  multiline?: boolean;
  secure?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'url';
  onDismiss: () => void;
  onSubmit: (v: string) => void;
  submitLabel?: string;
  help?: string;
  testID?: string;
}) => {
  const theme = useTheme();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: theme.overlay3 }}>
        <Dialog.Title style={{ color: theme.onSurface }}>{title}</Dialog.Title>
        <Dialog.Content>
          {help ? <Text style={[styles.help, { color: theme.onSurfaceVariant }]}>{help}</Text> : null}
          <TextInput
            testID={`${testID}-input`}
            mode="outlined"
            label={label}
            value={value}
            onChangeText={setValue}
            multiline={multiline}
            numberOfLines={multiline ? 4 : 1}
            secureTextEntry={secure}
            keyboardType={keyboardType}
            autoFocus
            theme={{ colors: { ...theme } }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button title={t('common.cancel')} onPress={onDismiss} />
          <Button testID={`${testID}-ok`} mode="contained" title={submitLabel ?? t('common.save')} onPress={() => onSubmit(value)} />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  desc?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

export const ChoiceDialog = <T extends string | number>({
  visible,
  title,
  choices,
  selected,
  onDismiss,
  onPick,
  searchable,
  testID = 'sard-choice',
}: {
  visible: boolean;
  title: string;
  choices: Choice<T>[];
  selected?: T | null;
  onDismiss: () => void;
  onPick: (v: T) => void;
  searchable?: boolean;
  testID?: string;
}) => {
  const theme = useTheme();
  const [q, setQ] = useState('');
  const list = useMemo(
    () => (q.trim() ? choices.filter(c => c.label.toLowerCase().includes(q.trim().toLowerCase())) : choices),
    [choices, q],
  );
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.choiceDialog, { backgroundColor: theme.overlay3 }]}>
        <Dialog.Title style={{ color: theme.onSurface }}>{title}</Dialog.Title>
        {searchable ? (
          <View style={styles.search}>
            <TextInput dense mode="outlined" label={t('common.search')} value={q} onChangeText={setQ} theme={{ colors: { ...theme } }} />
          </View>
        ) : null}
        <Dialog.ScrollArea style={styles.scrollArea}>
          <FlatList
            testID={testID}
            data={list}
            keyExtractor={c => String(c.value)}
            ListEmptyComponent={<Text style={[styles.empty, { color: theme.onSurfaceVariant }]}>{t('common.none')}</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(item.value)}
                android_ripple={{ color: theme.rippleColor }}
                style={styles.choice}
                testID={`${testID}-${item.value}`}
              >
                {item.icon ? <MaterialCommunityIcons name={item.icon} size={20} color={theme.onSurfaceVariant} /> : null}
                <View style={styles.flex}>
                  <Text style={[styles.choiceText, { color: theme.onSurface }]} numberOfLines={2}>
                    {item.label}
                  </Text>
                  {item.desc ? <Text style={{ color: theme.onSurfaceVariant, fontSize: 12 }}>{item.desc}</Text> : null}
                </View>
                {selected === item.value ? <MaterialCommunityIcons name="check" size={20} color={theme.primary} /> : null}
              </Pressable>
            )}
          />
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button title={t('common.close')} onPress={onDismiss} />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

/** −/+ number control (no slider dependency inside dialogs and lists). */
export const Stepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  testID,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  testID?: string;
}) => {
  const theme = useTheme();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <View style={styles.stepper} testID={testID}>
      <Pressable accessibilityRole="button" accessibilityLabel="-" onPress={() => set(value - step)} style={[styles.stepBtn, { borderColor: theme.outline }]}>
        <MaterialCommunityIcons name="minus" size={18} color={theme.onSurface} />
      </Pressable>
      <Text style={[styles.stepValue, { color: theme.onSurface }]}>{format ? format(value) : String(value)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="+" onPress={() => set(value + step)} style={[styles.stepBtn, { borderColor: theme.outline }]}>
        <MaterialCommunityIcons name="plus" size={18} color={theme.onSurface} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  help: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  choiceDialog: { maxHeight: '80%' },
  search: { paddingHorizontal: 24, paddingBottom: 8 },
  scrollArea: { paddingHorizontal: 0, maxHeight: 420 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 12 },
  choiceText: { fontSize: 15 },
  empty: { textAlign: 'center', padding: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 56, textAlign: 'center', fontSize: 14, fontWeight: '600' },
});
