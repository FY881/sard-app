/**
 * «المكتبة والتنظيم»: «فاجئني», tags, saved smart filters (Plus), reading
 * status / rating / note per novel, bulk actions, up-next queue, share list.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { isArabicUi, num, t, tr } from '../../i18n';
import { Card, ChipsRow, Empty, Muted, Row, Screen, SectionTitle, TierBadge } from '../ui';
import { ChoiceDialog, TextPromptDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { loadLibraryNovels, type LibraryNovel } from '../../agents/library';
import { createTag, deleteTag, getAllNovelMeta, listTags, renameTag, setHidden, setNovelMeta, setNovelTags, tagNovels } from '../db';
import { smartFiltersStore, upNextStore } from '../store';
import {
  READING_STATUSES,
  STATUS_LABELS,
  applyFilter,
  buildShareList,
  progressOf,
  queueAdd,
  queueMove,
  queueRemove,
  surprisePick,
  type NovelMeta,
  type ReadingStatus,
  type SmartFilter,
  type SurpriseMode,
} from '../logic/library';

const MODES: SurpriseMode[] = ['any', 'unread', 'unstarted', 'planned'];

const Stars = ({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) => {
  const theme = useTheme();
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map(i => (
        <Pressable key={i} disabled={!onChange} onPress={() => onChange?.(i === value ? 0 : i)} hitSlop={4} testID={`sard-star-${i}`}>
          <MaterialCommunityIcons name={i <= value ? 'star' : 'star-outline'} size={size} color={i <= value ? '#F5B400' : theme.outline} />
        </Pressable>
      ))}
    </View>
  );
};

const LibraryToolsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data, reload } = useAsync(async () => {
    const [novels, metas, tags] = await Promise.all([loadLibraryNovels(), getAllNovelMeta(), listTags()]);
    return { novels, metas, tags };
  }, []);
  const novels = data?.novels ?? [];
  const metas = data?.metas ?? new Map<number, NovelMeta>();
  const tags = data?.tags ?? [];

  const [filters] = smartFiltersStore.use();
  const [queue, setQueue] = upNextStore.use();
  const filterGate = useEntitlement('library.smartFilters', filters.length);

  const [mode, setMode] = useState<SurpriseMode>('unread');
  const [pick, setPick] = useState<LibraryNovel | undefined>();
  const [activeFilter, setActiveFilter] = useState<SmartFilter | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editNovel, setEditNovel] = useState<LibraryNovel | null>(null);
  const [tagPrompt, setTagPrompt] = useState<null | { kind: 'new' } | { kind: 'rename'; id: number; name: string } | { kind: 'bulk' }>(null);
  const [statusPick, setStatusPick] = useState(false);
  const [filterEditor, setFilterEditor] = useState(false);

  const surprise = (exclude?: number) => {
    const p = surprisePick(novels, metas, mode, Math.random, exclude);
    setPick(p);
    if (!p) showToast(t('plus.library.surpriseNone'));
  };
  useEffect(() => {
    if (route.params?.surprise && novels.length && !pick) surprise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.surprise, novels.length]);

  const openNovel = (n: LibraryNovel) =>
    navigation.navigate('ReaderStack', { screen: 'Novel', params: { name: n.name, path: n.path, pluginId: n.pluginId, cover: n.cover ?? null } });

  const visible = useMemo(() => {
    let list = novels.filter(n => !metas.get(n.id)?.hidden);
    if (activeFilter) list = applyFilter(list, metas, activeFilter) as LibraryNovel[];
    if (tagFilter) list = list.filter(n => metas.get(n.id)?.tags?.includes(tagFilter));
    return list;
  }, [novels, metas, activeFilter, tagFilter]);

  const toggleSel = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selIds = [...selected];
  const doneBulk = (msg: string) => {
    showToast(msg);
    setSelected(new Set());
    reload();
  };

  const share = async () => {
    const text = buildShareList(novels, metas, isArabicUi() ? 'ar' : 'en');
    await Share.share({ message: text });
  };

  return (
    <Screen title={t('plus.library.title')} testID="sard-library-tools">
      {/* ------------------------------------------------ surprise me */}
      <SectionTitle theme={theme}>{tr(FEATURES['library.surpriseMe'].title)}</SectionTitle>
      <ChipsRow>
        {MODES.map(m => (
          <Button key={m} compact mode={mode === m ? 'contained' : 'outlined'} title={t(`plus.library.mode.${m}` as any)} onPress={() => setMode(m)} />
        ))}
      </ChipsRow>
      {pick ? (
        <Card theme={theme} onPress={() => openNovel(pick)}>
          <View style={styles.head}>
            <MaterialCommunityIcons name="dice-5-outline" size={22} color={theme.primary} />
            <Text style={[styles.pickTitle, { color: theme.onSurface }]} numberOfLines={2} testID="sard-surprise-result">
              {pick.name}
            </Text>
          </View>
          <Muted theme={theme}>
            {t('plus.library.progress', { p: num(Math.round(progressOf(pick) * 100)), unread: num(pick.chaptersUnread ?? 0) })}
          </Muted>
          <View style={styles.actionsRow}>
            <Button compact mode="contained" title={t('common.open')} onPress={() => openNovel(pick)} />
            <Button compact title={t('plus.library.another')} onPress={() => surprise(pick.id)} />
            <Button compact title={t('plus.library.queueAdd')} onPress={() => setQueue(queueAdd(upNextStore.get(), pick.id))} />
          </View>
        </Card>
      ) : null}
      <View style={styles.pad}>
        <Button testID="sard-surprise-btn" mode="contained-tonal" icon="dice-5-outline" title={t('plus.library.surprise')} onPress={() => surprise()} />
      </View>

      {/* ------------------------------------------------------- up next */}
      <SectionTitle theme={theme}>{tr(FEATURES['library.upNext'].title)}</SectionTitle>
      {!queue.length ? <Muted theme={theme} style={styles.pad}>{t('plus.library.queueEmpty')}</Muted> : null}
      {queue.map((id, i) => {
        const n = novels.find(x => x.id === id);
        if (!n) return null;
        return (
          <Row
            key={id}
            theme={theme}
            icon="playlist-play"
            title={`${num(i + 1)}. ${n.name}`}
            onPress={() => openNovel(n)}
            right={
              <View style={styles.actionsRow}>
                <Pressable onPress={() => setQueue(queueMove(queue, id, -1))} hitSlop={6} accessibilityLabel={t('plus.common.up')}>
                  <MaterialCommunityIcons name="chevron-up" size={22} color={theme.onSurfaceVariant} />
                </Pressable>
                <Pressable onPress={() => setQueue(queueMove(queue, id, 1))} hitSlop={6} accessibilityLabel={t('plus.common.down')}>
                  <MaterialCommunityIcons name="chevron-down" size={22} color={theme.onSurfaceVariant} />
                </Pressable>
                <Pressable onPress={() => setQueue(queueRemove(queue, id))} hitSlop={6} accessibilityLabel={t('common.delete')}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.onSurfaceVariant} />
                </Pressable>
              </View>
            }
          />
        );
      })}

      {/* ---------------------------------------------------------- tags */}
      <SectionTitle theme={theme}>{tr(FEATURES['library.tags'].title)}</SectionTitle>
      <ChipsRow>
        <Button compact mode={!tagFilter ? 'contained' : 'outlined'} title={t('common.all')} onPress={() => setTagFilter(null)} />
        {tags.map(tag => (
          <Pressable
            key={tag.id}
            onPress={() => setTagFilter(tagFilter === tag.name ? null : tag.name)}
            onLongPress={() => setTagPrompt({ kind: 'rename', id: tag.id, name: tag.name })}
            style={[styles.tagChip, { borderColor: tag.color ?? theme.outline, backgroundColor: tagFilter === tag.name ? tag.color ?? theme.primary : 'transparent' }]}
          >
            <Text style={{ color: tagFilter === tag.name ? '#fff' : theme.onSurface, fontSize: 13 }}>{`#${tag.name} · ${num(tag.count)}`}</Text>
          </Pressable>
        ))}
        <Button compact icon="plus" title={t('plus.library.newTag')} onPress={() => setTagPrompt({ kind: 'new' })} testID="sard-new-tag" />
      </ChipsRow>
      <Muted theme={theme} style={styles.pad}>{t('plus.library.tagHelp')}</Muted>

      {/* -------------------------------------------------- smart filters */}
      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['library.smartFilters'].title)}</SectionTitle>
        {!filterGate.allowed ? <TierBadge tier={filterGate.requiredTier} small /> : null}
      </View>
      <ChipsRow>
        {filters.map(f => (
          <Pressable
            key={f.id}
            onPress={() => setActiveFilter(activeFilter?.id === f.id ? null : f)}
            onLongPress={() => smartFiltersStore.set(filters.filter(x => x.id !== f.id))}
            style={[styles.tagChip, { borderColor: theme.primary, backgroundColor: activeFilter?.id === f.id ? theme.primary : 'transparent' }]}
          >
            <Text style={{ color: activeFilter?.id === f.id ? theme.onPrimary : theme.onSurface, fontSize: 13 }}>{f.name}</Text>
          </Pressable>
        ))}
        <Button
          compact
          icon="filter-variant-plus"
          title={t('plus.library.newFilter')}
          testID="sard-new-filter"
          onPress={() => filterGate.gate(filters.length) && setFilterEditor(true)}
        />
      </ChipsRow>

      {/* -------------------------------------------- novels + bulk actions */}
      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{t('plus.library.novels', { n: num(visible.length) })}</SectionTitle>
        <Button compact icon="share-variant-outline" title={t('common.share')} onPress={share} testID="sard-share-list" />
      </View>
      {selected.size ? (
        <Card theme={theme} testID="sard-bulk-bar">
          <Text style={{ color: theme.onSurface, fontWeight: '700' }}>{t('plus.library.selected', { n: num(selected.size) })}</Text>
          <View style={styles.actionsRow}>
            <Button compact icon="tag-plus-outline" title={t('plus.library.bulkTag')} onPress={() => setTagPrompt({ kind: 'bulk' })} />
            <Button compact icon="list-status" title={t('plus.library.bulkStatus')} onPress={() => setStatusPick(true)} />
            <Button compact icon="playlist-plus" title={t('plus.library.queueAdd')} onPress={() => {
              let q = upNextStore.get();
              for (const id of selIds) q = queueAdd(q, id);
              setQueue(q);
              doneBulk(t('plus.library.queued', { n: num(selIds.length) }));
            }} />
            <Button compact icon="eye-off-outline" title={t('plus.library.bulkHide')} onPress={() => {
              setHidden(selIds, true);
              doneBulk(t('plus.library.hidden', { n: num(selIds.length) }));
            }} />
            <Button compact title={t('common.cancel')} onPress={() => setSelected(new Set())} />
          </View>
        </Card>
      ) : (
        <Muted theme={theme} style={styles.pad}>{t('plus.library.bulkHelp')}</Muted>
      )}
      {!novels.length ? <Empty theme={theme} icon="bookshelf" text={t('common.noNovels')} /> : null}
      {visible.map(n => {
        const meta = metas.get(n.id);
        const sel = selected.has(n.id);
        return (
          <Pressable
            key={n.id}
            onPress={() => (selected.size ? toggleSel(n.id) : setEditNovel(n))}
            onLongPress={() => toggleSel(n.id)}
            android_ripple={{ color: theme.rippleColor }}
            style={[styles.novelRow, sel && { backgroundColor: theme.secondaryContainer }]}
            testID={`sard-lib-novel-${n.id}`}
          >
            <MaterialCommunityIcons
              name={sel ? 'checkbox-marked' : ((meta?.status ? STATUS_LABELS[meta.status].icon : 'book-outline') as any)}
              size={22}
              color={sel ? theme.primary : theme.onSurfaceVariant}
            />
            <View style={styles.flex}>
              <Text style={[styles.novelName, { color: theme.onSurface }]} numberOfLines={1}>{n.name}</Text>
              <Text style={{ color: theme.onSurfaceVariant, fontSize: 12 }} numberOfLines={1}>
                {[
                  meta?.status ? tr(STATUS_LABELS[meta.status]) : null,
                  `${num(Math.round(progressOf(n) * 100))}٪`,
                  ...(meta?.tags ?? []).map(x => `#${x}`),
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {meta?.rating ? <Stars value={meta.rating} size={14} /> : null}
          </Pressable>
        );
      })}

      {/* -------------------------------------------------------- dialogs */}
      <NovelMetaDialog
        novel={editNovel}
        meta={editNovel ? metas.get(editNovel.id) : undefined}
        onDismiss={() => setEditNovel(null)}
        onSaved={() => {
          setEditNovel(null);
          reload();
        }}
      />
      <TextPromptDialog
        visible={!!tagPrompt}
        title={tagPrompt?.kind === 'rename' ? t('plus.library.renameTag') : tagPrompt?.kind === 'bulk' ? t('plus.library.bulkTag') : t('plus.library.newTag')}
        label={t('plus.library.tagName')}
        initial={tagPrompt?.kind === 'rename' ? tagPrompt.name : ''}
        help={tagPrompt?.kind === 'rename' ? t('plus.library.renameHelp') : undefined}
        testID="sard-tag-dialog"
        onDismiss={() => setTagPrompt(null)}
        onSubmit={async v => {
          const p = tagPrompt;
          setTagPrompt(null);
          if (!p) return;
          if (p.kind === 'rename') {
            if (!v.trim()) await deleteTag(p.id);
            else await renameTag(p.id, v);
          } else if (p.kind === 'bulk') {
            await tagNovels(v, selIds, true);
            doneBulk(t('plus.library.tagged', { n: num(selIds.length), tag: v }));
            return;
          } else {
            await createTag(v);
          }
          reload();
        }}
      />
      <ChoiceDialog
        visible={statusPick}
        title={t('plus.library.bulkStatus')}
        choices={[...READING_STATUSES.map(s => ({ value: s as string, label: tr(STATUS_LABELS[s]), icon: STATUS_LABELS[s].icon as any })), { value: 'none', label: t('plus.library.noStatus') }]}
        onDismiss={() => setStatusPick(false)}
        onPick={async v => {
          setStatusPick(false);
          await setNovelMeta(selIds, { status: v === 'none' ? null : (v as ReadingStatus) });
          doneBulk(t('plus.library.statusSet', { n: num(selIds.length) }));
        }}
      />
      <FilterEditorDialog
        visible={filterEditor}
        tags={tags.map(x => x.name)}
        onDismiss={() => setFilterEditor(false)}
        onSave={f => {
          smartFiltersStore.set([...smartFiltersStore.get(), f]);
          setFilterEditor(false);
          setActiveFilter(f);
        }}
      />
    </Screen>
  );
};

