import React, { useMemo } from 'react';
import { Portal } from 'react-native-paper';
import { StatusBar } from 'react-native';

import { NovelInfo } from '@database/types';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { useBoolean } from '@hooks/index';
import ExportNovelDialog from '../../../sard/export/components/ExportNovelDialog';

interface ExportNovelAsEpubButtonProps {
  novel?: NovelInfo;
  renderIcon: (onPress: () => void) => React.ReactNode;
}

/**
 * Sard: the appbar export action now opens the unified PDF/EPUB export
 * dialog (whole novel, downloaded chapters or a chapter range, Arabic RTL
 * typesetting, background task + notification). The legacy EPUB-only
 * ExportEpubModal is kept in the tree for upstream merges but unused.
 */
const ExportNovelAsEpubButton: React.FC<ExportNovelAsEpubButtonProps> = ({
  novel,
  renderIcon,
}) => {
  const theme = useTheme();

  const {
    value: isModalVisible,
    setTrue: showModal,
    setFalse: hideModal,
  } = useBoolean(false);

  const readerSettings = useChapterReaderSettings();
  const appThemeStylesheet = useMemo(() => {
    if (!novel) {
      return '';
    }

    return `
      html {
        scroll-behavior: smooth;
        overflow-x: hidden;
        padding-top: ${StatusBar.currentHeight ?? 0}px;
        word-wrap: break-word;
      }
      body {
        padding-left: ${readerSettings.padding}%;
        padding-right: ${readerSettings.padding}%;
        padding-bottom: 40px;
        font-size: ${readerSettings.textSize}px;
        color: ${readerSettings.textColor};
        text-align: ${readerSettings.textAlign};
        line-height: ${readerSettings.lineHeight};
        font-family: "${readerSettings.fontFamily}";
        background-color: ${readerSettings.theme};
      }
      hr {
        margin-top: 20px;
        margin-bottom: 20px;
      }
      a {
        color: ${theme.primary};
      }
      img {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
      }`;
  }, [novel, readerSettings, theme.primary]);

  const customStylesheet = useMemo(() => {
    if (!novel) {
      return '';
    }

    return readerSettings.customCSS
      .replace(RegExp(`#sourceId-${novel.pluginId}\\s*\\{`, 'g'), 'body {')
      .replace(RegExp(`#sourceId-${novel.pluginId}[^.#A-Z]*`, 'gi'), '');
  }, [novel, readerSettings.customCSS]);

  return (
    <>
      {renderIcon(showModal)}
      <Portal>
        {isModalVisible && novel ? (
          <ExportNovelDialog
            visible
            novel={novel}
            onDismiss={hideModal}
            readerThemeCss={appThemeStylesheet + customStylesheet}
          />
        ) : null}
      </Portal>
    </>
  );
};

export default ExportNovelAsEpubButton;
