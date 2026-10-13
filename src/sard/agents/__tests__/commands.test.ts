import { parseLocalCommand } from '../commandParser';
import { TOOL_SPECS, toolDeclarations, validateToolCall } from '../tools';
import { detectSourceIntent, stripDisallowedLinks } from '../sourceGuard';
import { matchNovel, scoreTitle } from '../novelMatcher';

describe('local Arabic command parser', () => {
  it('«نزّل آخر 20 فصل من X»', () => {
    expect(parseLocalCommand('نزّل آخر 20 فصل من سولو ليفلينج')).toEqual({
      tool: 'download_chapters',
      args: { novel: 'سولو ليفلينج', which: 'latest', count: 20 },
    });
  });
  it('Arabic-Indic digits and egyptian phrasing', () => {
    expect(parseLocalCommand('حمّل ١٠ فصول الجاية لـ عبد الظل')).toEqual({
      tool: 'download_chapters',
      args: { novel: 'عبد الظل', which: 'next', count: 10 },
    });
    expect(parseLocalCommand('نزل الفصول التالية من القمر')).toEqual({
      tool: 'download_chapters',
      args: { novel: 'القمر', which: 'next' },
    });
  });
  it('«نزل كل فصول X»', () => {
    expect(parseLocalCommand('نزل كل فصول المتجول')).toMatchObject({
      tool: 'download_chapters',
      args: { novel: 'المتجول', which: 'all' },
    });
  });
  it('«لخّص المجلد التاني من X»', () => {
    expect(parseLocalCommand('لخّص المجلد التاني من شادو سليف')).toEqual({
      tool: 'summarize_volume',
      args: { novel: 'شادو سليف', volume: 2 },
    });
    expect(parseLocalCommand('لخص المجلد 3 لـ X')).toMatchObject({
      args: { volume: 3 },
    });
  });
  it('chapter range and single chapter summaries', () => {
    expect(
      parseLocalCommand('لخص الفصول من 10 إلى 20 من الرواية س'),
    ).toMatchObject({
      tool: 'summarize_volume',
      args: { from_chapter: 10, to_chapter: 20 },
    });
    expect(parseLocalCommand('لخص الفصل 12 من القمر')).toEqual({
      tool: 'summarize_chapter',
      args: { novel: 'القمر', chapter: '12' },
    });
    expect(parseLocalCommand('لخص آخر فصل من القمر')).toMatchObject({
      args: { chapter: 'current' },
    });
  });
  it('library commands', () => {
    expect(parseLocalCommand('رتّب مكتبتي')).toEqual({
      tool: 'organize_library',
      args: {},
    });
    expect(parseLocalCommand('فيه روايات مكررة؟')).toEqual({
      tool: 'find_duplicates',
      args: {},
    });
    expect(parseLocalCommand('حدّث المكتبة')).toEqual({
      tool: 'check_updates',
      args: {},
    });
    expect(parseLocalCommand('رشحلي 5 روايات')).toEqual({
      tool: 'recommend_novels',
      args: { count: 5 },
    });
    expect(parseLocalCommand('الروايات اللي سايبها')).toEqual({
      tool: 'show_shelf',
      args: { shelf: 'paused' },
    });
    expect(parseLocalCommand('ذكرني بما سبق في القمر')).toEqual({
      tool: 'recap_novel',
      args: { novel: 'القمر' },
    });
  });
  it('returns null for free-form chatter', () => {
    expect(parseLocalCommand('ازيك عامل ايه')).toBeNull();
    expect(parseLocalCommand('')).toBeNull();
  });
  it('every parsed command passes the whitelist validator', () => {
    const samples = [
      'نزّل آخر 20 فصل من س',
      'لخّص المجلد التاني من س',
      'لخص الفصل 3 من س',
      'رتب مكتبتي',
      'رشحلي',
      'حدث المكتبة',
    ];
    for (const s of samples) {
      const p = parseLocalCommand(s)!;
      expect(validateToolCall(p.tool, p.args).ok).toBe(true);
    }
  });
});

