import React from 'react';

import { Dialog, RadioButton } from '@components';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';

import {
  allReaderFonts,
  findArabicFont,
} from '../../../../sard/reader/fonts';
import { getSardReaderSettings } from '../../../../sard/reader/settings';
import { getString } from '@i18n/translations';

interface FontPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  currentFont: string;
}

const FontPickerModal: React.FC<FontPickerModalProps> = ({
  currentFont,
  onDismiss,
  visible,
}) => {
  const theme = useTheme();
  const { setChapterReaderSettings } = useChapterReaderSettings();

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        {getString('readerScreen.bottomSheet.fontStyle')}
      </Dialog.Title>
      <Dialog.List>
        {allReaderFonts.map(item => (
          <RadioButton
            key={item.fontFamily}
            status={currentFont === item.fontFamily}
            onPress={() => {
              const arabic = findArabicFont(item.fontFamily);
              setChapterReaderSettings(
                arabic?.lineHeight && getSardReaderSettings().autoLineHeight
                  ? {
                      fontFamily: item.fontFamily,
                      lineHeight: arabic.lineHeight,
                    }
                  : { fontFamily: item.fontFamily },
              );
            }}
            label={item.name}
            labelStyle={{ fontFamily: item.fontFamily }}
            theme={theme}
          />
        ))}
      </Dialog.List>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>
          {getString('common.ok')}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default FontPickerModal;