const NovelMetaDialog = ({
  novel,
  meta,
  onDismiss,
  onSaved,
}: {
  novel: LibraryNovel | null;
  meta?: NovelMeta;
  onDismiss: () => void;
  onSaved: () => void;
}) => {
  const theme = useTheme();
  const [status, setStatus] = useState<ReadingStatus | null>(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [tagText, setTagText] = useState('');
  useEffect(() => {
    if (!novel) return;
    setStatus(meta?.status ?? null);
    setRating(meta?.rating ?? 0);
    setNote(meta?.note ?? '');
    setTagText((meta?.tags ?? []).join('، '));
  }, [novel, meta]);
  if (!novel) return null;
  const save = async () => {
    await setNovelMeta([novel.id], { status, rating: rating || null, note: note.trim() || null });
    await setNovelTags(novel.id, tagText.split(/[,،\n]/).map(s => s.trim()).filter(Boolean));
    showToast(t('plus.common.saved'));
    onSaved();
  };
  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss} style={{ backgroundColor: theme.overlay3 }}>
        <Dialog.Title style={{ color: theme.onSurface }} numberOfLines={2}>{novel.name}</Dialog.Title>
        <Dialog.ScrollArea style={styles.dialogScroll}>
          <View style={styles.dialogBody}>
            <Text style={{ color: theme.onSurfaceVariant }}>{tr(FEATURES['library.readingStatus'].title)}</Text>
            <View style={styles.wrap}>
              {READING_STATUSES.map(s => (
                <Button key={s} compact mode={status === s ? 'contained' : 'outlined'} title={tr(STATUS_LABELS[s])} onPress={() => setStatus(status === s ? null : s)} />
              ))}
            </View>
            <Text style={{ color: theme.onSurfaceVariant }}>{tr(FEATURES['library.notesRating'].title)}</Text>
            <Stars value={rating} onChange={setRating} />
            <TextInput mode="outlined" label={t('plus.library.note')} value={note} onChangeText={setNote} multiline theme={{ colors: { ...theme } }} />
            <TextInput mode="outlined" label={t('plus.library.tagsField')} value={tagText} onChangeText={setTagText} theme={{ colors: { ...theme } }} testID="sard-meta-tags" />
            <View style={styles.wrap}>
              <Button compact icon="playlist-plus" title={t('plus.library.queueAdd')} onPress={() => {
                upNextStore.set(queueAdd(upNextStore.get(), novel.id));
                showToast(t('plus.library.queued', { n: num(1) }));
              }} />
              <Button compact icon="eye-off-outline" title={t('plus.library.hideOne')} onPress={() => {
                setHidden([novel.id], true);
                showToast(t('plus.library.hidden', { n: num(1) }));
                onSaved();
              }} />
            </View>
          </View>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button title={t('common.cancel')} onPress={onDismiss} />
          <Button testID="sard-meta-save" mode="contained" title={t('common.save')} onPress={save} />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const FilterEditorDialog = ({
  visible,
  tags,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  tags: string[];
  onDismiss: () => void;
  onSave: (f: SmartFilter) => void;
}) => {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [tagsAny, setTagsAny] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ReadingStatus[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (visible) {
      setName('');
      setTagsAny([]);
      setStatuses([]);
      setMinRating(0);
      setUnreadOnly(false);
      setDownloadedOnly(false);
      setText('');
    }
  }, [visible]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: theme.overlay3 }}>
        <Dialog.Title style={{ color: theme.onSurface }}>{t('plus.library.newFilter')}</Dialog.Title>
        <Dialog.ScrollArea style={styles.dialogScroll}>
          <View style={styles.dialogBody}>
            <TextInput mode="outlined" label={t('plus.library.filterName')} value={name} onChangeText={setName} theme={{ colors: { ...theme } }} testID="sard-filter-name" />
            {tags.length ? <Text style={{ color: theme.onSurfaceVariant }}>{t('plus.library.anyTag')}</Text> : null}
            <View style={styles.wrap}>
              {tags.map(tag => (
                <Button key={tag} compact mode={tagsAny.includes(tag) ? 'contained' : 'outlined'} title={`#${tag}`} onPress={() => setTagsAny(toggle(tagsAny, tag))} />
              ))}
            </View>
            <Text style={{ color: theme.onSurfaceVariant }}>{tr(FEATURES['library.readingStatus'].title)}</Text>
            <View style={styles.wrap}>
              {READING_STATUSES.map(s => (
                <Button key={s} compact mode={statuses.includes(s) ? 'contained' : 'outlined'} title={tr(STATUS_LABELS[s])} onPress={() => setStatuses(toggle(statuses, s))} />
              ))}
            </View>
            <Text style={{ color: theme.onSurfaceVariant }}>{t('plus.library.minRating')}</Text>
            <Stars value={minRating} onChange={setMinRating} />
            <View style={styles.wrap}>
              <Button compact mode={unreadOnly ? 'contained' : 'outlined'} title={t('plus.library.unreadOnly')} onPress={() => setUnreadOnly(!unreadOnly)} />
              <Button compact mode={downloadedOnly ? 'contained' : 'outlined'} title={t('plus.library.downloadedOnly')} onPress={() => setDownloadedOnly(!downloadedOnly)} />
            </View>
            <TextInput mode="outlined" label={t('plus.library.textContains')} value={text} onChangeText={setText} theme={{ colors: { ...theme } }} />
          </View>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button title={t('common.cancel')} onPress={onDismiss} />
          <Button
            testID="sard-filter-save"
            mode="contained"
            title={t('common.save')}
            onPress={() =>
              onSave({
                id: `f${Date.now().toString(36)}`,
                name: name.trim() || t('plus.library.filterDefault'),
                tagsAny: tagsAny.length ? tagsAny : undefined,
                statuses: statuses.length ? statuses : undefined,
                minRating: minRating || undefined,
                unreadOnly: unreadOnly || undefined,
                downloadedOnly: downloadedOnly || undefined,
                text: text.trim() || undefined,
              })
            }
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default LibraryToolsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
  tagChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  novelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  novelName: { fontSize: 15 },
  stars: { flexDirection: 'row', gap: 2 },
  dialogScroll: { maxHeight: 460, paddingHorizontal: 0 },
  dialogBody: { paddingHorizontal: 24, gap: 10, paddingVertical: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
