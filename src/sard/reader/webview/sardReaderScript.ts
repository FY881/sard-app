/**
 * Script injected into the LNReader WebView after core.js / textRemover.js.
 * It adds Sard's Arabic-first features on top of the untouched LNReader
 * runtime: text transforms (tashkeel / tatweel / digits), Arabic typography
 * CSS, automatic direction, focus ruler, smooth auto-scroll and highlights.
 *
 * Written as plain ES5-ish JS inside String.raw so regex escapes survive.
 * It must not contain backticks or "${".
 *
 * Messages posted to React Native (all `{ type, data }`):
 *  - sard-highlight        { start, end, text, prefix, suffix, color, note? , intent }
 *  - sard-highlight-press  { id }
 *  - sard-copy             { text }
 *  - sard-share-quote      { text }
 *  - sard-vocab            { text, sentence }   save a word to the vocabulary notebook
 *  - sard-setting          Partial<SardReaderSettings>
 *  - sard-highlight-orphans { ids }   highlights that no longer match the text
 *  - sard-autoscroll-end   {}
 */
export const SARD_READER_SCRIPT = String.raw`
(function () {
  if (!window.reader || window.sard) { return; }
  var cfg = window.__SARD_INIT__ || {};
  var settings = cfg.settings || {};
  var chapterEl = reader.chapterElement;
  var strings = cfg.strings || {};
  function post(type, data) { reader.post({ type: type, data: data }); }

  var TASH = new RegExp('[' + cfg.tashkeelChars + ']', 'g');
  var TASH_KEEP_SHADDA = new RegExp('[' + cfg.tashkeelCharsNoShadda + ']', 'g');
  var TASH_ONE = new RegExp('^[' + cfg.tashkeelChars + '\u0640\u200B-\u200F\u061C]$');
  var WESTERN = '0123456789';
  var AR_INDIC = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
  var EXT_INDIC = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';

  /* ------------------------------------------------------------------ */
  /* Text transforms                                                    */
  /* ------------------------------------------------------------------ */
  function convertDigits(t, style) {
    if (style === 'arabicIndic') {
      return t.replace(/[0-9\u06F0-\u06F9]/g, function (d) {
        var w = WESTERN.indexOf(d);
        return AR_INDIC[w >= 0 ? w : EXT_INDIC.indexOf(d)];
      });
    }
    if (style === 'western') {
      return t.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
        var a = AR_INDIC.indexOf(d);
        return WESTERN[a >= 0 ? a : EXT_INDIC.indexOf(d)];
      });
    }
    return t;
  }
  function transformText(t, s) {
    if (s.tashkeel === 'hide') { t = t.replace(TASH, ''); }
    else if (s.tashkeel === 'keepShadda') { t = t.replace(TASH_KEEP_SHADDA, ''); }
    if (s.stripTatweel) { t = t.replace(/\u0640/g, ''); }
    if (s.digits && s.digits !== 'default') { t = convertDigits(t, s.digits); }
    return t;
  }
  function transformHtml(html, s) {
    if (s.tashkeel === 'show' && !s.stripTatweel && (!s.digits || s.digits === 'default')) {
      return html;
    }
    var parts = html.split(/(<[^>]*>)/);
    var raw = null;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) { continue; }
      if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
        if (raw) { if (p.toLowerCase().indexOf(raw) === 0) { raw = null; } }
        else {
          var m = /^<(script|style|textarea)\b/i.exec(p);
          if (m) { raw = '</' + m[1].toLowerCase(); }
        }
        continue;
      }
      if (raw) { continue; }
      parts[i] = transformText(p, s);
    }
    return parts.join('');
  }

  var originalHTML = reader.rawHTML;
  var appliedTextKey = 'show|false|default';
  function textKey(s) { return s.tashkeel + '|' + !!s.stripTatweel + '|' + (s.digits || 'default'); }
  function applyTextTransforms() {
    var key = textKey(settings);
    if (key === appliedTextKey) { return; }
    appliedTextKey = key;
    reader.rawHTML = transformHtml(originalHTML, settings);
    // Re-run LNReader's text-options deriver (bionic, spacing, search).
    reader.generalSettings.val = Object.assign({}, reader.generalSettings.val);
    scheduleHighlights();
  }
  // Keep remove/replace text actions working on the untransformed source.
  ['performRemove', 'performReplace'].forEach(function (fn) {
    var orig = window.textRemover && window.textRemover[fn];
    if (!orig) { return; }
    window.textRemover[fn] = function () {
      orig.apply(this, arguments);
      originalHTML = reader.rawHTML;
      scheduleHighlights();
    };
  });

  /* ------------------------------------------------------------------ */
  /* Direction                                                          */
  /* ------------------------------------------------------------------ */
  var AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/g;
  var LTR_RE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g;
  function detectDir() {
    var sample = (chapterEl.textContent || '').slice(0, 6000);
    var a = (sample.match(AR_RE) || []).length;
    var l = (sample.match(LTR_RE) || []).length;
    if (a + l === 0) { return cfg.sourceDir || 'ltr'; }
    return a / (a + l) >= 0.3 ? 'rtl' : 'ltr';
  }
  var currentDir = document.documentElement.getAttribute('dir') || 'ltr';
  function applyDirection() {
    var mode = settings.direction || 'auto';
    var dir = mode === 'rtl' || mode === 'ltr' ? mode
      : mode === 'source' ? (cfg.sourceDir || 'ltr') : detectDir();
    document.body.classList.toggle('sard-auto-bidi', mode === 'auto');
    document.documentElement.setAttribute('lang', dir === 'rtl' ? 'ar' : '');
    if (dir !== currentDir) {
      currentDir = dir;
      document.documentElement.setAttribute('dir', dir);
      if (typeof schedulePageCalculation === 'function') { schedulePageCalculation(); }
      else if (reader.refresh) { reader.refresh(); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Typography CSS                                                     */
  /* ------------------------------------------------------------------ */
  var styleEl = document.createElement('style');
  styleEl.id = 'sard-css';
  document.head.appendChild(styleEl);
  var fontStyleEl = document.createElement('style');
  fontStyleEl.id = 'sard-fonts';
  document.head.appendChild(fontStyleEl);

  function hlColor(name) {
    var c = (cfg.highlightColors || {})[name] || (cfg.highlightColors || {}).yellow || { light: '#FFE58F', dark: '#8A7A1F' };
    return isDarkTheme() ? c.dark : c.light;
  }
  function isDarkTheme() {
    var bg = (reader.readerSettings.val.theme || '#ffffff').replace('#', '');
    if (bg.length === 3) { bg = bg[0] + bg[0] + bg[1] + bg[1] + bg[2] + bg[2]; }
    var r = parseInt(bg.substr(0, 2), 16), g = parseInt(bg.substr(2, 2), 16), b = parseInt(bg.substr(4, 2), 16);
    if (isNaN(r)) { return false; }
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }

  function buildCss() {
    var rs = reader.readerSettings.val;
    var s = settings;
    var css = [];
    var chap = '#LNReader-chapter';
    var blocks = chap + ' :is(p,div,li,blockquote,h1,h2,h3,h4,h5,h6,span)';
    css.push(':root{--sard-hl-yellow:' + hlColor('yellow') + ';--sard-hl-green:' + hlColor('green') +
      ';--sard-hl-blue:' + hlColor('blue') + ';--sard-hl-pink:' + hlColor('pink') +
      ';--sard-hl-orange:' + hlColor('orange') + ';--sard-hl-purple:' + hlColor('purple') + ';}');
    // Arabic shaping protection: letter-spacing breaks cursive joining.
    css.push('html[lang=ar] ' + chap + ',html[lang=ar] ' + blocks + '{letter-spacing:0 !important;' +
      'font-variant-ligatures:common-ligatures contextual;font-feature-settings:"kern" 1,"liga" 1,"calt" 1,"rlig" 1;' +
      'font-kerning:normal;text-rendering:optimizeLegibility;}');
    if (s.fontWeight && s.fontWeight > 0) {
      css.push(chap + '{font-weight:' + s.fontWeight + ';}');
      css.push(chap + ' :is(b,strong,h1,h2,h3,h4,h5,h6){font-weight:' + Math.min(1000, s.fontWeight + 300) + ';}');
    }
    if (s.wordSpacing) { css.push(chap + '{word-spacing:' + s.wordSpacing + 'em;}'); }
    if (s.paragraphSpacing !== null && s.paragraphSpacing !== undefined) {
      css.push(chap + ' p{margin-top:0;margin-bottom:' + s.paragraphSpacing + 'em;}');
    }
    if (s.textIndent) { css.push(chap + ' p{text-indent:' + s.textIndent + 'em;}'); }
    if (rs.textAlign === 'justify' && s.kashida) {
      css.push(chap + ',' + chap + ' p{text-align:justify;text-justify:inter-word;text-align-last:start;}');
      css.push('html[lang=ar] ' + chap + ',html[lang=ar] ' + chap + ' p{text-justify:kashida;hyphens:none;-webkit-hyphens:none;}');
      if (s.hyphenate) {
        css.push('html:not([lang=ar]) ' + chap + ' p{hyphens:auto;-webkit-hyphens:auto;}');
      }
    }
    if (document.body.classList.contains('sard-auto-bidi')) {
      css.push('.sard-auto-bidi ' + chap + ' :is(p,li,blockquote,h1,h2,h3,h4,h5,h6,td,dd,dt){unicode-bidi:plaintext;}');
      if (rs.textAlign !== 'justify' && rs.textAlign !== 'center') {
        css.push('.sard-auto-bidi ' + chap + ' :is(p,li,blockquote){text-align:start;}');
      }
    }
    // Highlights
    css.push('mark.sard-hl{color:inherit;border-radius:3px;padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone;background:var(--sard-hl-yellow);}');
    ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'].forEach(function (c) {
      css.push('mark.sard-hl[data-color=' + c + ']{background:var(--sard-hl-' + c + ');}');
    });
    css.push('mark.sard-hl.sard-has-note{border-bottom:2px dotted currentColor;}');
    css.push('mark.sard-hl.sard-flash{animation:sardflash 1.2s ease-in-out 2;}');
    css.push('@keyframes sardflash{50%{filter:brightness(1.35) saturate(1.4);}}');
    // Focus
    css.push('#sard-focus{position:fixed;inset:0;pointer-events:none;z-index:4;display:none;}');
    css.push('#sard-focus .sard-dim{position:absolute;left:0;right:0;background:var(--readerSettings-theme);transition:top .12s,height .12s;}');
    css.push('#sard-focus .sard-band{position:absolute;left:0;right:0;transition:top .12s,height .12s;}');
    css.push('#sard-focus.sard-line .sard-band{border-bottom:2px solid var(--theme-primary);background:color-mix(in srgb,var(--theme-primary) 8%,transparent);}');
    css.push('#sard-focus .sard-grip{position:absolute;inset-inline-end:0;width:28px;height:44px;margin-top:-22px;pointer-events:auto;display:flex;align-items:center;justify-content:center;opacity:.65;touch-action:none;}');
    css.push('#sard-focus .sard-grip::before{content:"";width:6px;height:28px;border-radius:3px;background:var(--theme-primary);}');
    css.push('body.sard-focus-paragraph ' + chap + ' :is(p,li,blockquote,h1,h2,h3,h4,h5,h6){transition:opacity .25s;opacity:' + (1 - (s.focusDim || 0.55)) + ';}');
    css.push('body.sard-focus-paragraph ' + chap + ' .sard-focused{opacity:1 !important;}');
    // Auto-scroll pill
    css.push('#sard-autoscroll{position:fixed;bottom:calc(var(--bottom-inset,0px) + 20px);left:50%;transform:translateX(-50%);z-index:99999;display:none;align-items:center;gap:2px;' +
      'border:1px solid var(--theme-outlineVariant);border-radius:24px;background:var(--theme-surface-0-9);box-shadow:0 4px 12px rgba(0,0,0,.18);padding:2px 6px;opacity:.55;transition:opacity .2s;user-select:none;direction:ltr;}');
    css.push('#sard-autoscroll.sard-active{opacity:.95;}');
    css.push('#sard-autoscroll button{min-width:40px;min-height:40px;border:0;background:transparent;color:var(--theme-onSurface);font-size:18px;font-weight:600;border-radius:20px;touch-action:manipulation;}');
    css.push('#sard-autoscroll button:active{background:var(--theme-surfaceVariant);}');
    css.push('#sard-autoscroll span{min-width:44px;text-align:center;color:var(--theme-onSurfaceVariant);font-size:12px;font-variant-numeric:tabular-nums;}');
    return css.join('\n');
  }

  var loadedFaces = {};
  function applyFonts() {
    var fam = reader.readerSettings.val.fontFamily;
    var faces = (cfg.fontFaces || {})[fam];
    fontStyleEl.textContent = faces || '';
    if (faces && !loadedFaces[fam] && document.fonts && document.fonts.load) {
      loadedFaces[fam] = true;
      Promise.all([document.fonts.load('400 1em "' + fam + '"'), document.fonts.load('700 1em "' + fam + '"')])
        .then(function () { if (typeof schedulePageCalculation === 'function') { schedulePageCalculation(); } })
        .catch(function () {});
    }
  }

  function applyCss() { styleEl.textContent = buildCss(); applyFonts(); }

  /* ------------------------------------------------------------------ */
  /* Focus ruler / line / paragraph                                     */
  /* ------------------------------------------------------------------ */
  var focusRoot = document.createElement('div');
  focusRoot.id = 'sard-focus';
  focusRoot.innerHTML = '<div class="sard-dim sard-top"></div><div class="sard-band"></div><div class="sard-dim sard-bottom"></div><div class="sard-grip"></div>';
  document.body.appendChild(focusRoot);
  var fTop = focusRoot.children[0], fBand = focusRoot.children[1], fBottom = focusRoot.children[2], fGrip = focusRoot.children[3];
  var focusedEl = null;

  function bandMetrics() {
    var rs = reader.readerSettings.val;
    var lh = (rs.textSize || 16) * (rs.lineHeight || 1.5);
    var h = Math.max(lh, lh * (settings.focusLines || 3));
    var center = window.innerHeight * (settings.focusPosition || 0.38);
    var top = Math.max(0, center - h / 2);
    return { top: top, height: h, center: center };
  }
  function layoutFocus() {
    var mode = settings.focusMode || 'off';
    document.body.classList.toggle('sard-focus-paragraph', mode === 'paragraph');
    if (mode === 'off' || mode === 'paragraph') {
      focusRoot.style.display = 'none';
      if (mode === 'paragraph') { updateFocusedParagraph(); }
      else if (focusedEl) { focusedEl.classList.remove('sard-focused'); focusedEl = null; }
      return;
    }
    focusRoot.style.display = 'block';
    focusRoot.className = mode === 'line' ? 'sard-line' : 'sard-ruler';
    var m = bandMetrics();
    var dim = settings.focusDim || 0.55;
    fBand.style.top = m.top + 'px';
    fBand.style.height = m.height + 'px';
    fGrip.style.top = m.center + 'px';
    if (mode === 'ruler') {
      fTop.style.display = fBottom.style.display = 'block';
      fTop.style.top = '0px'; fTop.style.height = m.top + 'px'; fTop.style.opacity = dim;
      fBottom.style.top = (m.top + m.height) + 'px';
      fBottom.style.height = Math.max(0, window.innerHeight - m.top - m.height) + 'px';
      fBottom.style.opacity = dim;
    } else {
      fTop.style.display = fBottom.style.display = 'none';
    }
  }
  function updateFocusedParagraph() {
    if (settings.focusMode !== 'paragraph') { return; }
    var y = window.innerHeight * (settings.focusPosition || 0.38);
    var x = window.innerWidth / 2;
    var el = document.elementFromPoint(x, y);
    var p = el && el.closest ? el.closest('#LNReader-chapter :is(p,li,blockquote,h1,h2,h3,h4,h5,h6)') : null;
    if (!p) {
      // Between paragraphs: pick the nearest one below the focus line.
      var list = chapterEl.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6');
      var best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { continue; }
        var d = Math.abs((r.top + r.bottom) / 2 - y);
        if (d < bestD) { bestD = d; best = list[i]; }
      }
      p = best;
    }
    if (p === focusedEl) { return; }
    if (focusedEl) { focusedEl.classList.remove('sard-focused'); }
    focusedEl = p;
    if (p) { p.classList.add('sard-focused'); }
  }
  var focusRaf = 0;
  window.addEventListener('scroll', function () {
    if (settings.focusMode !== 'paragraph' || focusRaf) { return; }
    focusRaf = requestAnimationFrame(function () { focusRaf = 0; updateFocusedParagraph(); });
  }, { passive: true });
  window.addEventListener('resize', function () { layoutFocus(); });

  var dragging = false;
  fGrip.addEventListener('touchstart', function (e) { dragging = true; e.stopPropagation(); e.preventDefault(); }, { passive: false });
  fGrip.addEventListener('touchmove', function (e) {
    if (!dragging) { return; }
    var t = e.touches[0];
    settings.focusPosition = Math.min(0.92, Math.max(0.08, t.clientY / window.innerHeight));
    layoutFocus();
    e.stopPropagation(); e.preventDefault();
  }, { passive: false });
  fGrip.addEventListener('touchend', function (e) {
    if (!dragging) { return; }
    dragging = false;
    e.stopPropagation();
    post('sard-setting', { focusPosition: Math.round(settings.focusPosition * 1000) / 1000 });
  });
  fGrip.addEventListener('click', function (e) { e.stopPropagation(); });

  /* ------------------------------------------------------------------ */
  /* Smooth auto-scroll                                                 */
  /* ------------------------------------------------------------------ */
  var pill = document.createElement('div');
  pill.id = 'sard-autoscroll';
  pill.innerHTML = '<button type="button" data-a="slower" aria-label="' + (strings.slower || '-') + '">\u2212</button>' +
    '<button type="button" data-a="toggle" aria-label="' + (strings.pause || 'pause') + '">\u23F8</button>' +
    '<span></span>' +
    '<button type="button" data-a="faster" aria-label="' + (strings.faster || '+') + '">+</button>';
  document.body.appendChild(pill);
  var pillLabel = pill.querySelector('span');
  var pillToggle = pill.querySelector('[data-a=toggle]');
  var as = { running: false, userPaused: false, touchPaused: false, raf: 0, last: 0, acc: 0, resumeTimer: 0, endPosted: false };

  function autoScrollWanted() {
    var g = reader.generalSettings.val;
    return !!g.autoScroll && settings.autoScrollMode === 'smooth' && !g.pageReader;
  }
  function updatePill() {
    var wanted = autoScrollWanted();
    pill.style.display = wanted ? 'flex' : 'none';
    pillLabel.textContent = Math.round(settings.autoScrollSpeed || 30) + '';
    var paused = as.userPaused || !reader.hidden.val;
    pillToggle.textContent = paused ? '\u25B6' : '\u23F8';
    pill.classList.toggle('sard-active', paused);
  }
  function frame(ts) {
    as.raf = 0;
    if (!autoScrollWanted()) { as.running = false; updatePill(); return; }
    var paused = as.userPaused || as.touchPaused || !reader.hidden.val || dragging ||
      (window.tts && window.tts.reading);
    if (!as.last) { as.last = ts; }
    var dt = Math.min(100, ts - as.last);
    as.last = ts;
    if (!paused) {
      as.acc += (settings.autoScrollSpeed || 30) * dt / 1000;
      if (as.acc >= 1) {
        var step = Math.floor(as.acc);
        as.acc -= step;
        window.scrollBy(0, step);
      }
      var atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atEnd && !as.endPosted) {
        as.endPosted = true;
        post('sard-autoscroll-end', {});
        if (settings.autoScrollNextChapter && reader.nextChapter) {
          setTimeout(function () { reader.post({ type: 'next' }); }, 1200);
        }
      }
    }
    as.raf = requestAnimationFrame(frame);
  }
  function syncAutoScroll() {
    updatePill();
    if (autoScrollWanted() && !as.raf) { as.last = 0; as.raf = requestAnimationFrame(frame); }
  }
  pill.addEventListener('click', function (e) {
    e.stopPropagation(); e.preventDefault();
    var b = e.target.closest('button');
    if (!b) { return; }
    var a = b.getAttribute('data-a');
    if (a === 'toggle') {
      if (!reader.hidden.val) { as.userPaused = false; post('hide'); }
      else { as.userPaused = !as.userPaused; }
    } else {
      var sp = settings.autoScrollSpeed || 30;
      sp = a === 'faster' ? Math.min(300, Math.round(sp * 1.2 + 1)) : Math.max(5, Math.round(sp / 1.2));
      settings.autoScrollSpeed = sp;
      post('sard-setting', { autoScrollSpeed: sp });
    }
    updatePill();
  }, true);
  pill.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
  document.addEventListener('touchstart', function () {
    if (!settings.autoScrollPauseOnTouch) { return; }
    as.touchPaused = true; clearTimeout(as.resumeTimer);
  }, { passive: true });
  document.addEventListener('touchend', function () {
    clearTimeout(as.resumeTimer);
    as.resumeTimer = setTimeout(function () { as.touchPaused = false; as.last = 0; }, 1500);
  }, { passive: true });
  if (window.van && van.derive) {
    van.derive(function () { reader.hidden.val; reader.generalSettings.val; updatePill(); syncAutoScroll(); });
  }

  /* ------------------------------------------------------------------ */
  /* Highlights                                                         */
  /* ------------------------------------------------------------------ */
  var highlights = (cfg.highlights || []).slice();
  var applying = false;

  function isSkippable(node) {
    var p = node.parentNode;
    while (p && p !== chapterEl) {
      var n = p.nodeName;
      if (n === 'SCRIPT' || n === 'STYLE' || n === 'NOSCRIPT') { return true; }
      p = p.parentNode;
    }
    return false;
  }
  /** Normalised text of the chapter plus a map back to DOM positions. */
  function buildIndex() {
    var walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT, null);
    var chars = [], nodes = [], offs = [], first = new Map();
    var node;
    while ((node = walker.nextNode())) {
      if (isSkippable(node)) { continue; }
      var t = node.nodeValue;
      first.set(node, nodes.length);
      for (var i = 0; i < t.length; i++) {
        var c = t[i];
        if (TASH_ONE.test(c)) { continue; }
        var ai = AR_INDIC.indexOf(c);
        if (ai < 0) { ai = EXT_INDIC.indexOf(c); }
        chars.push(ai >= 0 ? WESTERN[ai] : c);
        nodes.push(node); offs.push(i);
      }
    }
    return { text: chars.join(''), nodes: nodes, offs: offs, first: first };
  }
  function normalize(t) {
    var out = [];
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (TASH_ONE.test(c)) { continue; }
      var ai = AR_INDIC.indexOf(c);
      if (ai < 0) { ai = EXT_INDIC.indexOf(c); }
      out.push(ai >= 0 ? WESTERN[ai] : c);
    }
    return out.join('');
  }
  function firstTextIn(node, fromEnd) {
    if (node.nodeType === 3) { return node; }
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var n = w.nextNode(), last = n;
    if (!fromEnd) { return n; }
    while (n) { last = n; n = w.nextNode(); }
    return last;
  }
  /** Converts a DOM boundary into an index into the normalised text. */
  function boundaryIndex(idx, container, offset, isEnd) {
    var node = container, off = offset;
    if (container.nodeType !== 3) {
      var child = container.childNodes[offset];
      if (child) { node = firstTextIn(child, false); off = 0; }
      else { node = firstTextIn(container, true); off = node ? node.nodeValue.length : 0; }
      if (!node) { return isEnd ? idx.text.length : 0; }
    }
    var k = idx.first.get(node);
    if (k === undefined) {
      // Node not indexed (e.g. whitespace inside a skipped element): fall back to a scan.
      var r = document.createRange();
      r.setStart(chapterEl, 0);
      try { r.setEnd(node, off); } catch (e) { return 0; }
      return normalize(r.toString()).length;
    }
    while (k < idx.nodes.length && idx.nodes[k] === node && idx.offs[k] < off) { k++; }
    return k;
  }
  function rangeToAnchor(range) {
    var idx = buildIndex();
    var s = boundaryIndex(idx, range.startContainer, range.startOffset, false);
    var e = boundaryIndex(idx, range.endContainer, range.endOffset, true);
    while (s < e && /\s/.test(idx.text[s])) { s++; }
    while (e > s && /\s/.test(idx.text[e - 1])) { e--; }
    if (e <= s) { return null; }
    return {
      start: s, end: e,
      text: range.toString().trim(),
      prefix: idx.text.slice(Math.max(0, s - 40), s),
      suffix: idx.text.slice(e, e + 40),
    };
  }
  /** Finds the best current position for a stored anchor. */
  function resolve(idx, h) {
    var target = normalize(h.text || '').replace(/\s+/g, ' ').trim();
    if (h.start >= 0 && h.end <= idx.text.length) {
      var at = idx.text.slice(h.start, h.end).replace(/\s+/g, ' ').trim();
      if (!target || at === target) { return { s: h.start, e: h.end }; }
    }
    if (!target) { return null; }
    // Search all occurrences; score by context similarity and distance.
    var hay = idx.text, best = null, bestScore = -Infinity, from = 0, pos;
    var needle = normalize(h.text).trim();
    while ((pos = hay.indexOf(needle, from)) !== -1) {
      var score = 0;
      var pre = hay.slice(Math.max(0, pos - (h.prefix || '').length), pos);
      var suf = hay.slice(pos + needle.length, pos + needle.length + (h.suffix || '').length);
      for (var i = 1; i <= pre.length && pre[pre.length - i] === (h.prefix || '')[(h.prefix || '').length - i]; i++) { score++; }
      for (var j = 0; j < suf.length && suf[j] === (h.suffix || '')[j]; j++) { score++; }
      score -= Math.abs(pos - h.start) / 5000;
      if (score > bestScore) { bestScore = score; best = { s: pos, e: pos + needle.length }; }
      from = pos + 1;
    }
    return best;
  }
  function wrapRange(idx, s, e, h) {
    if (e <= s) { return 0; }
    var startNode = idx.nodes[s], endNode = idx.nodes[e - 1];
    var segments = [];
    var walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT, null);
    walker.currentNode = startNode;
    var node = startNode;
    while (node) {
      if (!isSkippable(node)) {
        var a = node === startNode ? idx.offs[s] : 0;
        var b = Math.min(node.nodeValue.length, node === endNode ? idx.offs[e - 1] + 1 : node.nodeValue.length);
        a = Math.min(a, b);
        // Extend over trailing combining marks of the last character.
        if (node === endNode) {
          while (b < node.nodeValue.length && TASH_ONE.test(node.nodeValue[b])) { b++; }
        }
        if (b > a && /\S/.test(node.nodeValue.slice(a, b))) { segments.push([node, a, b]); }
      }
      if (node === endNode) { break; }
      node = walker.nextNode();
    }
    segments.forEach(function (seg) {
      var n = seg[0], a = seg[1], b = seg[2];
      var mid = a > 0 ? n.splitText(a) : n;
      if (b - a < mid.nodeValue.length) { mid.splitText(b - a); }
      var mark = document.createElement('mark');
      mark.className = 'sard-hl' + (h.note ? ' sard-has-note' : '');
      mark.setAttribute('data-hl-id', String(h.id));
      mark.setAttribute('data-color', h.color || 'yellow');
      mid.parentNode.insertBefore(mark, mid);
      mark.appendChild(mid);
    });
    return segments.length;
  }
  function unwrap(id) {
    var marks = chapterEl.querySelectorAll(id === undefined ? 'mark.sard-hl' : 'mark.sard-hl[data-hl-id="' + id + '"]');
    var parents = [];
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], p = m.parentNode;
      while (m.firstChild) { p.insertBefore(m.firstChild, m); }
      p.removeChild(m);
      if (parents.indexOf(p) < 0) { parents.push(p); }
    }
    parents.forEach(function (p) { p.normalize(); });
  }
  function applyAll() {
    if (!settings.highlightsEnabled) {
      applying = true; unwrap(); applying = false; return;
    }
    applying = true;
    try {
      unwrap();
      if (!highlights.length) { return; }
      var orphans = [];
      // Apply from the end so earlier offsets stay valid while splitting.
      var resolved = [];
      var idx = buildIndex();
      highlights.forEach(function (h) {
        var r = resolve(idx, h);
        if (r) { resolved.push({ h: h, r: r }); } else { orphans.push(h.id); }
      });
      resolved.sort(function (x, y) { return y.r.s - x.r.s; });
      resolved.forEach(function (it) {
        wrapRange(idx, it.r.s, it.r.e, it.h);
      });
      if (orphans.length) { post('sard-highlight-orphans', { ids: orphans }); }
    } finally {
      applying = false;
    }
  }
  var hlTimer = 0;
  function scheduleHighlights() {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(applyAll, 60);
  }
  new MutationObserver(function () {
    if (applying) { return; }
    var missing = highlights.some(function (h) {
      return !chapterEl.querySelector('mark.sard-hl[data-hl-id="' + h.id + '"]');
    });
    if (missing) { scheduleHighlights(); }
  }).observe(chapterEl, { childList: true });

  // Tap on a highlight opens it in the app instead of toggling the reader UI.
  window.addEventListener('click', function (e) {
    var m = e.target && e.target.closest ? e.target.closest('mark.sard-hl') : null;
    if (!m) { return; }
    var sel = window.getSelection();
    if (sel && sel.toString().trim()) { return; }
    e.stopPropagation(); e.preventDefault();
    post('sard-highlight-press', { id: Number(m.getAttribute('data-hl-id')) });
  }, true);

  // Extra buttons in LNReader's selection pill (same look).
  var lastRange = null;
  function selectedRange() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) { return null; }
    var r = sel.getRangeAt(0);
    if (!chapterEl.contains(r.commonAncestorContainer)) { return null; }
    return r;
  }
  function addSelectionButtons() {
    var ui = document.getElementById('text-selection-ui');
    if (!ui || ui.getAttribute('data-sard')) { return; }
    ui.setAttribute('data-sard', '1');
    ui.style.maxWidth = 'calc(100vw - 16px)';
    ui.style.overflowX = 'auto';
    var defs = [
      ['highlight', strings.highlight || 'Highlight'],
      ['note', strings.note || 'Note'],
      ['copy', strings.copy || 'Copy'],
      ['share', strings.share || 'Share'],
      ['vocab', strings.vocab || 'Word'],
    ];
    defs.reverse().forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = d[1];
      b.style.minWidth = '64px';
      b.setAttribute('data-sard-action', d[0]);
      b.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        onSelectionAction(d[0]);
      });
      ui.insertBefore(b, ui.firstChild);
    });
  }
  function hideSelection() {
    var ui = document.getElementById('text-selection-ui');
    if (ui) { ui.style.opacity = '0'; ui.style.pointerEvents = 'none'; }
    var sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); }
  }
  function onSelectionAction(action) {
    var r = selectedRange() || lastRange;
    if (!r) { return; }
    var text = r.toString().trim();
    if (action === 'copy') { post('sard-copy', { text: text }); hideSelection(); return; }
    if (action === 'share') { post('sard-share-quote', { text: text }); hideSelection(); return; }
    if (action === 'vocab') {
      var block = r.startContainer && r.startContainer.parentElement ? r.startContainer.parentElement.closest('p, div, li') : null;
      post('sard-vocab', { text: text, sentence: block ? (block.textContent || '') : text });
      hideSelection();
      return;
    }
    var anchor = rangeToAnchor(r);
    if (!anchor) { return; }
    anchor.color = settings.defaultHighlightColor || 'yellow';
    anchor.intent = action;
    post('sard-highlight', anchor);
    hideSelection();
  }
  document.addEventListener('selectionchange', function () {
    var r = selectedRange();
    if (r) { lastRange = r.cloneRange(); setTimeout(addSelectionButtons, 0); }
  });

  /* ------------------------------------------------------------------ */
  /* Public API used by React Native via injectJavaScript               */
  /* ------------------------------------------------------------------ */
  window.sard = {
    setSettings: function (s) {
      var prevFocus = settings.focusMode;
      settings = Object.assign({}, settings, s || {});
      applyTextTransforms();
      applyDirection();
      applyCss();
      layoutFocus();
      if (prevFocus !== settings.focusMode && focusedEl && settings.focusMode !== 'paragraph') {
        focusedEl.classList.remove('sard-focused'); focusedEl = null;
      }
      syncAutoScroll();
      scheduleHighlights();
    },
    onReaderSettings: function () { applyCss(); layoutFocus(); },
    setHighlights: function (list) { highlights = (list || []).slice(); scheduleHighlights(); },
    addHighlight: function (h) {
      highlights = highlights.filter(function (x) { return x.id !== h.id; });
      highlights.push(h);
      scheduleHighlights();
    },
    updateHighlight: function (h) {
      highlights = highlights.map(function (x) { return x.id === h.id ? Object.assign({}, x, h) : x; });
      scheduleHighlights();
    },
    removeHighlight: function (id) {
      highlights = highlights.filter(function (x) { return x.id !== id; });
      applying = true; unwrap(id); applying = false;
    },
    scrollToHighlight: function (id) {
      var tries = 0;
      (function go() {
        var m = chapterEl.querySelector('mark.sard-hl[data-hl-id="' + id + '"]');
        if (!m) { if (tries++ < 20) { setTimeout(go, 150); } return; }
        if (reader.generalSettings.val.pageReader && window.pageReader && pageReader.movePage) {
          var w = reader.layoutWidth || window.innerWidth;
          var left = m.getBoundingClientRect().left + (pageReader.page.val * w);
          pageReader.movePage(Math.floor(Math.abs(left) / w));
        } else {
          window.scrollTo({ top: window.scrollY + m.getBoundingClientRect().top - window.innerHeight * 0.3, behavior: 'smooth' });
        }
        var all = chapterEl.querySelectorAll('mark.sard-hl[data-hl-id="' + id + '"]');
        for (var i = 0; i < all.length; i++) { all[i].classList.add('sard-flash'); }
        setTimeout(function () { for (var j = 0; j < all.length; j++) { all[j].classList.remove('sard-flash'); } }, 2600);
      })();
    },
    getText: function () { return chapterEl.innerText; },
    _transformText: transformText,
    _normalize: normalize,
    _rangeToAnchor: rangeToAnchor,
    _applyAll: applyAll,
  };

  // Re-apply CSS that depends on LNReader settings (theme, alignment, size).
  if (window.van && van.derive) {
    van.derive(function () { reader.readerSettings.val; applyCss(); layoutFocus(); });
  }

  // Initial pass.
  applyTextTransforms();
  applyDirection();
  applyCss();
  layoutFocus();
  syncAutoScroll();
  if (document.readyState === 'complete') { scheduleHighlights(); }
  else { window.addEventListener('load', scheduleHighlights); scheduleHighlights(); }
  if (cfg.scrollToHighlight) {
    setTimeout(function () { window.sard.scrollToHighlight(cfg.scrollToHighlight); }, 400);
  }
})();
`;
