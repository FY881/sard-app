import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { Dialog, SelectableChip } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { SARD_READER_STRINGS as S } from '../strings';
import { isMostlyArabic } from '../arabic';
import { buildQuoteShareText, quoteFontSize, truncateQuote } from '../quoteCard';

export interface QuoteCardData {
  text: string;
  novelName?: string | null;
  chapterName?: string | null;
  author?: string | null;
  note?: string | null;
}

interface Props {
  visible: boolean;
  data: QuoteCardData | null;
  onDismiss: () => void;
}

export const QUOTE_CARD_STYLES = {
  paper: { bg: '#F7F1E3', fg: '#3B2F2F', accent: '#A0522D' },
  night: { bg: '#1E1E2A', fg: '#ECE6D6', accent: '#C9A86A' },
  olive: { bg: '#4F5D34', fg: '#F4F1E6', accent: '#E3D59B' },
  rose: { bg: '#F6DADA', fg: '#5A2333', accent: '#B0485F' },
  ink: { bg: '#0F1B2D', fg: '#F2E8CF', accent: '#7FB3D5' },
} as const;
type CardStyle = keyof typeof QUOTE_CARD_STYLES;

const CARD_FONTS = [
  { fontFamily: 'amiri', label: 'أميري' },
  { fontFamily: 'noto-naskh-arabic', label: 'نوتو نسخ' },
  { fontFamily: 'scheherazade-new', label: 'شهرزاد' },
  { fontFamily: 'reem-kufi', label: 'ريم كوفي' },
  { fontFamily: 'ibm-plex-sans-arabic', label: 'Plex' },
  { fontFamily: 'cairo', label: 'القاهرة' },
];

/**
 * Quote card: renders the passage on a styled square card, captured with
 * react-native-view-shot and shared as a PNG through expo-sharing. Falls back
 * to sharing plain text.
 */
const QuoteCardModal: React.FC<Props> = ({ visible, data, onDismiss }) => {
  const theme = useTheme();
  const cardRef = useRef<View>(null);
  const [style, setStyle] = useState<CardStyle>('paper');
  const [font, setFont] = useState('amiri');
  const [busy, setBusy] = useState(false);

  const text = useMemo(() => truncateQuote(data?.text ?? ''), [data?.text]);
  const rtl = isMostlyArabic(text);
  const colors = QUOTE_CARD_STYLES[style];
  const size = quoteFontSize(text.length);

  const shareText = async () => {
    if (!data) return;
    await Share.share({ message: buildQuoteShareText(data) });
  };

  const shareImage = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        result: 'tmpfile',
      });
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: S.quoteCard });
    } catch {
      showToast(S.shareFailed);
      await shareText();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>{S.quoteCard}</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View
            ref={cardRef}
            collapsable={false}
            style={[styles.card, { backgroundColor: colors.bg }]}
          >
            <Text style={[styles.quoteMark, { color: colors.accent }]}>
              {rtl ? '”' : '“'}
            </Text>
            <Text
              style={[
                styles.quote,
                {
                  color: colors.fg,
                  fontFamily: font,
                  fontSize: size,
                  lineHeight: size * 1.75,
                  writingDirection: rtl ? 'rtl' : 'ltr',
                },
              ]}
            >
              {text}
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.accent }]} />
            {data?.novelName ? (
              <Text
                numberOfLines={2}
                style={[styles.source, { color: colors.fg, fontFamily: font }]}
              >
                {data.novelName}
              </Text>
            ) : null}
            {data?.chapterName ? (
              <Text numberOfLines={1} style={[styles.chapter, { color: colors.fg }]}>
                {data.chapterName}
              </Text>
            ) : null}
            <Text style={[styles.footer, { color: colors.accent }]}>{S.quoteFooter}</Text>
          </View>

          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>{S.cardStyle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(Object.keys(QUOTE_CARD_STYLES) as CardStyle[]).map(k => (
              <SelectableChip
                key={k}
                label={S.cardStyles[k]}
                selected={style === k}
                theme={theme}
                onPress={() => setStyle(k)}
              />
            ))}
          </ScrollView>
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>{S.cardFont}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {CARD_FONTS.map(f => (
              <SelectableChip
                key={f.fontFamily}
                label={f.label}
                selected={font === f.fontFamily}
                theme={theme}
                customFontFamily={f.fontFamily}
                onPress={() => setFont(f.fontFamily)}
              />
            ))}
          </ScrollView>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>{S.cancel}</Dialog.Action>
        <Dialog.Action onPress={shareText}>{S.shareText}</Dialog.Action>
        <Dialog.Action onPress={shareImage} loading={busy} disabled={busy}>
          {S.shareImage}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default QuoteCardModal;

const styles = StyleSheet.create({
  scroll: {
    paddingVertical: 12,
  },
  card: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    width: '100%',
  },
  quoteMark: {
    fontFamily: 'amiri',
    fontSize: 54,
    lineHeight: 54,
    marginBottom: -6,
  },
  quote: {
    flexShrink: 1,
    textAlign: 'center',
  },
  divider: {
    borderRadius: 1,
    height: 2,
    marginBottom: 10,
    marginTop: 16,
    opacity: 0.8,
    width: 48,
  },
  source: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  chapter: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.75,
    textAlign: 'center',
  },
  footer: {
    bottom: 12,
    fontSize: 11,
    position: 'absolute',
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    marginTop: 14,
  },
});
