/**
 * Librarian «الرفوف الذكية» (route `SardSmartShelves`): smart shelves,
 * duplicates across sources, rules, and one-tap organize into categories.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar as PaperAppbar } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { Appbar, Button, ConfirmationDialog, SafeAreaView } from '@components';
import { showToast } from '@utils/showToast';
import { AGENT_STRINGS } from '../../ai/strings';
import { Card, LoadingRow, Muted, Notice, Pill, Stepper } from '../../ai/components/ui';
import NovelRow from '../components/NovelRow';
import type { DuplicateGroup } from '../dedupe';
import {
  loadDuplicates,
  loadSmartShelves,
  organizeLibraryIntoCategories,
  removeDuplicateCopies,
} from '../librarian';
import type { LibraryNovel } from '../library';
import { openNovelScreen } from '../navigation';
import { useShelfRules } from '../settings';
import { SHELF_ORDER, type ShelfId, type ShelfItem } from '../shelves';

const L = AGENT_STRINGS.librarian;
type Tab = ShelfId | 'duplicates';

const SmartShelvesScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { rules, setShelfRules } = useShelfRules();
  const [tab, setTab] = useState<Tab>('near_finish');
  const [shelves, setShelves] = useState<Record<ShelfId, ShelfItem[]>>();
  const [dupes, setDupes] = useState<DuplicateGroup<LibraryNovel>[]>();
  const [showRules, setShowRules] = useState(false);
  const [organizeVisible, setOrganizeVisible] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [dedupeTarget, setDedupeTarget] = useState<DuplicateGroup<LibraryNovel>>();

  const load = useCallback(() => {
    loadSmartShelves().then(setShelves).catch(() => {});
    loadDuplicates().then(setDupes).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // recompute when rules change
  const rulesKey = JSON.stringify(rules);
  React.useEffect(() => {
    loadSmartShelves().then(setShelves).catch(() => {});
  }, [rulesKey]);

  const items = useMemo(
    () => (tab === 'duplicates' || !shelves ? [] : shelves[tab]),
    [tab, shelves],
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar title={L.shelvesTitle} handleGoBack={navigation.goBack} theme={theme} mode="small">
        <PaperAppbar.Action
          icon="tune-variant"
          iconColor={theme.onSurface}
          onPress={() => setShowRules(v => !v)}
        />
        <PaperAppbar.Action
          icon="folder-star-outline"
          iconColor={theme.onSurface}
          onPress={() => setOrganizeVisible(true)}
        />
      </Appbar>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {SHELF_ORDER.map(s => (
            <Pill
              key={s}
              theme={theme}
              label={`${L.shelves[s]}${shelves ? ` (${shelves[s].length})` : ''}`}
              active={tab === s}
              onPress={() => setTab(s)}
            />
          ))}
          <Pill
            theme={theme}
            icon="content-duplicate"
            label={`${L.duplicates}${dupes ? ` (${dupes.length})` : ''}`}
            active={tab === 'duplicates'}
            onPress={() => setTab('duplicates')}
          />
        </ScrollView>
      </View>

      {showRules ? (
        <Card theme={theme}>
          <Muted theme={theme}>{L.rules}</Muted>
          <Stepper
            theme={theme}
            label={L.pausedDays}
            value={rules.pausedDays}
            min={3}
            max={180}
            onChange={v => setShelfRules({ pausedDays: v })}
          />
          <Stepper
            theme={theme}
            label={L.nearFinishRemaining}
            value={rules.nearFinishRemaining}
            min={1}
            max={100}
            onChange={v => setShelfRules({ nearFinishRemaining: v })}
          />
          <Stepper
            theme={theme}
            label={L.bingeMin}
            value={rules.bingeMinUnreadDownloaded}
            min={3}
            max={200}
            onChange={v => setShelfRules({ bingeMinUnreadDownloaded: v })}
          />
        </Card>
      ) : null}

      {tab === 'duplicates' ? (
        !dupes ? (
          <LoadingRow theme={theme} label="…" />
        ) : !dupes.length ? (
          <Notice theme={theme} icon="check-circle-outline" title={L.noDuplicates} tone="success" />
        ) : (
          <FlatList
            data={dupes}
            keyExtractor={g => `${g.key}-${g.keep.id}`}
            ListHeaderComponent={<Muted theme={theme} style={styles.header}>{L.duplicatesDesc}</Muted>}
            renderItem={({ item: g }) => (
              <Card theme={theme} style={styles.groupCard}>
                {g.novels.map(n => (
                  <NovelRow
                    key={n.id}
                    theme={theme}
                    title={n.name}
                    subtitle={`${n.pluginId} · ${Math.max(0, (n.totalChapters ?? 0) - (n.chaptersUnread ?? 0))}/${n.totalChapters ?? 0}`}
                    caption={n.id === g.keep.id ? L.keepSuggestion : undefined}
                    cover={n.cover}
                    onPress={() => openNovelScreen(navigation, n)}
                  />
                ))}
                <View style={styles.groupActions}>
                  <Button
                    mode="text"
                    compact
                    textColor={theme.error}
                    title={L.removeOthers}
                    onPress={() => setDedupeTarget(g)}
                  />
                </View>
              </Card>
            )}
          />
        )
      ) : !shelves ? (
        <LoadingRow theme={theme} label="…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.novel.id)}
          ListEmptyComponent={<Notice theme={theme} title={L.shelfEmpty} />}
          ListHeaderComponent={
            items.length ? <Muted theme={theme} style={styles.header}>{L.total(items.length)}</Muted> : null
          }
          renderItem={({ item }) => (
            <NovelRow
              theme={theme}
              title={item.novel.name}
              subtitle={item.reason}
              cover={item.novel.cover}
              onPress={() => openNovelScreen(navigation, item.novel)}
            />
          )}
        />
      )}

      <ConfirmationDialog
        visible={organizeVisible}
        title={L.organize}
        message={L.organizeConfirm}
        confirmLabel={AGENT_STRINGS.chat.confirmAction}
        cancelLabel="إلغاء"
        onConfirm={async () => {
          if (organizing) return;
          setOrganizing(true);
          try {
            const n = await organizeLibraryIntoCategories();
            showToast(L.organizeDone(n));
          } finally {
            setOrganizing(false);
            setOrganizeVisible(false);
          }
        }}
        onDismiss={() => setOrganizeVisible(false)}
      />
      <ConfirmationDialog
        visible={!!dedupeTarget}
        title={L.removeOthers}
        message={dedupeTarget ? L.removeOthersConfirm(dedupeTarget.novels.length - 1) : ''}
        confirmLabel={AGENT_STRINGS.chat.confirmAction}
        cancelLabel="إلغاء"
        confirmTone="danger"
        onConfirm={async () => {
          const g = dedupeTarget;
          setDedupeTarget(undefined);
          if (!g) return;
          await removeDuplicateCopies(g, g.keep.id);
          load();
        }}
        onDismiss={() => setDedupeTarget(undefined)}
      />
    </SafeAreaView>
  );
};

export default SmartShelvesScreen;

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingVertical: 8 },
  header: { marginHorizontal: 16, marginVertical: 6 },
  groupCard: { paddingHorizontal: 0, paddingVertical: 6 },
  groupActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 },
});
