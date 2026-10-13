/**
 * «سَرد+» layer injected into the reader WebView after the Sard script:
 * chapter progress bar, page-turn detection (→ haptics in RN, sounds made
 * here with WebAudio so no audio assets are needed), jump to a saved
 * position, drop-cap marker and night CSS toggle.
 *
 * Plain ES5 inside String.raw; must not contain backticks or "${".
 *
 * Posts: sard-page { dir }, sard-plus-excerpt { text }
 * API:   sardPlus.jump(p), sardPlus.setSound(kind, volume), sardPlus.setCss(css), sardPlus.excerpt()
 */
export const PLUS_READER_SCRIPT = String.raw`
(function () {
  if (!window.reader || window.sardPlus) { return; }
  var cfg = window.__SARD_PLUS__ || {};
  var chapterEl = reader.chapterElement || document.getElementById('LNReader-chapter');
  function post(type, data) { reader.post({ type: type, data: data }); }

  var styleEl = document.createElement('style');
  styleEl.id = 'sard-plus-css';
  styleEl.textContent = cfg.css || '';
  document.head.appendChild(styleEl);

  if (cfg.dropCap && chapterEl) {
    var first = chapterEl.querySelector('p');
    if (first) { first.classList.add('sard-first'); }
  }

  var bar = null;
  if (cfg.progressBar) {
    bar = document.createElement('div');
    bar.id = 'sard-progress';
    document.body.appendChild(bar);
  }
  function progress() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (document.body.classList.contains('page-reader')) {
      var w = chapterEl ? chapterEl.scrollWidth - window.innerWidth : 0;
      var x = Math.abs(window.scrollX || 0);
      var m = chapterEl && chapterEl.style.transform ? /-?\d+(\.\d+)?/.exec(chapterEl.style.transform) : null;
      if (m) { x = Math.abs(parseFloat(m[0])); }
      return w > 0 ? Math.min(1, x / w) : 0;
    }
    return h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 1;
  }
  function updateBar() { if (bar) { bar.style.width = (progress() * 100).toFixed(1) + '%'; } }

  /* ---------------------------------------------------------- sounds */
  var sound = cfg.sound || 'off';
  var volume = typeof cfg.volume === 'number' ? cfg.volume : 0.5;
  var ctx = null;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return null; }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') { ctx.resume(); }
    return ctx;
  }
  function play() {
    if (sound === 'off' || volume <= 0) { return; }
    var a = audio();
    if (!a) { return; }
    var now = a.currentTime;
    var gain = a.createGain();
    gain.connect(a.destination);
    if (sound === 'paper') {
      var len = Math.floor(a.sampleRate * 0.18);
      var buf = a.createBuffer(1, len, a.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); }
      var src = a.createBufferSource();
      src.buffer = buf;
      var bp = a.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
      src.connect(bp); bp.connect(gain);
      gain.gain.setValueAtTime(volume * 0.9, now);
      src.start(now);
    } else if (sound === 'click') {
      var o = a.createOscillator();
      o.type = 'square'; o.frequency.value = 1800;
      o.connect(gain);
      gain.gain.setValueAtTime(volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      o.start(now); o.stop(now + 0.035);
    } else {
      [880, 1320].forEach(function (f, k) {
        var o2 = a.createOscillator();
        o2.type = 'sine'; o2.frequency.value = f;
        var g2 = a.createGain();
        o2.connect(g2); g2.connect(a.destination);
        g2.gain.setValueAtTime(volume * (k ? 0.12 : 0.22), now);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        o2.start(now); o2.stop(now + 0.5);
      });
    }
  }

  /* ----------------------------------------------------- page turns */
  var lastY = window.scrollY, lastX = window.scrollX, lastT = 0, lastTransform = chapterEl ? chapterEl.style.transform : '';
  function turned(dir) {
    var t = Date.now();
    if (t - lastT < 250) { return; }
    lastT = t;
    play();
    post('sard-page', { dir: dir });
  }
  function onScrollEnd() {
    updateBar();
    var dy = window.scrollY - lastY, dx = window.scrollX - lastX;
    var page = window.innerHeight * 0.6;
    if (Math.abs(dy) >= page) { turned(dy > 0 ? 1 : -1); }
    else if (Math.abs(dx) >= window.innerWidth * 0.6) { turned(dx > 0 ? 1 : -1); }
    lastY = window.scrollY; lastX = window.scrollX;
  }
  var scrollTimer = 0;
  window.addEventListener('scroll', function () {
    updateBar();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(onScrollEnd, 120);
  }, { passive: true });
  if (chapterEl) {
    new MutationObserver(function () {
      var tr = chapterEl.style.transform;
      if (tr !== lastTransform) { lastTransform = tr; updateBar(); turned(1); }
    }).observe(chapterEl, { attributes: true, attributeFilter: ['style'] });
  }

  function jump(p) {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) { window.scrollTo({ top: Math.round(h * p), behavior: 'auto' }); }
    lastY = window.scrollY;
    updateBar();
  }

  function excerpt() {
    var nodes = chapterEl ? chapterEl.querySelectorAll('p, div') : [];
    var mid = window.innerHeight * 0.3;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.bottom > mid && (nodes[i].textContent || '').trim().length > 10) {
        return (nodes[i].textContent || '').trim().slice(0, 300);
      }
    }
    return '';
  }

  window.sardPlus = {
    jump: jump,
    setSound: function (kind, v) { sound = kind || 'off'; volume = typeof v === 'number' ? v : volume; },
    setCss: function (css) { styleEl.textContent = css || ''; },
    excerpt: function () { post('sard-plus-excerpt', { text: excerpt(), progress: progress() }); },
    progress: progress,
  };
  if (typeof cfg.jump === 'number') {
    setTimeout(function () { jump(cfg.jump); }, 350);
    setTimeout(function () { jump(cfg.jump); }, 900);
  }
  setTimeout(updateBar, 50);
})();
`;
