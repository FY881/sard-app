import dayjs from 'dayjs';
import { getString } from '@i18n/translations';
import { formatDate, getDateFormatLabel } from '../dateFormat';

// Sard ships Arabic as the default locale, so expectations are derived from
// dayjs / getString output for the active locale instead of English literals.
describe('dateFormat', () => {
  const now = new Date(2026, 6, 25, 12);

  it.each([
    ['MM/DD/YY', '07/25/26'],
    ['DD/MM/YY', '25/07/26'],
    ['YYYY-MM-DD', '2026-07-25'],
  ] as const)('formats %s numeric dates', (dateFormat, expected) => {
    expect(formatDate(now, dateFormat, false)).toBe(expected);
  });

  it.each(['DD MMM YYYY', 'MMM DD, YYYY'] as const)(
    'formats %s dates with localized month names',
    dateFormat => {
      const out = formatDate(now, dateFormat, false);
      expect(out).toBe(dayjs(now).format(dateFormat));
      expect(out).toContain('2026');
      expect(out).toContain('25');
    },
  );

  it('uses relative labels only when enabled', () => {
    const today = dayjs(now).calendar(dayjs(now));
    const yesterday = dayjs(new Date(2026, 6, 24, 12)).calendar(dayjs(now));
    expect(formatDate(now, 'YYYY-MM-DD', true, now)).toBe(today);
    expect(formatDate(new Date(2026, 6, 24, 12), 'YYYY-MM-DD', true, now)).toBe(
      yesterday,
    );
    expect(today).not.toBe(yesterday);
    expect(today).not.toBe('2026-07-25');
    expect(formatDate(now, 'YYYY-MM-DD', false, now)).toBe('2026-07-25');
  });

  it('keeps calendar labels for dates within a week', () => {
    const lastWeek = new Date(2026, 6, 20, 12);
    const out = formatDate(lastWeek, 'YYYY-MM-DD', true, now);
    expect(out).toBe(dayjs(lastWeek).calendar(dayjs(now)));
    expect(out).not.toBe('2026-07-20');
    // Older than a week falls back to the chosen format.
    expect(formatDate(new Date(2026, 6, 1, 12), 'YYYY-MM-DD', true, now)).toBe(
      '2026-07-01',
    );
  });

  it('includes a preview in each setting label', () => {
    expect(getDateFormatLabel('DD/MM/YY', now)).toBe('dd/MM/yy (25/07/26)');
    const sample = formatDate(now, 'default', false);
    expect(getDateFormatLabel('default', now)).toBe(
      getString('appearanceScreen.dateFormatDefault', { date: sample }),
    );
    expect(getDateFormatLabel('default', now)).toContain(sample);
  });

  it('preserves invalid string values', () => {
    expect(formatDate('Unknown', 'YYYY-MM-DD')).toBe('Unknown');
  });
});
