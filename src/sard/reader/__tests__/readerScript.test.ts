/**
 * @jest-environment jsdom
 *
 * Runs the injected WebView script against a minimal stand-in for LNReader's
 * core.js (`reader` + `van`) to check tashkeel transforms, direction and the
 * highlight anchoring / re-anchoring logic.
 */
import { SARD_READER_SCRIPT } from '../webview/sardReaderScript';
import { TASHKEEL_CHARS } from '../arabic';
import { TASHKEEL_NO_SHADDA } from '../webview/buildDocumentParts';
import { defaultSardReaderSettings, HIGHLIGHT_COLORS } from '../settings';

jest.mock('react-native-mmkv', () => ({ useMMKVObject: () => [undefined, jest.fn()] }), {
  virtual: true,
});
jest.mock('@utils/mmkv/mmkv', () => ({ getMMKVObject: () => undefined, setMMKVObject: jest.fn() }), {
  virtual: true,
});

type AnyWin = Window & Record<string, any>;
const w = window as unknown as AnyWin;

/** Minimal reactive `van` + `reader` mirroring what core.js exposes. */
const setupReader = (html: string, settings = {}) => {
  document.documentElement.setAttribute('dir', 'ltr');
  document.head.innerHTML = '';
  document.body.innerHTML = `<div id="LNReader-chapter">${html}</div><div id="reader-ui"></div>`;
  const derives: (() => void)[] = [];
  const state = <T,>(v: T) => {
    let val = v;
    return {
      get val() {
        return val;
      },
      set val(n: T) {
        if (n !== val) {
          val = n;
          derives.forEach(d => d());
        }
      },
    };
  };
  w.van = {
    derive: (fn: () => void) => {
      derives.push(fn);
      fn();
    },
  };
  const posts: any[] = [];
  const chapterElement = document.getElementById('LNReader-chapter') as HTMLElement;
  w.reader = {
    chapterElement,
    rawHTML: chapterElement.innerHTML,
    hidden: state(true),
    readerSettings: state({ theme: '#ffffff', textSize: 16, lineHeight: 1.5, textAlign: 'justify', fontFamily: 'amiri' }),
    generalSettings: state({ autoScroll: false, pageReader: false }),
    post: (o: any) => posts.push(o),
    refresh: jest.fn(),
    layoutWidth: 400,
  };
  // LNReader's text-options deriver: writes rawHTML back into the chapter.
  let applied = w.reader.rawHTML;
  w.van.derive(() => {
    void w.reader.generalSettings.val;
    if (w.reader.rawHTML !== applied) {
      chapterElement.innerHTML = w.reader.rawHTML;
      applied = w.reader.rawHTML;
    }
  });
  w.__SARD_INIT__ = {
    settings: { ...defaultSardReaderSettings, ...settings },
    sourceDir: 'ltr',
    tashkeelChars: TASHKEEL_CHARS,
    tashkeelCharsNoShadda: TASHKEEL_NO_SHADDA,
    fontFaces: {},
    highlightColors: HIGHLIGHT_COLORS,
    highlights: [],
    strings: {},
  };
  delete w.sard;
  // eslint-disable-next-line no-new-func
  new Function(SARD_READER_SCRIPT)();
  return { posts, chapterElement };
};

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const ARABIC = '<p>وَقَفَ الفارِسُ عَلى التَّلِّ.</p><p>ثُمَّ مَضى في الساعةِ ٩ مساءً.</p>';

