/** «العلامات»: every bookmark with its note; open the chapter at that spot, edit the note, delete. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import dayjs from 'dayjs';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { num, t } from '../../i18n';
import { Card, ChipsRow, Empty, Muted, Screen } from '../ui';
import { TextPromptDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { deleteBookmark, listBookmarks, updateBookmarkNote, type SardBookmarkRow } from '../db';
import { requestProgressJump } from '../readerSession';
import { Button } from '@components';

export const openBookmark = async (navigation: any, b: { novelId: number; chapterId: number; progress: number }) => {
  const chapter = await getChapter(b.chapterId).catch(() => undefined);
  const novel = getNovelById(b.novelId);
  if (!chapter || !novel) {
    showToast(t('plus.bookmarks.missing'));
    return;
  }
  requestProgressJump(b.chapterId, b.progress);
  navigation.navigate('ReaderStack', { screen: 'Chapter', params: { novel, chapter } });
};

const BookmarksScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { data = [], reload } = useAsync(() => listBookmarks(), []);
  const [novelFilter, setNovelFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<SardBookmarkRow | null>(null);

  const novels = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of data) m.set(b.novelId, b.novelName ?? `#${b.novelId}`);
    return [...m.entries()];
  }, [data]);
  const list = novelFilter ? data.filter(b => b.novelId === novelFilter) : data;

  return (
    <Screen title={t('plus.bookmarks.title')} testID="sard-bookmarks">
      {novels.length > 1 ? (
        <ChipsRow>
          <Button compact mode={novelFilter === null ? 'contained' : 'outlined'} title={t('common.all')} onPress={() => setNovelFilter(null)} />
          {novels.map(([id, name]) => (
            <Button key={id} compact mode={novelFilter === id ? 'contained' : 'outlined'} title={name} onPress={() => setNovelFilter(id)} />
          ))}
        </ChipsRow>
      ) : null}
      {!list.length ? <Empty theme={theme} icon="bookmark-outline" text={t('plus.bookmarks.empty')} /> : null}
      {list.map(b => (
        <Card key={b.id} theme={theme} onPress={() => openBookmark(navigation, b)}>
          <View style={styles.head}>
            <MaterialCommunityIcons name="bookmark" size={18} color={theme.primary} />
            <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={1}>
              {b.novelName}
            </Text>
            <Text style={{ color: theme.primary, fontSize: 12 }}>{`${num(Math.round(b.progress * 100))}٪`}</Text>
          </View>
          <Muted theme={theme} numberOfLines={1}>
            {`${b.chapterName ?? ''} · ${dayjs(b.createdAt).format('LL')}`}
          </Muted>
          {b.excerpt ? (
            <Text style={[styles.excerpt, { color: theme.onSurfaceVariant, borderColor: theme.outlineVariant }]} numberOfLines={3}>
              {b.excerpt}
            </Text>
          ) : null}
          {b.note ? <Text style={[styles.note, { color: theme.onSurface }]}>{b.note}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={() => setEditing(b)} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: theme.primary }}>{b.note ? t('plus.bookmarks.editNote') : t('plus.bookmarks.addNote')}</Text>
            </Pressable>
            <Pressable onPress={() => deleteBookmark(b.id).then(reload)} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: theme.error }}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      <TextPromptDialog
        visible={!!editing}
        title={t('plus.bookmarks.editNote')}
        initial={editing?.note ?? ''}
        multiline
        onDismiss={() => setEditing(null)}
        onSubmit={async v => {
          if (editing) await updateBookmarkNote(editing.id, v);
          setEditing(null);
          reload();
        }}
      />
    </Screen>
  );
};

export default BookmarksScreen;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700' },
  excerpt: { fontSize: 13, lineHeight: 21, marginTop: 8, borderStartWidth: 3, paddingStart: 8 },
  note: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 10 },
});