describe('tool whitelist', () => {
  it('has no web/source tools', () => {
    const names = TOOL_SPECS.map(t => t.name).join(' ');
    expect(names).not.toMatch(
      /search_web|add_source|add_repo|install|browse|fetch_url/,
    );
    expect(toolDeclarations()).toHaveLength(TOOL_SPECS.length);
  });
  it('rejects unknown tools', () => {
    expect(validateToolCall('add_repository', { url: 'x' })).toEqual({
      ok: false,
      error: 'unknown_tool',
      detail: 'add_repository',
    });
  });
  it('coerces and validates args, drops unknown keys', () => {
    const v = validateToolCall('download_chapters', {
      novel: ' X ',
      count: '20',
      which: 'latest',
      evil: 1,
    });
    expect(v).toMatchObject({
      ok: true,
      args: { novel: 'X', count: 20, which: 'latest' },
    });
    expect(
      validateToolCall('download_chapters', { novel: 'X', count: 9999 }).ok,
    ).toBe(false);
    expect(validateToolCall('download_chapters', { count: 2 })).toMatchObject({
      ok: false,
      detail: 'missing:novel',
    });
    expect(validateToolCall('show_shelf', { shelf: 'secret' }).ok).toBe(false);
    expect(
      validateToolCall('set_auto_download', { novel: 'x', enabled: 'true' }),
    ).toMatchObject({ ok: true, args: { enabled: true } });
  });
  it('marks destructive tools', () => {
    const destructive = TOOL_SPECS.filter(t => t.destructive)
      .map(t => t.name)
      .sort();
    expect(destructive).toEqual(
      [
        'delete_downloads',
        'mark_chapters_read',
        'organize_library',
        'remove_from_library',
      ].sort(),
    );
  });
});

describe('source guard (hard rule)', () => {
  it('refuses requests to find/add sources, repos, sites', () => {
    for (const s of [
      'ضيفلي مصدر روايات جديد',
      'دورلي على موقع فيه الرواية دي',
      'اقترح مستودع إضافات',
      'add a repo for novels',
      'هاتلي لينك الرواية',
      'عايز موقع مقرصن',
      'where can I find a site with this novel',
    ]) {
      expect(detectSourceIntent(s)).toBe('refuse');
    }
  });
  it('refuses source listings too (no built-in sources ship)', () => {
    expect(detectSourceIntent('اعرض المصادر القانونية')).toBe('refuse');
    expect(detectSourceIntent('ما هي المصادر المدمجة؟')).toBe('refuse');
  });
  it('has no tool that lists, searches or adds sources', () => {
    expect(TOOL_SPECS.map(t => t.name)).not.toContain('list_legal_sources');
  });
  it('does not trigger on normal commands', () => {
    expect(detectSourceIntent('نزّل آخر 20 فصل من سولو')).toBe('none');
    expect(
      detectSourceIntent('لخص المجلد التاني بالإضافة للفصل الأخير'),
    ).toBe('none');
    expect(detectSourceIntent('رشحلي روايات')).toBe('none');
  });
  it('strips every link when nothing is allowed', () => {
    expect(stripDisallowedLinks('اقرأ من https://evil-novels.com/x', [])).not.toMatch(/evil/);
  });
  it('strips links that are not in the allow-list', () => {
    const out = stripDisallowedLinks(
      'اقرأ من https://evil-novels.com/x أو www.pirate.to أو https://www.gutenberg.org/ebooks/1 أو novels.xyz',
      ['https://www.gutenberg.org'],
    );
    expect(out).not.toMatch(/evil|pirate|novels\.xyz/);
    expect(out).toContain('https://www.gutenberg.org/ebooks/1');
  });
});

describe('novel matcher', () => {
  const lib = [
    { id: 1, name: 'Solo Leveling' },
    { id: 2, name: 'سولو ليفلينج' },
    { id: 3, name: 'Shadow Slave' },
    { id: 4, name: 'Shadow Slave (Arabic)' },
    { id: 5, name: 'Lord of the Mysteries' },
  ];
  it('exact and containment matches', () => {
    expect(matchNovel('lord of mysteries', lib)).toMatchObject({
      status: 'unique',
      novel: { id: 5 },
    });
    expect(matchNovel('سولو', lib)).toMatchObject({
      status: 'unique',
      novel: { id: 2 },
    });
    expect(matchNovel('solo leveling', lib)).toMatchObject({
      status: 'unique',
      novel: { id: 1 },
    });
  });
  it('typos', () => {
    expect(matchNovel('solo levelin', lib)).toMatchObject({
      status: 'unique',
      novel: { id: 1 },
    });
    expect(scoreTitle('سولو ليفلنج', 'سولو ليفلينج')).toBeGreaterThan(0.8);
  });
  it('ambiguous and none', () => {
    expect(matchNovel('shadow', lib).status).toBe('ambiguous');
    expect(matchNovel('xyz unknown', lib)).toEqual({ status: 'none' });
  });
});