describe('sard reader script', () => {
  it('hides tashkeel through LNReader rawHTML and restores it live', () => {
    const { chapterElement } = setupReader(ARABIC, { tashkeel: 'hide' });
    expect(chapterElement.textContent).toContain('وقف الفارس على التل.');
    w.sard.setSettings({ tashkeel: 'show' });
    expect(chapterElement.textContent).toContain('وَقَفَ الفارِسُ');
    w.sard.setSettings({ tashkeel: 'keepShadda' });
    expect(chapterElement.textContent).toContain('التّلّ');
  });

  it('converts digits only in text', () => {
    const { chapterElement } = setupReader('<p data-n="9">الساعة ٩ و 10</p>', { digits: 'western' });
    expect(chapterElement.textContent).toBe('الساعة 9 و 10');
    expect(chapterElement.querySelector('p')?.getAttribute('data-n')).toBe('9');
  });

  it('detects rtl for Arabic chapters in auto mode', () => {
    setupReader(ARABIC);
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.body.classList.contains('sard-auto-bidi')).toBe(true);
    w.sard.setSettings({ direction: 'ltr' });
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('anchors a selection in normalised text and wraps it', () => {
    const { chapterElement } = setupReader(ARABIC);
    const p = chapterElement.querySelector('p') as HTMLElement;
    const text = p.firstChild as Text;
    const startIdx = text.data.indexOf('الفارِسُ');
    const range = document.createRange();
    range.setStart(text, startIdx);
    range.setEnd(text, startIdx + 'الفارِسُ'.length);
    const anchor = w.sard._rangeToAnchor(range);
    // Offsets ignore harakat: "وقف " is 4 normalised characters.
    expect(anchor.start).toBe(4);
    expect(anchor.end).toBe(4 + 'الفارس'.length);
    expect(anchor.text).toBe('الفارِسُ');

    w.sard.setHighlights([{ id: 1, ...anchor, color: 'green', note: 'x' }]);
    jest.advanceTimersByTime(100);
    const mark = chapterElement.querySelector('mark.sard-hl') as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('الفارِسُ');
    expect(mark.getAttribute('data-color')).toBe('green');
    expect(mark.classList.contains('sard-has-note')).toBe(true);
  });

  it('keeps highlights when tashkeel visibility changes', () => {
    const { chapterElement } = setupReader(ARABIC);
    w.sard.setHighlights([{ id: 2, start: 4, end: 10, text: 'الفارس', prefix: 'وقف ', suffix: ' على' }]);
    jest.advanceTimersByTime(100);
    expect(chapterElement.querySelector('mark')?.textContent).toBe('الفارِسُ');
    w.sard.setSettings({ tashkeel: 'hide' });
    jest.advanceTimersByTime(100);
    expect(chapterElement.querySelectorAll('mark')).toHaveLength(1);
    expect(chapterElement.querySelector('mark')?.textContent).toBe('الفارس');
  });

  it('spans highlights across elements and re-applies after the DOM is replaced', async () => {
    const { chapterElement } = setupReader('<p>Hello <b>brave</b> new world</p>');
    w.sard.setHighlights([{ id: 3, start: 3, end: 15, text: 'lo brave new' }]);
    jest.advanceTimersByTime(100);
    const marks = chapterElement.querySelectorAll('mark[data-hl-id="3"]');
    expect(Array.from(marks).map(m => m.textContent).join('')).toBe('lo brave new');
    // LNReader re-renders (e.g. bionic reading) → marks are lost and restored.
    chapterElement.innerHTML = '<p>Hello <b>brave</b> new world</p>';
    await Promise.resolve();
    jest.advanceTimersByTime(100);
    expect(chapterElement.querySelectorAll('mark[data-hl-id="3"]').length).toBeGreaterThan(0);
  });

  it('re-anchors by text + context when offsets drift, and reports orphans', () => {
    const { chapterElement, posts } = setupReader('<p>Intro added. The quick fox. The quick fox jumps.</p>');
    w.sard.setHighlights([
      { id: 4, start: 0, end: 13, text: 'The quick fox', prefix: 'fox. ', suffix: ' jumps' },
      { id: 5, start: 0, end: 5, text: 'missing words' },
    ]);
    jest.advanceTimersByTime(100);
    const mark = chapterElement.querySelector('mark[data-hl-id="4"]') as HTMLElement;
    expect(mark.textContent).toBe('The quick fox');
    // It picked the second occurrence (better context).
    expect(mark.nextSibling?.textContent?.startsWith(' jumps')).toBe(true);
    expect(posts.find(p => p.type === 'sard-highlight-orphans')?.data.ids).toEqual([5]);
  });

  it('removes and updates highlights', () => {
    const { chapterElement } = setupReader('<p>alpha beta gamma</p>');
    w.sard.setHighlights([{ id: 6, start: 6, end: 10, text: 'beta', color: 'yellow' }]);
    jest.advanceTimersByTime(100);
    w.sard.updateHighlight({ id: 6, color: 'pink', note: 'n' });
    jest.advanceTimersByTime(100);
    expect(chapterElement.querySelector('mark')?.getAttribute('data-color')).toBe('pink');
    w.sard.removeHighlight(6);
    expect(chapterElement.querySelector('mark')).toBeNull();
    expect(chapterElement.innerHTML).toBe('<p>alpha beta gamma</p>');
  });

  it('opens a highlight on tap instead of toggling the reader UI', () => {
    const { chapterElement, posts } = setupReader('<p>alpha beta gamma</p>');
    w.sard.setHighlights([{ id: 7, start: 0, end: 5, text: 'alpha' }]);
    jest.advanceTimersByTime(100);
    const docClick = jest.fn();
    document.onclick = docClick;
    (chapterElement.querySelector('mark') as HTMLElement).click();
    expect(posts.find(p => p.type === 'sard-highlight-press')?.data).toEqual({ id: 7 });
    expect(docClick).not.toHaveBeenCalled();
    document.onclick = null;
  });

  it('builds focus overlay and typography css', () => {
    setupReader(ARABIC, { focusMode: 'ruler', fontWeight: 500, kashida: true });
    const focus = document.getElementById('sard-focus') as HTMLElement;
    expect(focus.style.display).toBe('block');
    const css = (document.getElementById('sard-css') as HTMLStyleElement).textContent ?? '';
    expect(css).toContain('font-weight:500');
    expect(css).toContain('text-justify:kashida');
    expect(css).toContain('letter-spacing:0 !important');
    w.sard.setSettings({ focusMode: 'off' });
    expect(focus.style.display).toBe('none');
  });

  it('shows the smooth auto-scroll pill only when enabled in scroll mode', () => {
    setupReader('<p>text</p>');
    const pill = document.getElementById('sard-autoscroll') as HTMLElement;
    expect(pill.style.display).toBe('none');
    w.reader.generalSettings.val = { autoScroll: true, pageReader: false };
    expect(pill.style.display).toBe('flex');
    w.reader.generalSettings.val = { autoScroll: true, pageReader: true };
    expect(pill.style.display).toBe('none');
  });
});
