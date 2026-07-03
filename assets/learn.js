/* =========================================================================
   INEMA formato-curso-v2 — learn.js
   IIFE window.INEMA — camada de aprendizagem completa (LEARN-LAYER §2).
   Self-contained, sem deps, sem build, abre em file://.
   Idempotente (__core), re-entrant (S.bound), feature-detect por data-*.
   courseId default = detectado do <meta name="inema-course"> (cccache).
   Toda I/O no-throw; probe de storage -> modo efemero; anti-XSS textContent.
   ========================================================================= */
(function (window, document) {
  'use strict';
  if (window.INEMA && window.INEMA.__core) { return; }

  /* ---------- constantes ---------- */
  var SCHEMA_VERSION = 1;
  var PREFS_SCHEMA = 1;
  var PREFS_KEY = 'inema.prefs';
  var SWATCHES = ['yellow', 'green', 'blue', 'pink', 'doubt'];
  var THEMES = ['inema-dark', 'claro', 'sepia', 'foco', 'contraste'];
  var FONTS = ['inter', 'system', 'leitura'];
  var FONT_SCALES = [100, 112, 125];
  var LINE_WIDTHS = [60, 68, 75];
  var LEADINGS = [1.45, 1.7];
  var ACCENTS = {
    emerald: { h: 158, s: 64, l: 52 },
    blue:    { h: 213, s: 94, l: 68 },
    purple:  { h: 270, s: 95, l: 75 },
    amber:   { h: 43,  s: 96, l: 56 },
    teal:    { h: 172, s: 66, l: 50 },
    rose:    { h: 351, s: 95, l: 71 }
  };
  var FONT_FAMILIES = {
    inter:  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    leitura: "'Iowan Old Style', 'Palatino Linotype', Georgia, Cambria, 'Times New Roman', serif"
  };
  var CYCLE = { theme: THEMES, font: FONTS, fontScale: FONT_SCALES, lineWidth: LINE_WIDTHS, leading: LEADINGS, accent: Object.keys(ACCENTS) };
  var CORE_VARS = ['--bg', '--surface', '--surface-2', '--text', '--text-muted', '--border', '--primary', '--accent', '--accent-2', '--measure', '--lh-body', '--font-body', '--accent-h', '--accent-s', '--accent-l', '--inema-font-scale', '--fs-root'];

  /* ---------- estado runtime ---------- */
  var S = {
    courseId: 'cccache',
    ephemeral: false,
    mem: {},
    bound: false,
    inited: false,
    checks: {},
    journeyReturn: null,
    inertNodes: [],
    ckTimer: null,
    selTimer: null,
    noticeShown: false
  };
  var _manifest;              /* undefined = ainda nao lido; null = ausente */

  /* =======================================================================
     STORAGE — no-throw, defensivo, com espelho em memoria (efemero)
     ======================================================================= */
  function rawGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function rawSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function rawRemove(k) { try { window.localStorage.removeItem(k); } catch (e) { } }

  function probeStorage() {
    var probe = '__inema_probe__';
    try {
      window.localStorage.setItem(probe, '1');
      var ok = window.localStorage.getItem(probe) === '1';
      window.localStorage.removeItem(probe);
      S.ephemeral = !ok;
    } catch (e) {
      S.ephemeral = true;
    }
    return !S.ephemeral;
  }

  function safeJSON(str, fallback) {
    if (str == null) { return fallback; }
    try { var v = JSON.parse(str); return (v == null ? fallback : v); }
    catch (e) { return fallback; }
  }

  function storageGet(key, fallback) {
    if (S.ephemeral) { return (key in S.mem) ? S.mem[key] : fallback; }
    var raw = rawGet(key);
    if (raw == null) { return fallback; }
    try { var v = JSON.parse(raw); return (v == null ? fallback : v); }
    catch (e) {
      /* JSON corrompido = reset SO daquela chave (nao quebra a pagina) */
      if (window.console && console.warn) { console.warn('[INEMA] chave corrompida, resetando:', key); }
      rawRemove(key);
      return fallback;
    }
  }

  function storageSet(key, val) {
    S.mem[key] = val;                       /* espelho para leitura rapida */
    if (S.ephemeral) { return true; }
    var str;
    try { str = JSON.stringify(val); } catch (e) { return false; }
    if (!rawSet(key, str)) {
      /* provavel QuotaExceededError: mantem estado anterior, avisa */
      if (window.console && console.warn) { console.warn('[INEMA] armazenamento cheio ao gravar', key); }
      notify('Armazenamento cheio. Exporte sua jornada para nao perder o progresso.', 6000);
      return false;
    }
    return true;
  }

  function removeKey(key) { delete S.mem[key]; if (!S.ephemeral) { rawRemove(key); } }

  /* ---------- chaves namespaced por curso ---------- */
  function nk(sub) { return 'inema.' + S.courseId + '.' + sub; }
  function getRead() { return storageGet(nk('read'), {}); }
  function setRead(v) { return storageSet(nk('read'), v); }
  function getDoubts() { return storageGet(nk('doubts'), {}); }
  function setDoubts(v) { return storageSet(nk('doubts'), v); }
  function getNotes() { return storageGet(nk('notes'), {}); }
  function setNotes(v) { return storageSet(nk('notes'), v); }
  function getChecks() { return storageGet(nk('checks'), {}); }
  function setChecks(v) { return storageSet(nk('checks'), v); }
  function getMeta() { return storageGet(nk('meta'), {}); }
  function setMeta(v) { return storageSet(nk('meta'), v); }

  /* =======================================================================
     courseId
     ======================================================================= */
  function sanitizeId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '') || 'curso'; }
  function detectCourseId() {
    var meta = document.querySelector('meta[name="inema-course"]');
    if (meta && meta.getAttribute('content')) { return sanitizeId(meta.getAttribute('content')); }
    var parts = (location.pathname || '').split('/').filter(Boolean);
    var slug = parts.length ? parts[parts.length - 1].replace(/\.html?$/, '') : '';
    return sanitizeId(slug || 'curso');
  }

  /* =======================================================================
     MANIFESTO — tolerante a duas formas (canonica LEARN-LAYER e BUILD_SPEC)
     ======================================================================= */
  function normTrack(v) { return String(v == null ? '' : v).replace(/^trilha[:\-_]?/i, ''); }
  function normModule(v) { return String(v == null ? '' : v).replace(/^modulo[:\-_]?/i, ''); }

  function normalizeManifest(d) {
    if (!d || typeof d !== 'object') { return null; }
    var out = {
      course: (d.course && typeof d.course === 'object') ? (d.course.id || '') : (d.course || ''),
      tracks: []
    };
    var tracks = d.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i] || {};
      var nt = { n: normTrack(t.n != null ? t.n : t.id), title: t.title || '', modules: [] };
      var mods = t.modules || [];
      for (var j = 0; j < mods.length; j++) {
        var m = mods[j] || {};
        var topics = Array.isArray(m.topics) ? m.topics.length : (parseInt(m.topics, 10) || 0);
        nt.modules.push({ id: normModule(m.id), rawId: m.id, title: m.title || '', topics: topics, href: m.href || '' });
      }
      out.tracks.push(nt);
    }
    return out;
  }

  function getManifest() {
    if (_manifest !== undefined) { return _manifest; }
    var data = null;
    try {
      var tag = document.querySelector('script[type="application/json"][data-inema-manifest]') ||
                document.querySelector('script[data-inema-manifest]');
      if (tag) { data = safeJSON(tag.textContent, null); }
      if (!data && window.INEMA_MANIFEST) { data = window.INEMA_MANIFEST; }
    } catch (e) { data = null; }
    _manifest = data ? normalizeManifest(data) : null;
    return _manifest;
  }

  /* =======================================================================
     PROGRESSO — so derivado (booleans + manifesto/DOM)
     ======================================================================= */
  function keyParts(id) {
    var out = { module: null, track: null, topic: null };
    if (!id) { return out; }
    var hash = id.indexOf('#');
    var modPart = hash >= 0 ? id.slice(0, hash) : id;
    out.topic = hash >= 0 ? id.slice(hash + 1) : null;
    var m = /modulo-(\d+)-(\d+)/.exec(modPart);
    if (m) { out.track = m[1]; out.module = m[1] + '-' + m[2]; }
    return out;
  }

  function normalizeScope(raw) {
    if (!raw || raw === 'curso') { return 'curso'; }
    if (/^trilha/i.test(raw)) { return 'trilha:' + raw.replace(/^trilha[:\-_]?/i, ''); }
    if (/^modulo/i.test(raw)) { return 'modulo:' + raw.replace(/^modulo[:\-_]?/i, ''); }
    return raw;
  }

  function inScope(parts, scope) {
    if (scope === 'curso') { return true; }
    if (scope.indexOf('trilha:') === 0) { return parts.track === scope.slice(7); }
    if (scope.indexOf('modulo:') === 0) { return parts.module === scope.slice(7); }
    return false;
  }

  function manifestTotal(scope) {
    var man = getManifest();
    if (!man || !man.tracks) { return null; }
    var total = 0;
    for (var i = 0; i < man.tracks.length; i++) {
      var t = man.tracks[i];
      for (var j = 0; j < t.modules.length; j++) {
        var mod = t.modules[j];
        var count = mod.topics || 0;
        if (scope === 'curso') { total += count; }
        else if (scope.indexOf('trilha:') === 0) { if (String(t.n) === scope.slice(7)) { total += count; } }
        else if (scope.indexOf('modulo:') === 0) { if (String(mod.id) === scope.slice(7)) { total += count; } }
      }
    }
    return total;
  }

  function readDone(scope) {
    var read = getRead(); var n = 0;
    for (var k in read) {
      if (!read.hasOwnProperty(k) || read[k] !== true) { continue; }
      if (inScope(keyParts(k), scope)) { n++; }
    }
    return n;
  }

  function domTotals(scope) {
    var els = document.querySelectorAll('[data-inema-topic]');
    var read = getRead(); var done = 0, total = 0;
    for (var i = 0; i < els.length; i++) {
      var id = els[i].getAttribute('data-inema-topic');
      var parts = keyParts(id);
      /* fallback por ancestral quando o id nao carrega track/module */
      if (!parts.track) { var tr = els[i].closest && els[i].closest('[data-inema-track]'); if (tr) { parts.track = tr.getAttribute('data-inema-track'); } }
      if (!parts.module) { var md = els[i].closest && els[i].closest('[data-inema-module]'); if (md) { parts.module = md.getAttribute('data-inema-module'); } }
      if (inScope(parts, scope)) { total++; if (read[id] === true) { done++; } }
    }
    return { done: done, total: total };
  }

  function progress(scope) {
    scope = normalizeScope(scope || 'curso');
    var mTotal = manifestTotal(scope);
    var done, total;
    if (mTotal !== null) {
      done = readDone(scope); total = mTotal;
      if (done > total) { done = total; }             /* clampa contra chaves orfas */
    } else {
      var d = domTotals(scope); done = d.done; total = d.total;
    }
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    return { done: done, total: total, pct: pct };
  }

  /* =======================================================================
     MARCAR LIDO
     ======================================================================= */
  function isRead(id) { return getRead()[id] === true; }

  function markRead(id, bool) {
    if (!id) { return; }
    if (bool === undefined) { bool = true; }
    var read = getRead();
    if (bool) { read[id] = true; } else { delete read[id]; }
    setRead(read);
    paintReadControls(id);
    renderMeters();
    var sec = document.querySelector('[data-inema-topic="' + cssEsc(id) + '"]');
    saveCheckpoint(sec ? sec.id : null);
    celebrateIfComplete();
    var pr = progress('curso');
    emit('inema:read', { id: id, read: bool, progress: pr });
    emit('inema:progress', { kind: 'read', id: id, progress: pr });
    updateJourneyBadge();
  }

  function toggleIdFor(btn) {
    var sec = btn.closest ? btn.closest('[data-inema-topic]') : null;
    if (sec) { return sec.getAttribute('data-inema-topic'); }
    return btn.getAttribute('data-inema-read-toggle') || null;
  }

  function paintReadControls(id) {
    var read = getRead();
    var btns = document.querySelectorAll('[data-inema-read-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var bid = toggleIdFor(btn);
      if (id != null && bid !== id) { continue; }
      var on = read[bid] === true;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-read', on);
      var sec = btn.closest ? btn.closest('[data-inema-topic]') : null;
      if (sec) { sec.classList.toggle('is-read', on); }
      /* forma compacta: sem os 4 spans canonicos -> troca texto */
      var hasSpans = btn.querySelector('.inema-ico-todo, .inema-ico-done, .inema-label-todo, .inema-label-done');
      var slot = btn.querySelector('[data-inema-read-label]');
      if (!hasSpans) {
        if (slot) { slot.textContent = on ? 'Lido' : 'Marcar como lido'; }
        else if (!btn.querySelector('.inema-read-icon') && !btn.querySelector('.inema-read-label')) {
          btn.textContent = on ? 'Lido' : 'Marcar como lido';
        }
      }
      var ic = btn.querySelector('.inema-read-icon'); if (ic) { ic.textContent = on ? '●' : '○'; }
      var rl = btn.querySelector('.inema-read-label'); if (rl) { rl.textContent = on ? 'Lido' : 'Marcar como lido'; }
    }
  }

  function celebrateIfComplete() {
    var pr = progress('curso');
    var meta = getMeta();
    if (pr.total > 0 && pr.done >= pr.total) {
      if (!meta.completedAt) {
        meta.completedAt = new Date().toISOString();
        setMeta(meta);
        notify('Voce concluiu o curso inteiro. Excelente trabalho!', 5000);
      }
    } else if (meta.completedAt) {
      delete meta.completedAt; setMeta(meta);
    }
  }

  /* =======================================================================
     MEDIDORES
     ======================================================================= */
  function setSlot(root, selector, text) {
    var els = root.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) { els[i].textContent = text; }
  }

  function renderMeters() {
    var meters = document.querySelectorAll('[data-inema-meter]');
    for (var i = 0; i < meters.length; i++) {
      var m = meters[i];
      var scope = normalizeScope(m.getAttribute('data-inema-meter'));
      var pr = progress(scope);
      if (!m.getAttribute('role')) { m.setAttribute('role', 'progressbar'); }
      m.setAttribute('aria-valuemin', '0');
      m.setAttribute('aria-valuemax', '100');
      m.setAttribute('aria-valuenow', String(pr.pct));
      m.setAttribute('aria-valuetext', pr.done + ' de ' + pr.total + ' (' + pr.pct + '%)');
      m.style.setProperty('--inema-pct', pr.pct);
      m.style.setProperty('--inema-pct-num', pr.pct);
      setSlot(m, '[data-inema-meter-pct], .inema-meter-pct, .inema-ring__value', pr.pct + '%');
      setSlot(m, '[data-inema-meter-frac], .inema-meter-count', pr.done + ' de ' + pr.total);
      var fill = m.querySelector('[data-inema-meter-fill], .inema-bar__fill');
      if (fill) { fill.style.width = pr.pct + '%'; }
      var ring = m.querySelector('[data-inema-ring]');
      if (ring) {
        var r = parseFloat(ring.getAttribute('r')) || 16;
        var c = 2 * Math.PI * r;
        ring.style.strokeDasharray = c.toFixed(2);
        ring.style.strokeDashoffset = (c * (1 - pr.pct / 100)).toFixed(2);
      }
    }
  }

  /* =======================================================================
     DUVIDA
     ======================================================================= */
  function toggleDoubt(id) {
    if (!id) { return false; }
    var d = getDoubts(); var active;
    if (d[id]) { delete d[id]; active = false; }
    else { d[id] = { ts: Date.now(), resolved: false }; active = true; }
    setDoubts(d);
    paintDoubtControls(id);
    emit('inema:doubt', { id: id, active: active, kind: 'topic' });
    updateJourneyBadge();
    return active;
  }

  function setDoubtResolved(id, bool) {
    var d = getDoubts();
    if (!d[id]) { d[id] = { ts: Date.now(), resolved: false }; }
    d[id].resolved = !!bool;
    setDoubts(d);
    emit('inema:doubt', { id: id, resolved: !!bool, kind: 'topic' });
    updateJourneyBadge();
    return d[id];
  }

  function doubtIdFor(btn) {
    var sec = btn.closest ? btn.closest('[data-inema-topic]') : null;
    if (sec) { return sec.getAttribute('data-inema-topic'); }
    return btn.getAttribute('data-inema-doubt-toggle') || null;
  }

  function paintDoubtControls(id) {
    var d = getDoubts();
    var btns = document.querySelectorAll('[data-inema-doubt-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var bid = doubtIdFor(btn);
      if (id != null && bid !== id) { continue; }
      var on = !!d[bid];
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-doubt', on);
      var sec = btn.closest ? btn.closest('[data-inema-topic]') : null;
      if (sec) { sec.classList.toggle('has-doubt', on); }
    }
  }

  function listDoubts() {
    var out = [];
    var d = getDoubts();
    for (var k in d) {
      if (!d.hasOwnProperty(k)) { continue; }
      out.push({ kind: 'topic', id: k, ts: d[k].ts || 0, resolved: !!d[k].resolved, quote: null, note: null });
    }
    var notes = getNotes();
    for (var b in notes) {
      if (!notes.hasOwnProperty(b)) { continue; }
      var arr = notes[b] || [];
      for (var i = 0; i < arr.length; i++) {
        var rec = arr[i];
        if (rec.color === 'doubt' || (rec.tags && rec.tags.indexOf('duvida') >= 0)) {
          out.push({ kind: 'note', id: rec.id, ts: rec.ts || 0, resolved: false, quote: rec.quote, note: rec.note, blockId: b, color: rec.color });
        }
      }
    }
    out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return out;
  }

  /* =======================================================================
     NOTAS / HIGHLIGHT — TreeWalker, nunca surroundContents cego (#24)
     ======================================================================= */
  function genId() { return 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

  function cssEsc(s) {
    if (window.CSS && CSS.escape) { try { return CSS.escape(s); } catch (e) { } }
    return String(s).replace(/["\\\]\[\.#:>~+*^$|()=]/g, '\\$&');
  }

  function closestBlock(node) {
    var el = (node && node.nodeType === 3) ? node.parentNode : node;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-inema-block')) { return el; }
      el = el.parentNode;
    }
    return null;
  }

  function isInsideHl(n) {
    var p = n.parentNode;
    while (p && p !== document.body) {
      if (p.nodeType === 1 && p.classList && p.classList.contains('inema-hl')) { return true; }
      p = p.parentNode;
    }
    return false;
  }

  /* char offset (relativo ao textContent do bloco) de um ponto do range */
  function charOffsetOfPoint(block, node, offset) {
    var r = document.createRange();
    try { r.selectNodeContents(block); r.setEnd(node, offset); }
    catch (e) { return 0; }
    return r.toString().length;
  }

  function rangeOffsetsInBlock(block, range) {
    var start = charOffsetOfPoint(block, range.startContainer, range.startOffset);
    var end = charOffsetOfPoint(block, range.endContainer, range.endOffset);
    if (end < start) { var t = start; start = end; end = t; }
    return { start: start, end: end };
  }

  /* envolve [start,end) do bloco em <mark>, pedaco a pedaco por text node */
  function wrapRangeInBlock(block, start, end, rec) {
    if (!block || start == null || end == null || end <= start) { return false; }
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return isInsideHl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var pos = 0, node, pieces = [];
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      var nodeStart = pos, nodeEnd = pos + len;
      if (nodeEnd > start && nodeStart < end) {
        pieces.push({ node: node, s: Math.max(start, nodeStart) - nodeStart, e: Math.min(end, nodeEnd) - nodeStart });
      }
      pos = nodeEnd;
      if (pos >= end) { break; }
    }
    var applied = false;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var range = document.createRange();
      try {
        range.setStart(p.node, p.s);
        range.setEnd(p.node, p.e);
        var mark = makeMark(rec);
        range.surroundContents(mark);   /* subrange de UM text node = seguro */
        applied = true;
      } catch (err) { /* pula o pedaco problematico sem derrubar os outros */ }
    }
    return applied;
  }

  function makeMark(rec) {
    var mark = document.createElement('mark');
    mark.className = 'inema-hl inema-hl--' + rec.color;
    mark.setAttribute('data-inema-note', rec.id);
    mark.setAttribute('data-inema-color', rec.color);
    mark.setAttribute('data-hl', rec.color);
    if (rec.note != null) { mark.setAttribute('data-inema-hasnote', '1'); mark.setAttribute('data-has-note', 'true'); }
    return mark;
  }

  /* aplica um registro no DOM com fallback em camadas (§1.4) */
  function applyRecord(block, rec) {
    var applied = false;
    if (block && rec.anchor && rec.anchor.startOffset != null) {
      applied = wrapRangeInBlock(block, rec.anchor.startOffset, rec.anchor.endOffset, rec);
    }
    if (!applied && block && rec.quote) {
      var idx = block.textContent.indexOf(rec.quote);
      if (idx >= 0) {
        rec.anchor = rec.anchor || {};
        rec.anchor.blockId = block.getAttribute('data-inema-block');
        rec.anchor.startOffset = idx; rec.anchor.endOffset = idx + rec.quote.length;
        applied = wrapRangeInBlock(block, idx, idx + rec.quote.length, rec);
      }
    }
    if (!applied && rec.quote) {
      var main = document.querySelector('main') || document.body;
      var blocks = main.querySelectorAll('[data-inema-block]');
      for (var i = 0; i < blocks.length && !applied; i++) {
        var b = blocks[i];
        var j = b.textContent.indexOf(rec.quote);
        if (j >= 0) {
          rec.anchor = rec.anchor || {};
          rec.anchor.blockId = b.getAttribute('data-inema-block');
          rec.anchor.startOffset = j; rec.anchor.endOffset = j + rec.quote.length;
          applied = wrapRangeInBlock(b, j, j + rec.quote.length, rec);
        }
      }
    }
    rec.orphan = !applied;
    return applied;
  }

  function highlight(range, opts) {
    opts = opts || {};
    if (!range || range.collapsed) { return null; }
    var block = closestBlock(range.startContainer);
    if (!block) { return null; }
    var endBlock = closestBlock(range.endContainer);
    if (endBlock && endBlock !== block) {
      /* MVP: colapsa ao bloco inicial com aviso */
      notify('Selecao limitada a um paragrafo.', 3000);
      try {
        var clamp = document.createRange();
        clamp.setStart(range.startContainer, range.startOffset);
        clamp.setEnd(block, block.childNodes.length);
        range = clamp;
      } catch (e) { }
    }
    var blockId = block.getAttribute('data-inema-block');
    var offs = rangeOffsetsInBlock(block, range);
    var quote = range.toString();
    if (!quote) { return null; }
    var color = SWATCHES.indexOf(opts.color) >= 0 ? opts.color : 'yellow';
    var note = (opts.note != null && opts.note !== '') ? String(opts.note) : null;
    var tags = Array.isArray(opts.tags) ? opts.tags.slice() : [];
    if (color === 'doubt' && tags.indexOf('duvida') < 0) { tags.push('duvida'); }
    var rec = {
      id: genId(), ts: Date.now(), color: color, quote: quote, note: note,
      anchor: { blockId: blockId, startOffset: offs.start, endOffset: offs.end },
      tags: tags, orphan: false
    };
    var notes = getNotes();
    if (!notes[blockId]) { notes[blockId] = []; }
    notes[blockId].push(rec);
    applyRecord(block, rec);
    setNotes(notes);
    emit('inema:note', { id: rec.id, color: color, hasNote: note != null, blockId: blockId });
    if (color === 'doubt') { emit('inema:doubt', { id: rec.id, kind: 'note' }); updateJourneyBadge(); }
    return rec.id;
  }

  function findRec(id) {
    var notes = getNotes();
    for (var b in notes) {
      if (!notes.hasOwnProperty(b)) { continue; }
      var arr = notes[b] || [];
      for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { return { notes: notes, blockId: b, rec: arr[i], index: i }; } }
    }
    return null;
  }

  function promoteToNote(id, text) {
    var f = findRec(id); if (!f) { return false; }
    f.rec.note = (text != null && text !== '') ? String(text) : null;
    setNotes(f.notes);
    var marks = document.querySelectorAll('mark[data-inema-note="' + cssEsc(id) + '"]');
    for (var i = 0; i < marks.length; i++) {
      if (f.rec.note != null) { marks[i].setAttribute('data-inema-hasnote', '1'); marks[i].setAttribute('data-has-note', 'true'); }
    }
    emit('inema:note', { id: id, hasNote: f.rec.note != null, blockId: f.blockId });
    return true;
  }

  function editNote(id, patch) {
    patch = patch || {};
    var f = findRec(id); if (!f) { return false; }
    var rec = f.rec;
    if ('note' in patch) { rec.note = (patch.note != null && patch.note !== '') ? String(patch.note) : null; }
    if ('color' in patch && SWATCHES.indexOf(patch.color) >= 0) { rec.color = patch.color; }
    if ('tags' in patch && Array.isArray(patch.tags)) { rec.tags = patch.tags.slice(); }
    if (rec.color === 'doubt' && rec.tags.indexOf('duvida') < 0) { rec.tags.push('duvida'); }
    setNotes(f.notes);
    var marks = document.querySelectorAll('mark[data-inema-note="' + cssEsc(id) + '"]');
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i];
      mk.className = 'inema-hl inema-hl--' + rec.color;
      mk.setAttribute('data-inema-color', rec.color);
      mk.setAttribute('data-hl', rec.color);
      if (rec.note != null) { mk.setAttribute('data-inema-hasnote', '1'); mk.setAttribute('data-has-note', 'true'); }
      else { mk.removeAttribute('data-inema-hasnote'); mk.removeAttribute('data-has-note'); }
    }
    emit('inema:note', { id: id, color: rec.color, hasNote: rec.note != null, blockId: f.blockId });
    return true;
  }

  function removeNote(id) {
    var f = findRec(id); if (!f) { return false; }
    var arr = f.notes[f.blockId];
    arr.splice(f.index, 1);
    if (arr.length === 0) { delete f.notes[f.blockId]; }
    setNotes(f.notes);
    var marks = document.querySelectorAll('mark[data-inema-note="' + cssEsc(id) + '"]');
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i]; var parent = mk.parentNode;
      while (mk.firstChild) { parent.insertBefore(mk.firstChild, mk); }
      parent.removeChild(mk);
      if (parent.normalize) { parent.normalize(); }
    }
    emit('inema:note', { id: id, removed: true, blockId: f.blockId });
    updateJourneyBadge();
    return true;
  }

  function renderHighlights(container) {
    var notes = getNotes(); var changed = false;
    for (var b in notes) {
      if (!notes.hasOwnProperty(b)) { continue; }
      var arr = notes[b] || [];
      for (var i = 0; i < arr.length; i++) {
        var rec = arr[i];
        if (document.querySelector('mark[data-inema-note="' + cssEsc(rec.id) + '"]')) { continue; }
        var block = document.querySelector('[data-inema-block="' + cssEsc(b) + '"]');
        var was = rec.orphan;
        applyRecord(block, rec);
        if (rec.orphan !== was) { changed = true; }
      }
    }
    if (changed) { setNotes(notes); }
  }

  /* =======================================================================
     POPOVER DE SELECAO
     ======================================================================= */
  function ensurePopover() {
    var pop = document.querySelector('.inema-selpop');
    if (pop) { return pop; }
    pop = el('div', { className: 'inema-selpop', role: 'toolbar', 'aria-label': 'Grifar ou anotar' });
    var swatchLabels = { yellow: '', green: '', blue: '', pink: '', doubt: '?' };
    SWATCHES.forEach(function (sw) {
      pop.appendChild(el('button', { type: 'button', 'data-inema-swatch': sw, 'data-hl': sw, title: sw === 'doubt' ? 'Marcar duvida' : ('Grifar ' + sw) }, swatchLabels[sw] || ''));
    });
    pop.appendChild(el('span', { className: 'inema-selpop__sep' }));
    pop.appendChild(el('button', { type: 'button', 'data-inema-act': 'note', className: 'inema-act', title: 'Adicionar nota' }, 'Nota'));
    pop.appendChild(el('button', { type: 'button', 'data-inema-act': 'copy', className: 'inema-act', title: 'Copiar' }, 'Copiar'));
    document.body.appendChild(pop);
    return pop;
  }

  function hidePopover() {
    var pop = document.querySelector('.inema-selpop');
    if (pop) { pop.setAttribute('data-open', 'false'); pop.style.display = 'none'; }
  }

  function positionPopover(rect) {
    var pop = ensurePopover();
    pop.style.display = 'flex';
    pop.setAttribute('data-open', 'true');
    var pw = pop.offsetWidth || 220, ph = pop.offsetHeight || 40;
    var sx = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
    var left = sx + rect.left + rect.width / 2 - pw / 2;
    var top = sy + rect.top - ph - 8;
    var maxLeft = sx + document.documentElement.clientWidth - pw - 6;
    if (left < sx + 6) { left = sx + 6; }
    if (left > maxLeft) { left = maxLeft; }
    if (top < sy + 6) { top = sy + rect.bottom + 8; }   /* transbordou por cima -> vai pra baixo */
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function onSelectionSettled() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hidePopover(); return; }
    var range = sel.getRangeAt(0);
    var block = closestBlock(range.startContainer);
    if (!block || !range.toString().trim()) { hidePopover(); return; }
    var rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { hidePopover(); return; }
    positionPopover(rect);
  }

  function currentRange() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { return null; }
    return sel.getRangeAt(0);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { notify('Copiado.', 1500); }, function () { copyFallback(text); });
    } else { copyFallback(text); }
  }
  function copyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'absolute'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      notify('Copiado.', 1500);
    } catch (e) { }
  }

  /* mini-menu ao clicar numa marca existente */
  function openMarkMenu(mark) {
    closeMarkMenu();
    var id = mark.getAttribute('data-inema-note');
    var menu = el('div', { className: 'inema-marknote' });
    menu.appendChild(el('button', { type: 'button', 'data-mark-act': 'note' }, 'Nota'));
    menu.appendChild(el('button', { type: 'button', 'data-mark-act': 'remove' }, 'Excluir'));
    menu.setAttribute('data-mark-id', id);
    document.body.appendChild(menu);
    var rect = mark.getBoundingClientRect();
    var sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    menu.style.left = (sx + rect.left) + 'px';
    menu.style.top = (sy + rect.bottom + 6) + 'px';
  }
  function closeMarkMenu() { var m = document.querySelector('.inema-marknote'); if (m) { m.parentNode.removeChild(m); } }

  /* =======================================================================
     JORNADA — role=dialog, foco preso, ESC, inert no resto (#25)
     ======================================================================= */
  function ensureJourney() {
    var ov = document.querySelector('.inema-journey-overlay');
    if (ov) { return ov; }
    ov = el('div', { className: 'inema-journey-overlay', 'aria-hidden': 'true' });
    var panel = el('div', { className: 'inema-journey', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'inema-journey-title' });
    var head = el('div', { className: 'inema-journey-head' });
    head.appendChild(el('h2', { className: 'inema-journey-title', id: 'inema-journey-title' }, 'Minha jornada'));
    head.appendChild(el('button', { type: 'button', className: 'inema-journey-close', 'aria-label': 'Fechar', title: 'Fechar (Esc)' }, '×'));
    var body = el('div', { className: 'inema-journey-body' });
    panel.appendChild(head); panel.appendChild(body);
    ov.appendChild(panel);
    document.body.appendChild(ov);
    /* fechar ao clicar no backdrop */
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) { closeJourney(); } });
    return ov;
  }

  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
  }

  function journeyKeydown(e) {
    var ov = document.querySelector('.inema-journey-overlay');
    if (!ov || ov.style.display === 'none') { return; }
    if (e.key === 'Escape') { e.preventDefault(); closeJourney(); return; }
    if (e.key === 'Tab') {
      var f = focusables(ov);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function setInert(on, keep) {
    if (on) {
      S.inertNodes = [];
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        var node = kids[i];
        if (node === keep) { continue; }
        var hadAriaHidden = node.getAttribute('aria-hidden');
        var hadInert = node.hasAttribute('inert');
        S.inertNodes.push({ node: node, hadAriaHidden: hadAriaHidden, hadInert: hadInert });
        node.setAttribute('aria-hidden', 'true');
        try { node.inert = true; } catch (e) { }
        node.setAttribute('inert', '');
      }
    } else {
      for (var j = 0; j < S.inertNodes.length; j++) {
        var rec = S.inertNodes[j];
        if (rec.hadAriaHidden == null) { rec.node.removeAttribute('aria-hidden'); } else { rec.node.setAttribute('aria-hidden', rec.hadAriaHidden); }
        if (!rec.hadInert) { try { rec.node.inert = false; } catch (e) { } rec.node.removeAttribute('inert'); }
      }
      S.inertNodes = [];
    }
  }

  function openJourney() {
    S.journeyReturn = document.activeElement;
    var ov = ensureJourney();
    renderJourney(ov.querySelector('.inema-journey-body'));
    ov.style.display = 'flex';
    ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setInert(true, ov);
    document.addEventListener('keydown', journeyKeydown, true);
    var close = ov.querySelector('.inema-journey-close');
    if (close) { close.focus(); }
  }

  function closeJourney() {
    var ov = document.querySelector('.inema-journey-overlay');
    if (!ov) { return; }
    ov.style.display = 'none';
    ov.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setInert(false);
    document.removeEventListener('keydown', journeyKeydown, true);
    if (S.journeyReturn && S.journeyReturn.focus) { try { S.journeyReturn.focus(); } catch (e) { } }
    S.journeyReturn = null;
  }

  function meterRow(label, scope, href) {
    var pr = progress(scope);
    var item = el('li', { className: 'inema-journey-item' });
    var meter = el('div', { className: 'inema-journey-meter inema-meter' });
    var top = el('div', { style: 'display:flex;justify-content:space-between;gap:.5rem;margin-bottom:.25rem;font-size:.85rem' });
    var labelEl = href ? el('a', { href: href }, label) : el('span', {}, label);
    top.appendChild(labelEl);
    top.appendChild(el('span', { className: 'inema-meter-count' }, pr.done + ' de ' + pr.total + ' (' + pr.pct + '%)'));
    var bar = el('div', { className: 'inema-bar' });
    var fill = el('div', { className: 'inema-bar__fill' }); fill.style.width = pr.pct + '%';
    bar.appendChild(fill);
    meter.appendChild(top); meter.appendChild(bar);
    item.appendChild(meter);
    return item;
  }

  function renderJourney(mount) {
    if (!mount) { return; }
    mount.textContent = '';
    var man = getManifest();

    /* --- Progresso --- */
    var secP = el('div', { className: 'inema-journey-sec' });
    secP.appendChild(el('h3', {}, 'Seu progresso'));
    var listP = el('ul', { className: 'inema-journey-list' });
    listP.appendChild(meterRow('Curso inteiro', 'curso'));
    if (man && man.tracks) {
      man.tracks.forEach(function (t) {
        listP.appendChild(meterRow('Trilha ' + t.n + ' — ' + (t.title || ''), 'trilha:' + t.n));
        t.modules.forEach(function (mod) {
          listP.appendChild(meterRow('  ' + (mod.title || ('Modulo ' + mod.id)), 'modulo:' + mod.id, mod.href || null));
        });
      });
    } else {
      var tracks = document.querySelectorAll('[data-inema-track]');
      var seenT = {};
      for (var i = 0; i < tracks.length; i++) { var n = tracks[i].getAttribute('data-inema-track'); if (n && !seenT[n]) { seenT[n] = 1; listP.appendChild(meterRow('Trilha ' + n, 'trilha:' + n)); } }
      var mods = document.querySelectorAll('[data-inema-module]');
      var seenM = {};
      for (var k = 0; k < mods.length; k++) { var mid = mods[k].getAttribute('data-inema-module'); if (mid && !seenM[mid]) { seenM[mid] = 1; listP.appendChild(meterRow('Modulo ' + mid, 'modulo:' + mid)); } }
    }
    secP.appendChild(listP);
    mount.appendChild(secP);

    /* --- Continuar de onde parei --- */
    var meta = getMeta();
    if (meta.lastTopicAnchor || meta.lastScroll) {
      var secR = el('div', { className: 'inema-journey-sec' });
      secR.appendChild(el('h3', {}, 'Continuar de onde parei'));
      var row = el('div', { className: 'inema-journey-row' });
      var btnR = el('button', { type: 'button', className: 'inema-journey-btn inema-journey-btn--primary' }, 'Continuar');
      btnR.addEventListener('click', function () { closeJourney(); resume(); });
      row.appendChild(btnR);
      if (meta.lastModuleHref) { row.appendChild(el('span', { className: 'inema-journey-empty' }, 'Ultima pagina: ' + meta.lastModuleHref)); }
      secR.appendChild(row);
      mount.appendChild(secR);
    }

    /* --- Duvidas --- */
    var doubts = listDoubts();
    var secD = el('div', { className: 'inema-journey-sec' });
    var headD = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:.5rem' });
    headD.appendChild(el('h3', { style: 'margin:0' }, 'Minhas duvidas (' + doubts.length + ')'));
    var onlyOpen = el('label', { className: 'inema-journey-check' });
    var chk = el('input', { type: 'checkbox' });
    onlyOpen.appendChild(chk); onlyOpen.appendChild(el('span', {}, 'so nao resolvidas'));
    headD.appendChild(onlyOpen);
    secD.appendChild(headD);
    var listD = el('ul', { className: 'inema-journey-list', style: 'margin-top:.6rem' });
    function renderDoubts() {
      listD.textContent = '';
      var shown = 0;
      doubts.forEach(function (dt) {
        if (chk.checked && dt.resolved) { return; }
        shown++;
        var it = el('li', { className: 'inema-journey-note' + (dt.resolved ? ' inema-jn-resolved' : '') });
        if (dt.quote) { it.appendChild(el('div', { className: 'inema-jn-quote' }, dt.quote)); }
        var line = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:.5rem' });
        var label = dt.kind === 'topic' ? ('Topico: ' + dt.id) : (dt.note || 'Duvida no trecho');
        var back;
        if (dt.kind === 'topic') { back = el('a', { href: '#' + topicAnchorId(dt.id) }, label); back.addEventListener('click', function () { closeJourney(); }); }
        else { back = el('span', { className: 'inema-jn-text' }, label); }
        line.appendChild(back);
        if (dt.kind === 'topic') {
          var rBtn = el('button', { type: 'button', className: 'inema-journey-btn' }, dt.resolved ? 'Reabrir' : 'Resolver');
          rBtn.addEventListener('click', function () { setDoubtResolved(dt.id, !dt.resolved); dt.resolved = !dt.resolved; renderDoubts(); });
          line.appendChild(rBtn);
        }
        it.appendChild(line);
        listD.appendChild(it);
      });
      if (!shown) { listD.appendChild(el('li', { className: 'inema-journey-empty' }, 'Nenhuma duvida por aqui.')); }
    }
    chk.addEventListener('change', renderDoubts);
    renderDoubts();
    secD.appendChild(listD);
    mount.appendChild(secD);

    /* --- Notas --- */
    var allNotes = flatNotes();
    var secN = el('div', { className: 'inema-journey-sec' });
    secN.appendChild(el('h3', {}, 'Minhas notas (' + allNotes.length + ')'));
    var listN = el('ul', { className: 'inema-journey-list' });
    if (!allNotes.length) { listN.appendChild(el('li', { className: 'inema-journey-empty' }, 'Selecione um trecho no texto para grifar ou anotar.')); }
    allNotes.forEach(function (rec) {
      var it = el('li', { className: 'inema-journey-note' });
      if (rec.quote) { it.appendChild(el('div', { className: 'inema-jn-quote' }, rec.quote)); }
      if (rec.note) { it.appendChild(el('div', { className: 'inema-jn-text' }, rec.note)); }
      var line = el('div', { className: 'inema-journey-row' });
      line.appendChild(el('span', { className: 'inema-journey-empty' }, 'cor: ' + rec.color));
      var del = el('button', { type: 'button', className: 'inema-journey-btn inema-journey-btn--danger' }, 'Excluir');
      del.addEventListener('click', function () { removeNote(rec.id); renderJourney(mount); });
      line.appendChild(del);
      it.appendChild(line);
      listN.appendChild(it);
    });
    secN.appendChild(listN);
    mount.appendChild(secN);

    /* --- Export / Import / Reset --- */
    var secX = el('div', { className: 'inema-journey-sec' });
    secX.appendChild(el('h3', {}, 'Backup da jornada'));
    var rowX = el('div', { className: 'inema-journey-row' });
    var expBtn = el('button', { type: 'button', className: 'inema-journey-btn' }, 'Exportar .json');
    expBtn.addEventListener('click', function () { downloadJSON(); });
    var impBtn = el('button', { type: 'button', className: 'inema-journey-btn' }, 'Importar .json');
    var fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    impBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0]; if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () {
        var res = importJSON(String(reader.result), { mode: 'merge' });
        if (res.ok) { notify('Importado: ' + res.applied + ' itens.', 3000); renderJourney(mount); }
        else { notify('Arquivo invalido: ' + (res.errors[0] || 'erro'), 4000); }
      };
      reader.readAsText(file);
    });
    var resetBtn = el('button', { type: 'button', className: 'inema-journey-btn inema-journey-btn--danger' }, 'Zerar');
    resetBtn.addEventListener('click', function () {
      if (window.confirm('Apagar TODO o seu progresso, duvidas e notas deste curso?')) {
        resetCourse(); rehydrateAll(); renderMeters(); updateJourneyBadge(); renderJourney(mount);
        notify('Jornada zerada.', 2500);
      }
    });
    rowX.appendChild(expBtn); rowX.appendChild(impBtn); rowX.appendChild(fileInput); rowX.appendChild(resetBtn);
    secX.appendChild(rowX);
    mount.appendChild(secX);
  }

  function flatNotes() {
    var out = []; var notes = getNotes();
    for (var b in notes) { if (!notes.hasOwnProperty(b)) { continue; } (notes[b] || []).forEach(function (r) { out.push(r); }); }
    out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return out;
  }

  function topicAnchorId(topicKey) {
    var sec = document.querySelector('[data-inema-topic="' + cssEsc(topicKey) + '"]');
    if (sec && sec.id) { return sec.id; }
    var kp = keyParts(topicKey);
    return kp.topic || topicKey;
  }

  /* =======================================================================
     CONTINUAR DE ONDE PAREI
     ======================================================================= */
  function topmostVisibleTopic() {
    var els = document.querySelectorAll('[data-inema-topic]');
    var best = null, bestTop = Infinity;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.bottom > 0 && r.top < bestTop) { bestTop = r.top; best = els[i]; }
    }
    return best ? (best.id || best.getAttribute('data-inema-topic')) : null;
  }

  function reducedMotion() {
    var p = getPrefs();
    if (p.reducedMotionOverride === true) { return true; }
    if (p.reducedMotionOverride === false) { return false; }
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function openAncestors(el2) {
    var p = el2;
    while (p && p !== document.body) {
      if (p.tagName === 'DETAILS') { p.open = true; }
      if (p.classList && p.classList.contains('topic-explanation')) { p.classList.add('active'); }
      p = p.parentNode;
    }
  }

  function saveCheckpoint(anchorId) {
    clearTimeout(S.ckTimer);
    S.ckTimer = setTimeout(function () {
      var meta = getMeta();
      var anchor = anchorId || topmostVisibleTopic() || meta.lastTopicAnchor || null;
      meta.lastTopicAnchor = anchor;
      meta.lastModuleHref = (location.pathname.split('/').pop() || location.href);
      meta.lastScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
      meta.lastVisitedTs = Date.now();
      setMeta(meta);
    }, 400);
  }

  function resume() {
    var meta = getMeta();
    var target = null;
    if (meta.lastTopicAnchor) {
      target = document.getElementById(meta.lastTopicAnchor) ||
               document.querySelector('[data-inema-topic$="#' + meta.lastTopicAnchor + '"]') ||
               document.querySelector('[data-inema-topic="' + cssEsc(meta.lastTopicAnchor) + '"]');
    }
    if (target) {
      openAncestors(target);
      try { target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }
      catch (e) { target.scrollIntoView(); }
      return true;
    }
    if (meta.lastScroll) { window.scrollTo(0, meta.lastScroll); return true; }
    return false;
  }

  /* =======================================================================
     EXPORT / IMPORT — round-trip lossless, merge nao-destrutivo (#22/#24)
     ======================================================================= */
  function exportState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      courseId: S.courseId,
      exportedAt: new Date().toISOString(),
      read: getRead(),
      doubts: getDoubts(),
      notes: getNotes(),
      checks: getChecks(),
      meta: getMeta()
    };
  }
  function exportJSON() { return JSON.stringify(exportState(), null, 2); }

  /* migrate puro: preserva campos desconhecidos (forward-compat), completa faltantes */
  function migrate(state) {
    state = (state && typeof state === 'object') ? state : {};
    var out = {};
    for (var k in state) { if (state.hasOwnProperty(k)) { out[k] = state[k]; } }
    out.schemaVersion = SCHEMA_VERSION;
    ['read', 'doubts', 'notes', 'checks', 'meta'].forEach(function (key) {
      if (!out[key] || typeof out[key] !== 'object') { out[key] = {}; }
    });
    return out;
  }

  function countAll(st) {
    var n = 0, key, kk;
    for (key in st.read) { if (st.read[key] === true) { n++; } }
    for (key in st.doubts) { n++; }
    for (key in st.checks) { n++; }
    for (kk in st.notes) { n += (st.notes[kk] || []).length; }
    return n;
  }

  function importJSON(text, opts) {
    opts = opts || {};
    var mode = opts.mode || 'merge';
    var result = { ok: false, applied: 0, skipped: 0, errors: [] };
    var parsed;
    try { parsed = (typeof text === 'string') ? JSON.parse(text) : text; }
    catch (e) { result.errors.push('JSON invalido.'); return result; }
    if (!parsed || typeof parsed !== 'object') { result.errors.push('Formato invalido.'); return result; }

    var sv = parsed.schemaVersion;                 /* validado em var temporaria */
    if (sv === undefined || sv === null) { result.errors.push('schemaVersion ausente.'); return result; }
    if (sv > SCHEMA_VERSION) { result.errors.push('schemaVersion ' + sv + ' maior que a suportada; migrando (campos desconhecidos preservados).'); }

    var incoming = migrate(parsed);                /* nao muta o estado ainda */

    if (mode === 'replace') {
      if (!opts.__confirmed && !window.confirm('Substituir TODA a sua jornada por este arquivo?')) {
        result.errors.push('Cancelado pelo usuario.'); return result;
      }
      setRead(incoming.read); setDoubts(incoming.doubts); setNotes(incoming.notes);
      setChecks(incoming.checks); setMeta(incoming.meta);
      result.applied = countAll(incoming);
    } else {
      var r, d, c, b;
      var read = getRead();
      for (r in incoming.read) { if (incoming.read[r] === true) { if (read[r] !== true) { read[r] = true; result.applied++; } else { result.skipped++; } } }
      setRead(read);
      var doubts = getDoubts();
      for (d in incoming.doubts) { if (!doubts[d]) { doubts[d] = incoming.doubts[d]; result.applied++; } else { result.skipped++; } }
      setDoubts(doubts);
      var checks = getChecks();
      for (c in incoming.checks) { if (!checks[c]) { checks[c] = incoming.checks[c]; result.applied++; } else { result.skipped++; } }
      setChecks(checks);
      var notes = getNotes();
      for (b in incoming.notes) {
        var arr = notes[b] || (notes[b] = []);
        var seen = {}; arr.forEach(function (x) { seen[x.id] = 1; });
        (incoming.notes[b] || []).forEach(function (rec) { if (!seen[rec.id]) { arr.push(rec); result.applied++; } else { result.skipped++; } });
      }
      setNotes(notes);
      var meta = getMeta();
      if ((incoming.meta.lastVisitedTs || 0) > (meta.lastVisitedTs || 0)) { setMeta(incoming.meta); }
    }
    result.ok = true;
    rehydrateAll(); renderMeters(); updateJourneyBadge();
    return result;
  }

  function downloadJSON() {
    var str = exportJSON();
    var name = 'inema-' + S.courseId + '-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      var blob = new Blob([str], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: name });
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch (e) {
      try {
        var a2 = el('a', { href: 'data:application/json;charset=utf-8,' + encodeURIComponent(str), download: name });
        document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
      } catch (e2) { notify('Nao foi possivel baixar o arquivo.', 4000); }
    }
  }

  function resetCourse() { ['read', 'doubts', 'notes', 'checks', 'meta'].forEach(function (k) { removeKey(nk(k)); }); }

  /* =======================================================================
     PREFERENCIAS / TEMA
     ======================================================================= */
  function legacyTheme() {
    try { if (rawGet('theme') === 'light') { return 'claro'; } } catch (e) { }
    return 'inema-dark';
  }

  function migratePrefs(p) {
    p = (p && typeof p === 'object') ? p : {};
    return {
      schemaVersion: PREFS_SCHEMA,
      theme: THEMES.indexOf(p.theme) >= 0 ? p.theme : legacyTheme(),
      font: FONTS.indexOf(p.font) >= 0 ? p.font : 'inter',
      fontScale: FONT_SCALES.indexOf(parseInt(p.fontScale, 10)) >= 0 ? parseInt(p.fontScale, 10) : 100,
      lineWidth: LINE_WIDTHS.indexOf(parseInt(p.lineWidth, 10)) >= 0 ? parseInt(p.lineWidth, 10) : 68,
      leading: LEADINGS.indexOf(parseFloat(p.leading)) >= 0 ? parseFloat(p.leading) : 1.7,
      accent: ACCENTS[p.accent] ? p.accent : 'emerald',
      reducedMotionOverride: (p.reducedMotionOverride === true || p.reducedMotionOverride === false) ? p.reducedMotionOverride : null
    };
  }

  function getPrefs() { return migratePrefs(storageGet(PREFS_KEY, null)); }

  function savePrefs(p) {
    storageSet(PREFS_KEY, p);
    /* re-escreve o theme legado do v1 (dark/light) para paginas que so leem essa chave */
    if (!S.ephemeral) { rawSet('theme', p.theme === 'claro' ? 'light' : 'dark'); }
    S.mem['theme'] = p.theme === 'claro' ? 'light' : 'dark';
  }

  function applyPrefs() {
    var p = getPrefs();
    var d = document.documentElement;
    var dark = p.theme !== 'claro';
    if (dark) { d.classList.add('dark'); } else { d.classList.remove('dark'); }
    if (p.theme && p.theme !== 'inema-dark' && p.theme !== 'claro') { d.setAttribute('data-theme', p.theme); }
    else { d.removeAttribute('data-theme'); }
    d.style.colorScheme = (p.theme === 'claro' || p.theme === 'sepia') ? 'light' : 'dark';
    d.setAttribute('data-font', p.font);
    d.style.setProperty('--font-body', FONT_FAMILIES[p.font] || FONT_FAMILIES.inter);
    d.style.setProperty('--inema-font-scale', p.fontScale);
    d.style.setProperty('--fs-root', p.fontScale + '%');
    d.style.fontSize = p.fontScale + '%';
    d.style.setProperty('--measure', p.lineWidth + 'ch');
    d.style.setProperty('--lh-body', p.leading);
    d.setAttribute('data-accent', p.accent);
    var a = ACCENTS[p.accent] || ACCENTS.emerald;
    d.style.setProperty('--accent-h', a.h);
    d.style.setProperty('--accent-s', a.s + '%');
    d.style.setProperty('--accent-l', a.l + '%');
    d.style.setProperty('--accent', 'hsl(' + a.h + ' ' + a.s + '% ' + a.l + '%)');
    if (p.reducedMotionOverride === true) { d.setAttribute('data-reduce-motion', '1'); }
    else { d.removeAttribute('data-reduce-motion'); }
    return p;
  }

  function setPref(key, val) {
    var p = getPrefs();
    if (key === 'fontScale' || key === 'lineWidth') { val = parseInt(val, 10); }
    else if (key === 'leading') { val = parseFloat(val); }
    else if (key === 'reducedMotionOverride') { val = (val === true || val === 'true') ? true : (val === false || val === 'false') ? false : null; }
    p[key] = val;
    p = migratePrefs(p);
    savePrefs(p);
    applyPrefs();
    syncAppearanceUI();
    emit('inema:progress', { kind: 'prefs', prefs: p });
    return p;
  }

  function cyclePref(key) {
    var list = CYCLE[key]; if (!list) { return getPrefs(); }
    var p = getPrefs();
    var i = list.indexOf(p[key]);
    return setPref(key, list[(i + 1) % list.length]);
  }

  function reflect(selector, attr, active) {
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) {
      var on = els[i].getAttribute(attr) === active;
      els[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      els[i].classList.toggle('is-active', on);
    }
  }

  function syncAppearanceUI() {
    var p = getPrefs();
    reflect('[data-inema-set-theme]', 'data-inema-set-theme', p.theme);
    reflect('[data-inema-set-font]', 'data-inema-set-font', p.font);
    reflect('[data-inema-set-fontscale]', 'data-inema-set-fontscale', String(p.fontScale));
    reflect('[data-inema-set-linewidth]', 'data-inema-set-linewidth', String(p.lineWidth));
    reflect('[data-inema-set-leading]', 'data-inema-set-leading', String(p.leading));
    reflect('[data-inema-set-accent]', 'data-inema-set-accent', p.accent);
    /* mantem os icones sol/lua do v1 coerentes */
    var di = document.getElementById('theme-toggle-dark-icon');
    var li = document.getElementById('theme-toggle-light-icon');
    var dark = p.theme !== 'claro';
    if (di && li) {
      if (dark) { li.classList.remove('hidden'); di.classList.add('hidden'); }
      else { di.classList.remove('hidden'); li.classList.add('hidden'); }
    }
  }

  /* =======================================================================
     CHECAGEM LEVE
     ======================================================================= */
  function registerCheck(id, def) {
    S.checks[id] = def || {};
    var saved = getChecks()[id];
    if (saved) { paintCheck(id, saved.choice); }
  }

  function submitCheck(id, choice) {
    var def = S.checks[id] || {};
    var correct = (def.answer != null) ? (String(def.answer) === String(choice)) : false;
    var checks = getChecks();
    checks[id] = { choice: choice, correct: correct, ts: Date.now() };
    setChecks(checks);
    paintCheck(id, choice);
    emit('inema:progress', { kind: 'check', id: id });
    return { correct: correct };
  }

  function paintCheck(id, choice) {
    var box = document.querySelector('[data-inema-check="' + cssEsc(id) + '"]');
    if (!box) { return; }
    var def = S.checks[id] || {};
    var opts = box.querySelectorAll('[data-inema-check-option]');
    for (var i = 0; i < opts.length; i++) {
      var val = opts[i].getAttribute('data-inema-check-option');
      opts[i].classList.remove('is-correct', 'is-wrong', 'is-chosen');
      if (choice == null) { continue; }
      if (String(val) === String(choice)) { opts[i].classList.add('is-chosen'); }
      if (def.answer != null && String(val) === String(def.answer)) { opts[i].classList.add('is-correct'); }
      else if (String(val) === String(choice)) { opts[i].classList.add('is-wrong'); }
    }
    var fb = box.querySelector('[data-inema-check-feedback]');
    if (fb && choice != null && def.explain) {
      var msg = def.explain[choice];
      if (msg == null) { msg = def.explain[String(choice)]; }
      fb.textContent = msg || '';
    }
  }

  /* =======================================================================
     TOC + scrollspy
     ======================================================================= */
  function setupTOC() {
    var toc = document.querySelector('[data-inema-toc]');
    var counter = document.querySelector('[data-inema-section-counter]');
    var topics = Array.prototype.slice.call(document.querySelectorAll('[data-inema-topic]'));
    if (!topics.length) { return; }
    var total = topics.length;
    setSlotAll('.inema-toc-total', total);
    if (!window.IntersectionObserver) { return; }
    var links = toc ? Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]')) : [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        var id = en.target.id;
        var pos = topics.indexOf(en.target) + 1;
        setSlotAll('.inema-toc-pos', pos);
        if (counter) { counter.textContent = 'Secao ' + pos + ' de ' + total; }
        links.forEach(function (a) {
          var on = a.getAttribute('href') === ('#' + id);
          a.classList.toggle('is-active', on);
          if (on) { a.setAttribute('aria-current', 'true'); } else { a.removeAttribute('aria-current'); }
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    topics.forEach(function (t) { io.observe(t); });
  }
  function setSlotAll(sel, text) { var e = document.querySelectorAll(sel); for (var i = 0; i < e.length; i++) { e[i].textContent = text; } }

  /* =======================================================================
     BADGE DA JORNADA
     ======================================================================= */
  function updateJourneyBadge() {
    var pr = progress('curso');
    var openDoubts = 0;
    listDoubts().forEach(function (d) { if (!d.resolved) { openDoubts++; } });
    var badges = document.querySelectorAll('[data-inema-journey-badge], .inema-journey-badge');
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      b.textContent = pr.pct + '%';
      b.setAttribute('data-count', pr.done);
      b.setAttribute('data-doubts', openDoubts);
      b.classList.toggle('hidden', pr.done === 0 && openDoubts === 0);
    }
  }

  /* =======================================================================
     AVISO / TOAST
     ======================================================================= */
  function notify(msg, ms) {
    try {
      var t = el('div', { className: 'inema-toast', role: 'status', 'aria-live': 'polite' });
      t.appendChild(el('span', {}, msg));
      var close = el('button', { type: 'button', 'aria-label': 'Fechar' }, '×');
      close.addEventListener('click', function () { if (t.parentNode) { t.parentNode.removeChild(t); } });
      t.appendChild(close);
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, ms || 3500);
    } catch (e) { }
  }

  function showEphemeralNotice() {
    if (S.noticeShown) { return; }
    S.noticeShown = true;
    notify('Modo temporario: seu progresso vale so nesta sessao (armazenamento indisponivel). Exporte a jornada para guardar.', 6000);
  }

  /* =======================================================================
     HELPERS DOM
     ======================================================================= */
  function el(tag, props, child) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!props.hasOwnProperty(k)) { continue; }
        if (k === 'className') { node.className = props[k]; }
        else if (k === 'style') { node.setAttribute('style', props[k]); }
        else { node.setAttribute(k, props[k]); }
      }
    }
    if (child != null) { node.appendChild(document.createTextNode(String(child))); }
    return node;
  }

  function emit(name, detail) {
    try {
      var ev;
      if (typeof window.CustomEvent === 'function') { ev = new CustomEvent(name, { detail: detail }); }
      else { ev = document.createEvent('CustomEvent'); ev.initCustomEvent(name, false, false, detail); }
      document.dispatchEvent(ev);
    } catch (e) { }
  }

  /* =======================================================================
     REHIDRATACAO
     ======================================================================= */
  function rehydrateAll() {
    paintReadControls(null);
    paintDoubtControls(null);
    renderHighlights();
    /* repinta checagens ja respondidas */
    var checks = getChecks();
    for (var id in checks) { if (checks.hasOwnProperty(id)) { paintCheck(id, checks[id].choice); } }
  }

  /* =======================================================================
     DELEGACAO DE EVENTOS (um listener no document; feature-detect por alvo)
     ======================================================================= */
  function onDocClick(e) {
    var t = e.target;

    var readBtn = closestAttr(t, 'data-inema-read-toggle');
    if (readBtn) { e.preventDefault(); var rid = toggleIdFor(readBtn); markRead(rid, !isRead(rid)); return; }

    var doubtBtn = closestAttr(t, 'data-inema-doubt-toggle');
    if (doubtBtn) { e.preventDefault(); toggleDoubt(doubtIdFor(doubtBtn)); return; }

    var opt = closestAttr(t, 'data-inema-check-option');
    if (opt) { var box = opt.closest('[data-inema-check]'); if (box) { submitCheck(box.getAttribute('data-inema-check'), opt.getAttribute('data-inema-check-option')); } return; }

    var journeyOpen = closestAttr(t, 'data-inema-journey-open');
    if (journeyOpen) { e.preventDefault(); openJourney(); return; }

    var resumeBtn = closestAttr(t, 'data-inema-resume');
    if (resumeBtn) { e.preventDefault(); resume(); return; }

    /* aparencia: toggle do painel */
    var apTog = closestAttr(t, 'data-inema-appearance-toggle');
    if (apTog) {
      e.preventDefault();
      var sel = apTog.getAttribute('data-inema-appearance-toggle') || '[data-inema-appearance]';
      var panel = document.querySelector(sel);
      if (panel) {
        var open = panel.classList.toggle('is-open');
        apTog.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return;
    }

    /* botoes de preferencia */
    var pmap = [
      ['data-inema-set-theme', 'theme'], ['data-inema-set-font', 'font'],
      ['data-inema-set-fontscale', 'fontScale'], ['data-inema-set-linewidth', 'lineWidth'],
      ['data-inema-set-leading', 'leading'], ['data-inema-set-accent', 'accent']
    ];
    for (var i = 0; i < pmap.length; i++) {
      var b = closestAttr(t, pmap[i][0]);
      if (b) { e.preventDefault(); setPref(pmap[i][1], b.getAttribute(pmap[i][0])); return; }
    }
    var cyc = closestAttr(t, 'data-inema-cycle');
    if (cyc) { e.preventDefault(); cyclePref(cyc.getAttribute('data-inema-cycle')); return; }

    /* popover: swatch / nota / copiar */
    var sw = closestAttr(t, 'data-inema-swatch');
    if (sw) {
      e.preventDefault();
      var range = currentRange();
      if (range) { highlight(range, { color: sw.getAttribute('data-inema-swatch') }); }
      clearSelection(); hidePopover();
      return;
    }
    var act = closestAttr(t, 'data-inema-act');
    if (act) {
      e.preventDefault();
      var kind = act.getAttribute('data-inema-act');
      var rg = currentRange();
      if (kind === 'copy' && rg) { copyText(rg.toString()); clearSelection(); hidePopover(); return; }
      if (kind === 'note' && rg) {
        var txt = window.prompt('Sua nota para este trecho:');
        if (txt != null) { highlight(rg, { color: 'yellow', note: txt }); }
        clearSelection(); hidePopover();
      }
      return;
    }

    /* mini-menu de uma marca */
    var mAct = closestAttr(t, 'data-mark-act');
    if (mAct) {
      e.preventDefault();
      var menu = mAct.closest('.inema-marknote');
      var mid = menu ? menu.getAttribute('data-mark-id') : null;
      if (mid && mAct.getAttribute('data-mark-act') === 'remove') { removeNote(mid); }
      else if (mid && mAct.getAttribute('data-mark-act') === 'note') {
        var f = findRec(mid);
        var cur = f && f.rec.note ? f.rec.note : '';
        var nv = window.prompt('Nota para o trecho:', cur);
        if (nv != null) { promoteToNote(mid, nv); }
      }
      closeMarkMenu();
      return;
    }

    var hitMark = closestClass(t, 'inema-hl');
    if (hitMark) { e.preventDefault(); openMarkMenu(hitMark); return; }

    /* clique fora fecha popovers/menus/paineis */
    closeMarkMenu();
    if (!closestClass(t, 'inema-selpop')) { /* selecao cuida do popover */ }
    var openPanels = document.querySelectorAll('[data-inema-appearance].is-open');
    for (var q = 0; q < openPanels.length; q++) {
      if (!openPanels[q].contains(t) && !closestAttr(t, 'data-inema-appearance-toggle')) {
        openPanels[q].classList.remove('is-open');
        var tog = document.querySelector('[data-inema-appearance-toggle]');
        if (tog) { tog.setAttribute('aria-expanded', 'false'); }
      }
    }
  }

  function clearSelection() { try { var s = window.getSelection(); if (s) { s.removeAllRanges(); } } catch (e) { } }

  function closestAttr(node, attr) {
    var el2 = (node && node.nodeType === 3) ? node.parentNode : node;
    while (el2 && el2 !== document) {
      if (el2.nodeType === 1 && el2.hasAttribute && el2.hasAttribute(attr)) { return el2; }
      el2 = el2.parentNode;
    }
    return null;
  }
  function closestClass(node, cls) {
    var el2 = (node && node.nodeType === 3) ? node.parentNode : node;
    while (el2 && el2 !== document) {
      if (el2.nodeType === 1 && el2.classList && el2.classList.contains(cls)) { return el2; }
      el2 = el2.parentNode;
    }
    return null;
  }

  function bindDelegation() {
    document.addEventListener('click', onDocClick, false);
    /* selecao -> popover */
    var onSel = function () { clearTimeout(S.selTimer); S.selTimer = setTimeout(onSelectionSettled, 10); };
    document.addEventListener('mouseup', onSel, false);
    document.addEventListener('touchend', onSel, false);
    document.addEventListener('mousedown', function (e) {
      if (!closestClass(e.target, 'inema-selpop')) {
        var sel = window.getSelection && window.getSelection();
        if (!sel || sel.isCollapsed) { hidePopover(); }
      }
    }, false);
    /* checkpoint em saida */
    var save = function () { clearTimeout(S.ckTimer); var meta = getMeta(); meta.lastTopicAnchor = topmostVisibleTopic() || meta.lastTopicAnchor || null; meta.lastModuleHref = (location.pathname.split('/').pop() || location.href); meta.lastScroll = window.pageYOffset || 0; meta.lastVisitedTs = Date.now(); setMeta(meta); };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { save(); } }, false);
    window.addEventListener('pagehide', save, false);
    /* toggle sol/lua legado do v1 (absorvido) */
    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var p = getPrefs();
        setPref('theme', p.theme === 'claro' ? 'inema-dark' : 'claro');
      }, false);
    }
    /* reaplica prefs em mudanca do sistema (reduced motion nao override) */
  }

  /* =======================================================================
     BOOT
     ======================================================================= */
  function init(opts) {
    opts = opts || {};
    probeStorage();
    S.courseId = opts.courseId ? sanitizeId(opts.courseId) : detectCourseId();
    applyPrefs();
    if (!S.bound) { bindDelegation(); S.bound = true; }
    ensurePopover();
    rehydrateAll();
    renderMeters();
    setupTOC();
    syncAppearanceUI();
    updateJourneyBadge();
    if (S.ephemeral) { showEphemeralNotice(); }
    if (opts.autoResume) { resume(); }
    S.inited = true;
    emit('inema:progress', { kind: 'init', progress: progress('curso') });
    return API;
  }

  /* também aplica prefs sozinho no DOMContentLoaded (reforca anti-FOUC) */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { applyPrefs(); } catch (e) { } }, { once: true });
  } else { try { applyPrefs(); } catch (e) { } }

  /* =======================================================================
     API PUBLICA
     ======================================================================= */
  var API = {
    __core: true,
    init: init,
    applyPrefs: applyPrefs,
    markRead: markRead,
    isRead: isRead,
    progress: progress,
    renderMeters: renderMeters,
    toggleDoubt: toggleDoubt,
    setDoubtResolved: setDoubtResolved,
    listDoubts: listDoubts,
    highlight: highlight,
    promoteToNote: promoteToNote,
    editNote: editNote,
    removeNote: removeNote,
    renderHighlights: renderHighlights,
    openJourney: openJourney,
    closeJourney: closeJourney,
    renderJourney: renderJourney,
    saveCheckpoint: saveCheckpoint,
    resume: resume,
    exportJSON: exportJSON,
    importJSON: importJSON,
    downloadJSON: downloadJSON,
    setPref: setPref,
    getPrefs: getPrefs,
    cyclePref: cyclePref,
    registerCheck: registerCheck,
    submitCheck: submitCheck,
    _internal: {
      storageGet: storageGet,
      storageSet: storageSet,
      safeJSON: safeJSON,
      probeStorage: probeStorage,
      migrate: migrate,
      migratePrefs: migratePrefs,
      domTotals: domTotals,
      getManifest: getManifest,
      coreVars: CORE_VARS,
      resetCourse: resetCourse,
      courseId: function () { return S.courseId; }
    }
  };

  window.INEMA = API;

})(window, document);
