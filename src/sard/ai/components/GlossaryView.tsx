/**
 * الشخصيات والأماكن — spoiler-safe glossary built from read chapters only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { ThemeColors } from '@theme/types';
import { Button, ConfirmationDialog } from '@components';
import { normalizeText } from '../arabic';
import { clearGlossary, setGlossaryPinned } from '../db';
import {
  buildGlossary,
  getGlossaryView,
  type GlossaryView as GlossaryViewData,
  type NovelRef,
} from '../features';
import {
  filterGlossary,
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
  type VisibleGlossaryEntry,
} from '../glossaryLogic';
import { AI_STRINGS } from '../strings';
import AiErrorNotice from './AiErrorNotice';
import { Card, LoadingRow, Muted, Notice, Pill, ProgressBar } from './ui';
import { useAiTask } from './useAiTask';

const S = AI_STRINGS.glossary;

const CATEGORY_ICONS: Record<GlossaryCategory, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  character: 'account',
  place: 'map-marker',
  power: 'flash',
  item: 'sword',
  faction: 'account-group',
  term: 'book-alphabet',
};

const GlossaryView = ({
  theme,
  novel,
  currentChapterId,
  onOpenSettings,
}: {
  theme: ThemeColors;
  novel: NovelRef;
  currentChapterId?: number;
  onOpenSettings?: () => void;
}) => {
  const task = useAiTask();
  const [view, setView] = useState<GlossaryViewData | undefined>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GlossaryCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<string | undefined>();
  const [resetVisible, setResetVisible] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const reload = useCallback(
    () => getGlossaryView(novel, currentChapterId).then(setView),
    [novel, currentChapterId],
  );

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const build = () =>
    task
      .run((signal, onProgress) =>
        buildGlossary({ novel, currentChapterId, signal, onProgress }),
      )
      .then(r => {
        if (!r) return;
        setView(r);
        setNotice(r.stoppedEarly ? S.partial(r.pending) : undefined);
      });

  const entries = useMemo(
    () => (view ? filterGlossary(view.entries, query, category) : []),
    [view, query, category],
  );

  const counts = useMemo(() => {
    const m = new Map<GlossaryCategory, number>();
    view?.entries.forEach(e => m.set(e.category, (m.get(e.category) ?? 0) + 1));
    return m;
  }, [view]);

  const togglePin = async (e: VisibleGlossaryEntry) => {
    await setGlossaryPinned(novel.id, normalizeText(e.name), !e.pinned);
    reload();
  };

  if (!view) return <LoadingRow theme={theme} label={AI_STRINGS.common.loading} />;

  return (
    <View>
      <Notice theme={theme} icon="shield-check-outline" title={S.spoilerSafe} />
      {view.processedChapterName ? (
        <Muted theme={theme} style={styles.status}>
          {S.builtUpTo(view.processedChapterName)}
        </Muted>
      ) : null}

      {task.running ? (
        <View style={styles.progress}>
          <LoadingRow
            theme={theme}
            label={
              task.progress
                ? `${S.progress(task.progress.done, task.progress.total)}${
                    task.progress.label ? ` — ${task.progress.label}` : ''
                  }`
                : AI_STRINGS.common.working
            }
            onCancel={task.cancel}
            cancelLabel={AI_STRINGS.common.stop}
          />
          {task.progress?.total ? (
            <ProgressBar
              theme={theme}
              value={task.progress.done / task.progress.total}
              style={styles.bar}
            />
          ) : null}
        </View>
      ) : !view.hasAnyRead ? (
        <Notice theme={theme} title={S.noRead} />
      ) : view.pending > 0 ? (
        <View style={styles.cta}>
          <Button
            mode="contained"
            icon="account-search"
            title={view.entries.length ? S.update(view.pending) : S.build}
            onPress={build}
          />
        </View>
      ) : (
        <Muted theme={theme} style={styles.status}>
          {S.upToDate}
        </Muted>
      )}

      {view.notDownloaded > 0 ? (
        <Muted theme={theme} style={styles.status}>
          {AI_STRINGS.recap.noDownloaded} ({view.notDownloaded})
        </Muted>
      ) : null}
      {notice ? <Notice theme={theme} title={notice} /> : null}
      {task.error ? (
        <AiErrorNotice theme={theme} error={task.error} onOpenSettings={onOpenSettings} onRetry={build} />
      ) : null}

      {view.entries.length ? (
        <>
          <PaperTextInput
            mode="outlined"
            dense
            value={query}
            onChangeText={setQuery}
            placeholder={S.search}
            left={<PaperTextInput.Icon icon="magnify" color={theme.onSurfaceVariant} />}
            textColor={theme.onSurface}
            outlineColor={theme.outline}
            activeOutlineColor={theme.primary}
            style={styles.search}
            theme={{ colors: { background: theme.surface, onSurfaceVariant: theme.onSurfaceVariant } }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            <Pill
              theme={theme}
              label={`الكل (${view.entries.length})`}
              active={category === 'all'}
              onPress={() => setCategory('all')}
            />
            {GLOSSARY_CATEGORIES.filter(c => counts.get(c)).map(c => (
              <Pill
                key={c}
                theme={theme}
                icon={CATEGORY_ICONS[c]}
                label={`${S.categories[c]} (${counts.get(c)})`}
                active={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </ScrollView>
          {entries.map(e => {
            const open = expanded === e.name;
            return (
              <Pressable
                key={e.name}
                onPress={() => setExpanded(open ? undefined : e.name)}
                onLongPress={() => togglePin(e)}
                android_ripple={{ color: theme.rippleColor }}
                style={styles.entry}
              >
                <View style={[styles.entryIcon, { backgroundColor: theme.secondaryContainer }]}>
                  <MaterialCommunityIcons
                    name={CATEGORY_ICONS[e.category]}
                    size={18}
                    color={theme.onSecondaryContainer}
                  />
                </View>
                <View style={styles.flex}>
                  <View style={styles.entryHead}>
                    <Text style={[styles.entryName, { color: theme.onSurface }]}>{e.name}</Text>
                    {e.pinned ? (
                      <MaterialCommunityIcons name="pin" size={14} color={theme.primary} />
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={open ? undefined : 2}
                    style={[styles.entryDesc, { color: theme.onSurfaceVariant }]}
                  >
                    {e.description}
                  </Text>
                  {open && e.aliases.length ? (
                    <Muted theme={theme} style={styles.small}>
                      {S.aliases}: {e.aliases.join('، ')}
                    </Muted>
                  ) : null}
                  {open && e.firstSeenChapterName ? (
                    <Muted theme={theme} style={styles.small}>
                      {S.firstSeen(e.firstSeenChapterName)}
                    </Muted>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          <View style={styles.cta}>
            <Button
              mode="text"
              icon="restore"
              textColor={theme.error}
              title={S.reset}
              onPress={() => setResetVisible(true)}
            />
          </View>
        </>
      ) : view.hasAnyRead && !task.running ? (
        <Card theme={theme}>
          <Muted theme={theme}>{S.empty}</Muted>
        </Card>
      ) : null}

      <ConfirmationDialog
        visible={resetVisible}
        title={S.reset}
        message={S.resetConfirm}
        confirmLabel={AI_STRINGS.common.confirm}
        cancelLabel={AI_STRINGS.common.cancel}
        confirmTone="danger"
        onConfirm={async () => {
          setResetVisible(false);
          await clearGlossary(novel.id);
          reload();
        }}
        onDismiss={() => setResetVisible(false)}
      />
    </View>
  );
};

export default GlossaryView;

const styles = StyleSheet.create({
  status: { marginHorizontal: 16, marginTop: 4 },
  progress: { marginBottom: 8 },
  bar: { marginHorizontal: 16 },
  cta: { alignItems: 'center', paddingVertical: 10 },
  search: { marginHorizontal: 16, marginTop: 8 },
  pills: { paddingHorizontal: 16, paddingTop: 10 },
  entry: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10 },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  flex: { flex: 1 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryName: { fontSize: 15, fontWeight: '600' },
  entryDesc: { fontSize: 14, lineHeight: 21, marginTop: 2 },
  small: { fontSize: 12, marginTop: 4 },
});
