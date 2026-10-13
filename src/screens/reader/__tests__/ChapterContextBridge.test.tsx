/**
 * Regression guard for Sard 1.1-r13: the reader settings sheet is a gorhom
 * BottomSheetModal, which renders in the root BottomSheetModalProvider portal,
 * outside ChapterContextProvider. The «سَرد+» tab then read the empty default
 * context and crashed with "Cannot read property 'id' of undefined".
 * ChapterContextBridge re-provides the value inside the portal.
 */
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('../hooks/useChapter', () => ({
  __esModule: true,
  default: () => ({ hidden: true, chapterContext: {} }),
}));

import { ChapterContextBridge, useChapterContext } from '../ChapterContext';

const Probe = () => {
  const { novel, chapter } = useChapterContext() as any;
  return <Text>{`${novel?.id ?? 'none'}:${chapter?.id ?? 'none'}`}</Text>;
};

describe('ChapterContextBridge', () => {
  it('a consumer outside any provider sees the empty default (the portal case)', () => {
    const { getByText } = render(<Probe />);
    expect(getByText('none:none')).toBeTruthy();
  });

  it('carries the chapter context across a portal boundary', () => {
    const value = { novel: { id: 7 }, chapter: { id: 42 } } as any;
    const { getByText } = render(
      <ChapterContextBridge value={value}>
        <Probe />
      </ChapterContextBridge>,
    );
    expect(getByText('7:42')).toBeTruthy();
  });
});
