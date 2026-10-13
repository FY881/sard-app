import React, { useCallback, useMemo, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import {
  Appbar,
  ConfirmationDialog,
  EmptyView,
  SafeAreaView,
  SearchbarV2,
  SelectableChip,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { getChapter } from '@database/queries/ChapterQueries';

import { SARD_READER_STRINGS as S } from '../strings';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../settings';
import {
  deleteHighlights,
  listHighlights,
  updateHighlight,
  type HighlightQuery,
  type SardHighlightRow,
} from '../db';
import { requestHighlightJump } from '../jump';
import { groupHighlightsByNovel, highlightsToText } from '../highlightsLogic';
import HighlightEditorDialog from '../components/HighlightEditorDialog';
import QuoteCardModal, { type QuoteCardData } from '../components/QuoteCardModal';

type Params = { novelId?: number } | undefined;

/**
 * «التظليلات والملاحظات»: every highlight and note, searchable and
 * filterable, grouped by novel. Route name: `SardHighlights`
 * (params `{ novelId?: number }`), see docs/tracks/reader.md.
 */
const HighlightsScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const scopedNovelId = (route.params as Params)?.novelId;

  const [scopeNovel, setScopeNovel] = useState<boolean>(!!scopedNovelId);
  const [search, setSearch] = useState('');
  const [color, setColor] = useState<HighlightColor | undefined>();
  const [onlyNotes, setOnlyNotes] = useState(false);
  const [sort, setSort] = useState<NonNullable<HighlightQuery['sort']>>('newest');
  const [rows, setRows] = useState<SardHighlightRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<SardHighlightRow | null>(null);
  const [quote, setQuote] = useState<QuoteCardData | null>(null);

  const query = useMemo<HighlightQuery>(
    () => ({
      novelId: scopeNovel ? scopedNovelId : undefined,
      color,
      onlyNotes,
      search,
      sort,
    }),
    [color, onlyNotes, scopeNovel, scopedNovelId, search, sort],
  );

  const reload = useCallback(() => {
    let cancelled = false;
    listHighlights(query)
      .then(r => !cancelled && setRows(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query]);
  useFocusEffect(reload);

  const selecting = selected.size > 0;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selected.size) {
          setSelected(new Set());
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [selected.size]),
  );

  const sections = useMemo(() => groupHighlightsByNovel(rows), [rows]);
  const selectedRows = useMemo(() => rows.filter(r => selected.has(r.id)), [rows, selected]);

  const toggleSelect = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const open = async (h: SardHighlightRow) => {
    const chapter = await getChapter(h.chapterId).catch(() => undefined);
    if (!chapter) {
      showToast(S.chapterMissing);
      return;
    }
    requestHighlightJump(h.chapterId, h.id);
    navigation.navigate('ReaderStack', {
      screen: 'Chapter',
      params: {
        novel: {
          id: h.novelId,
          path: h.novelPath,
          name: h.novelName,
          pluginId: h.pluginId,
          cover: h.novelCover,
        },
        chapter,
      },
    });
  };

  const exportText = () => {
    const list = selecting ? selectedRows : rows;
    if (list.length) void Share.share({ message: highlightsToText(list) });
  };

  const isDark = !!theme.isDark;

  const renderItem = ({ item }: { item: SardHighlightRow }) => {
    const c = HIGHLIGHT_COLORS[item.color as HighlightColor] ?? HIGHLIGHT_COLORS.yellow;
    const isSel = selected.has(item.id);
    return (
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        onPress={() => (selecting ? toggleSelect(item.id) : open(item))}
        onLongPress={() => toggleSelect(item.id)}
        style={[styles.item, isSel && { backgroundColor: theme.surfaceVariant }]}
      >
        <View style={[styles.colorBar, { backgroundColor: isDark ? c.dark : c.light }]} />
        <View style={styles.itemBody}>
          <Text numberOfLines={6} style={[styles.quote, { color: theme.onSurface }]}>
            {item.text}
          </Text>
          {item.note ? (
            <View style={styles.noteRow}>
              <MaterialCommunityIcons name="note-text-outline" size={16} color={theme.primary} />
              <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>{item.note}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={[styles.meta, { color: theme.onSurfaceVariant }]}>
              {item.chapterName ?? ''} · {new Date(item.createdAt).toLocaleDateString('ar-EG')}
            </Text>
            {item.orphaned ? (
              <MaterialCommunityIcons name="link-variant-off" size={14} color={theme.error} />
            ) : null}
          </View>
        </View>
        {selecting ? (
          <MaterialCommunityIcons
            name={isSel ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
            size={22}
            color={isSel ? theme.primary : theme.onSurfaceVariant}
          />
        ) : (
          <View style={styles.itemActions}>
            <Pressable hitSlop={8} onPress={() => setEditing(item)} accessibilityLabel={S.editNote}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.onSurfaceVariant} />
            </Pressable>
            <Pressable
              hitSlop={8}
              accessibilityLabel={S.quoteCard}
              onPress={() =>
                setQuote({
                  text: item.text,
                  note: item.note,
                  novelName: item.novelName,
                  chapterName: item.chapterName,
                })
              }
            >
              <MaterialCommunityIcons
                name="share-variant-outline"
                size={20}
                color={theme.onSurfaceVariant}
              />
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={selecting ? S.selectedCount(selected.size) : S.highlights}
        handleGoBack={selecting ? () => setSelected(new Set()) : navigation.goBack}
        theme={theme}
      />
      <SearchbarV2
        searchText={search}
        placeholder={S.searchHighlights}
        onChangeText={setSearch}
        leftIcon="magnify"
        clearSearchbar={() => setSearch('')}
        theme={theme}
        rightIcons={
          selecting
            ? [
                {
                  iconName: 'content-copy',
                  accessibilityLabel: S.copy,
                  onPress: () => {
                    void Clipboard.setStringAsync(highlightsToText(selectedRows)).then(() =>
                      showToast(S.copied),
                    );
                  },
                },
                { iconName: 'export-variant', accessibilityLabel: S.exportHighlights, onPress: exportText },
                { iconName: 'delete-outline', accessibilityLabel: S.delete, onPress: () => setConfirmDelete(true) },
              ]
            : [{ iconName: 'export-variant', accessibilityLabel: S.exportHighlights, onPress: exportText }]
        }
      />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {scopedNovelId ? (
            <SelectableChip
              label={scopeNovel ? S.thisNovel : S.allNovels}
              selected={scopeNovel}
              theme={theme}
              onPress={() => setScopeNovel(v => !v)}
            />
          ) : null}
          <SelectableChip
            label={S.filterAll}
            selected={!color && !onlyNotes}
            theme={theme}
            onPress={() => {
              setColor(undefined);
              setOnlyNotes(false);
            }}
          />
          <SelectableChip
            label={S.filterNotes}
            selected={onlyNotes}
            theme={theme}
            onPress={() => setOnlyNotes(v => !v)}
          />
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map(k => (
            <SelectableChip
              key={k}
              label={HIGHLIGHT_COLORS[k].label}
              selected={color === k}
              theme={theme}
              onPress={() => setColor(color === k ? undefined : k)}
            />
          ))}
          {(['newest', 'oldest', 'position'] as const).map(k => (
            <SelectableChip
              key={k}
              label={k === 'newest' ? S.sortNewest : k === 'oldest' ? S.sortOldest : S.sortPosition}
              selected={sort === k}
              theme={theme}
              onPress={() => setSort(k)}
            />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.surface }]}>
            <Text numberOfLines={1} style={[styles.sectionTitle, { color: theme.primary }]}>
              {section.title}
            </Text>
            <Text style={{ color: theme.onSurfaceVariant }}>
              {S.highlightCount(section.data.length)}
            </Text>
          </View>
        )}
        contentContainerStyle={sections.length ? styles.listContent : styles.flexGrow}
        ListEmptyComponent={
          <EmptyView
            icon="(◕‿◕)"
            description={
              search || color || onlyNotes ? S.noResults : `${S.noHighlights}\n${S.noHighlightsHint}`
            }
            theme={theme}
          />
        }
      />
      <ConfirmationDialog
        visible={confirmDelete}
        title={S.deleteConfirmMany(selected.size)}
        confirmLabel={S.delete}
        cancelLabel={S.cancel}
        confirmTone="danger"
        onConfirm={async () => {
          await deleteHighlights([...selected]);
          setSelected(new Set());
          setConfirmDelete(false);
          reload();
        }}
        onDismiss={() => setConfirmDelete(false)}
      />
      <HighlightEditorDialog
        visible={!!editing}
        draft={
          editing
            ? {
                id: editing.id,
                text: editing.text,
                note: editing.note,
                color: editing.color as HighlightColor,
                orphaned: editing.orphaned,
              }
            : null
        }
        onDismiss={() => setEditing(null)}
        onSave={async ({ note, color: c }) => {
          if (!editing) return;
          await updateHighlight(editing.id, { note, color: c });
          setEditing(null);
          reload();
        }}
        onDelete={async () => {
          if (!editing) return;
          await deleteHighlights([editing.id]);
          setEditing(null);
          reload();
        }}
        onCopy={() => {
          if (editing) {
            void Clipboard.setStringAsync(editing.text).then(() => showToast(S.copied));
          }
        }}
        onShare={() => {
          if (!editing) return;
          setQuote({
            text: editing.text,
            note: editing.note,
            novelName: editing.novelName,
            chapterName: editing.chapterName,
          });
          setEditing(null);
        }}
      />
      <QuoteCardModal visible={!!quote} data={quote} onDismiss={() => setQuote(null)} />
    </SafeAreaView>
  );
};

export default HighlightsScreen;

const styles = StyleSheet.create({
  filters: { gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  listContent: { paddingBottom: 32 },
  flexGrow: { flexGrow: 1 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', marginEnd: 8 },
  item: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  colorBar: { alignSelf: 'stretch', borderRadius: 2, width: 4 },
  itemBody: { flex: 1, gap: 6 },
  quote: { fontSize: 15, lineHeight: 24 },
  noteRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6 },
  note: { flex: 1, fontSize: 13, lineHeight: 20 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  meta: { flex: 1, fontSize: 12 },
  itemActions: { gap: 14, paddingTop: 2 },
});
