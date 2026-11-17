(function () {
  'use strict';

  if (window.__srtAiContentLoaded) return;
  window.__srtAiContentLoaded = true;

  const Parser = window.SrtParser;
  if (!Parser) return;

  const state = {
    settings: {
      enabled: true,
      provider: 'ollama',
      targetLang: '简体中文',
      displayMode: 'bilingual',
      fontSize: 22,
      bottomOffset: 48,
      bgOpacity: 0.65,
      batchSize: 15,
      timeOffset: 0,
      autoDownloadSrt: false,
      domainPreset: 'general',
      customPrompt: ''
    },
    video: null,
    cues: [],
    subtitleHash: '',
    subtitleSource: '',
    translations: {},
    translating: false,
    autoDownloadedHash: '',
    lastError: '',
    activeCueId: -1,
    hideTimer: null,
    failCount: {},
    subtitleLoadedAt: 0,
    lastPageUrl: location.href,
    lastVideoSrc: '',
    hls: createHlsState(),
    diag: { interceptorHits: [], monitorUrls: [] }
  };

  // --- UI Elements ---
  let rootEl = null;
  let subBoxEl = null;
  let translatedEl = null;
  let originalEl = null;
  let statusEl = null;
  let toggleBtn = null;
  let modeBtn = null;
  let offsetLabel = null;
  let fileInput = null;

  function ensureOverlayUI() {
    if (rootEl) return;

    rootEl = document.createElement('div');
    rootEl.className = 'srt-ai-overlay-root';

    subBoxEl = document.createElement('div');
    subBoxEl.className = 'srt-ai-subtitle-box hidden';

    translatedEl = document.createElement('div');
    translatedEl.className = 'srt-ai-line srt-ai-line-translated';

    originalEl = document.createElement('div');
    originalEl.className = 'srt-ai-line srt-ai-line-original';

    subBoxEl.appendChild(translatedEl);
    subBoxEl.appendChild(originalEl);

    const toolbar = document.createElement('div');
    toolbar.className = 'srt-ai-toolbar';

    statusEl = document.createElement('span');
    statusEl.className = 'srt-ai-status';
    statusEl.textContent = 'AI字幕: 等待SRT';

    toggleBtn = document.createElement('button');
    toggleBtn.className = 'srt-ai-btn active';
    toggleBtn.textContent = '开启';
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.settings.enabled = !state.settings.enabled;
      state.failCount = {};
      savePartialSettings({ enabled: state.settings.enabled });
      updateToolbarUI();
      renderCurrentCue();
      if (state.settings.enabled) scheduleTranslation();
    });

    modeBtn = document.createElement('button');
    modeBtn.className = 'srt-ai-btn';
    modeBtn.textContent = '双语';
    modeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const order = ['bilingual', 'translated', 'original'];
      const next = order[(order.indexOf(state.settings.displayMode) + 1) % order.length];
      state.settings.displayMode = next;
      savePartialSettings({ displayMode: next });
      updateToolbarUI();
      renderCurrentCue();
    });

    const minusBtn = document.createElement('button');
    minusBtn.className = 'srt-ai-btn';
    minusBtn.textContent = '-0.5s';
    minusBtn.title = '字幕提前 0.5 秒';
    minusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustOffset(-0.5);
    });

    offsetLabel = document.createElement('span');
    offsetLabel.className = 'srt-ai-status';
    offsetLabel.style.maxWidth = '56px';
    offsetLabel.textContent = '0.0s';

    const plusBtn = document.createElement('button');
    plusBtn.className = 'srt-ai-btn';
    plusBtn.textContent = '+0.5s';
    plusBtn.title = '字幕延后 0.5 秒';
    plusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustOffset(0.5);
    });

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'srt-ai-btn';
    uploadBtn.textContent = '导入SRT';
    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'srt-ai-btn';
    exportBtn.textContent = '保存SRT';
    exportBtn.title = '将已翻译的字幕保存为本地 .srt 文件（跟随当前 双语/仅译文 模式）';
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadTranslatedSrt();
    });

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.srt,.vtt,text/plain';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) readLocalSubtitleFile(file);
      fileInput.value = '';
    });

    const dropHint = document.createElement('div');
    dropHint.className = 'srt-ai-drop-hint';
    dropHint.textContent = '松开鼠标以加载 SRT / VTT 字幕';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'srt-ai-btn srt-ai-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '收起控制条（按 Option+T 或将鼠标移至右上角可重新唤出）';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(state.hideTimer);
      rootEl.classList.remove('show-toolbar');
    });

    toolbar.addEventListener('mouseenter', () => {
      clearTimeout(state.hideTimer);
      rootEl.classList.add('show-toolbar');
    });
    toolbar.addEventListener('mouseleave', () => {
      showToolbarTemporarily(1200);
    });

    toolbar.append(statusEl, toggleBtn, modeBtn, minusBtn, offsetLabel, plusBtn, uploadBtn, exportBtn, closeBtn, fileInput);
    rootEl.append(subBoxEl, toolbar, dropHint);

    // Mouse drag support for subtitle position
    let isDragging = false;
    let startY = 0;
    let startBottom = 0;

    subBoxEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startY = e.clientY;
      startBottom = state.settings.bottomOffset || 48;
      subBoxEl.classList.add('is-dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY; // moving cursor up increases bottom offset
      const newBottom = Math.max(10, Math.min(window.innerHeight - 80, Math.round(startBottom + deltaY)));
      state.settings.bottomOffset = newBottom;
      subBoxEl.style.bottom = `${newBottom}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      subBoxEl.classList.remove('is-dragging');
      savePartialSettings({ bottomOffset: state.settings.bottomOffset });
    });
  }

  function detectVideoBaseName() {
    // Try finding video file name displayed in fnOS player header (e.g. "xxx.mkv" / "xxx.mp4")
    const spans = document.querySelectorAll('span, div, h1, h2');
    for (const el of spans) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (/\.(mkv|mp4|avi|mov|ts|flv|webm)$/i.test(t) && t.length < 180) {
        return t.replace(/\.(mkv|mp4|avi|mov|ts|flv|webm)$/i, '');
      }
    }
    const title = (document.title || 'subtitle').replace(/[\\/:*?"<>|]/g, '_').trim();
    return title || 'subtitle';
  }

  function downloadTranslatedSrt(customMode) {
    if (!state.cues || state.cues.length === 0) return { ok: false, error: '当前没有已加载的字幕' };
    const mode = customMode || state.settings.displayMode || 'bilingual';
    const srtContent = Parser.exportSrt(
      state.cues,
      state.translations,
      mode,
      state.settings.timeOffset || 0
    );
    const baseName = detectVideoBaseName();
    const suffix = mode === 'translated' ? '.zh.srt' : mode === 'original' ? '.orig.srt' : '.zh-en.srt';
    const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}${suffix}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, fileName: `${baseName}${suffix}` };
  }

  function isContextInvalidatedError(err) {
    const s = String(err?.message || err || '');
    return /Extension context invalidated|context invalidated/i.test(s);
  }

  function adjustOffset(delta) {
    const next = Math.round(((state.settings.timeOffset || 0) + delta) * 10) / 10;
    state.settings.timeOffset = next;
    savePartialSettings({ timeOffset: next });
    updateToolbarUI();
    renderCurrentCue();
  }

  function savePartialSettings(partial) {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: partial }).catch(() => {});
  }

  function applyOverlayStyles() {
    if (!subBoxEl) return;
    subBoxEl.style.bottom = `${state.settings.bottomOffset || 48}px`;
    const fontSize = state.settings.fontSize || 22;
    translatedEl.style.fontSize = `${fontSize}px`;
    originalEl.style.fontSize = `${Math.max(12, Math.round(fontSize * 0.76))}px`;

    const bg = `rgba(0, 0, 0, ${state.settings.bgOpacity ?? 0.65})`;
    translatedEl.style.backgroundColor = bg;
    originalEl.style.backgroundColor = bg;
  }

  function updateToolbarUI() {
    if (!rootEl) return;
    toggleBtn.textContent = state.settings.enabled ? '开启' : '关闭';
    toggleBtn.classList.toggle('active', !!state.settings.enabled);

    const modeLabels = {
      bilingual: '双语',
      translated: '仅译文',
      original: '仅原文'
    };
    modeBtn.textContent = modeLabels[state.settings.displayMode] || '双语';

    const offset = state.settings.timeOffset || 0;
    offsetLabel.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(1)}s`;

    const canTakeOverSubtitles =
      !!state.settings.enabled &&
      state.cues.length > 0 &&
      rootEl.getBoundingClientRect().height > 100;
    rootEl.classList.toggle('has-cues', canTakeOverSubtitles);

    if (state.lastError) {
      rootEl.classList.remove('waiting-sub');
      if (isContextInvalidatedError(state.lastError)) {
        statusEl.textContent = '插件已更新，请刷新网页';
        statusEl.title = '扩展程序在后台已重新加载，请刷新当前网页(F5)以重新连接。';
      } else {
        statusEl.textContent = `错误: ${state.lastError}`;
        statusEl.title = state.lastError;
      }
    } else if (state.cues.length === 0) {
      statusEl.textContent = '等待 SRT 字幕';
      statusEl.title = '可直接拖入 .srt 文件或等待播放器加载字幕';
    } else {
      const doneCount = Object.keys(state.translations).length;
      const prefix = state.translating ? '翻译中' : '已就绪';
      statusEl.textContent = `${prefix} ${doneCount}/${state.cues.length}`;
      statusEl.title = `来源: ${state.subtitleSource || '未知'}`;
    }
  }

  function showToolbarTemporarily(delay = 2200) {
    if (!rootEl) return;
    rootEl.classList.add('show-toolbar');
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      if (rootEl) rootEl.classList.remove('show-toolbar');
    }, delay);
  }

  function findPlayerContainer(video) {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;

    // Known player root containers (YouTube #movie_player, fnOS xgplayer, Disney+, Bilibili, etc.)
    // Use `known` even in fullscreen as long as it is inside (or is) the fullscreen element!
    const known = video.closest(
      '#movie_player, .html5-video-player, .xgplayer, .bpx-player-video-area, .dplayer, .artplayer-app, .plyr, disney-web-player, .btm-media-player, .btm-media-client, [data-testid="web-player"]'
    );
    if (known && (!fsEl || fsEl.contains(known))) {
      return known;
    }

    if (fsEl && fsEl.contains(video)) return fsEl;

    const vRect = video.getBoundingClientRect();
    let best = video.parentElement;
    let cur = video.parentElement;
    for (let i = 0; i < 6 && cur && cur !== document.body && cur !== document.documentElement; i++) {
      const r = cur.getBoundingClientRect();
      // Skip 0-height wrappers (like YouTube's .html5-video-container) and keep walking up
      if (r.width >= vRect.width * 0.8 && r.height >= vRect.height * 0.8) {
        if (r.width <= vRect.width * 1.25 && r.height <= vRect.height * 1.25) {
          best = cur;
        } else {
          break;
        }
      }
      cur = cur.parentElement;
    }
    return best;
  }

  function mountOverlayToVideo(video) {
    ensureOverlayUI();
    applyOverlayStyles();

    const host = findPlayerContainer(video);
    if (!host) return;

    const computed = window.getComputedStyle(host);
    if (computed.position === 'static') {
      host.style.position = 'relative';
    }

    if (rootEl.parentElement !== host) {
      host.appendChild(rootEl);
    }

    if (!host.__srtAiBound) {
      host.__srtAiBound = true;
      startDomSubtitleObserver(host);
      host.addEventListener(
        'mousemove',
        (e) => {
          const rect = host.getBoundingClientRect();
          const xFromRight = rect.right - e.clientX;
          const yFromTop = e.clientY - rect.top;
          // 仅当鼠标真正靠近右上角控制区 (宽 280px × 高 90px) 时才轻柔显现
          if (xFromRight >= 0 && xFromRight <= 280 && yFromTop >= 0 && yFromTop <= 90) {
            showToolbarTemporarily(2200);
          }
        },
        { passive: true }
      );
      host.addEventListener('dragover', (e) => {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          rootEl.classList.add('drag-over');
        }
      });
      host.addEventListener('dragleave', () => {
        rootEl.classList.remove('drag-over');
      });
      host.addEventListener('drop', (e) => {
        rootEl.classList.remove('drag-over');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && /\.(srt|vtt)$/i.test(file.name)) {
          e.preventDefault();
          e.stopPropagation();
          readLocalSubtitleFile(file);
        }
      });
    }
  }

  function readLocalSubtitleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadSubtitleContent(reader.result, `本地文件: ${file.name}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function createHlsState() {
    return {
      segments: new Map(),
      playlist: new Map(),
      playlistMap: new Map(),
      playlists: [],
      activePlaylistUrl: '',
      lastPrefetchAt: 0,
      lastRawHead: '',
      trackLabels: {},
      seq: 0
    };
  }

  // ---------------- HLS segmented subtitles (Disney+ etc.) ----------------
  // Each pts_XXXX.vtt is stored with cue times in the *media* (PTS) domain. Its position on the
  // player timeline (video.currentTime) comes from the subtitle m3u8 playlist (sum of #EXTINF).
  function handleSubtitleSegment(rawClean, subUrl) {
    const key = Parser.segmentKey(subUrl) || `inline-${Date.now()}`;
    const ptsM = (subUrl || '').match(/pts_(\d+)/i);
    let segPts = null;
    let relative = false;
    let firstRaw = null;
    let cues;
    if (ptsM) {
      segPts = parseInt(ptsM[1], 10) / 1000;
      const raw = Parser.parseSubtitle(rawClean, {});
      if (!raw || raw.length === 0) return;
      firstRaw = raw[0].start;
      // Cue times either already absolute PTS (00:07:08.845 for pts_428845) or relative to segment start
      relative = firstRaw < segPts - 1;
      cues = raw.map((c) => ({
        start: relative ? c.start + segPts : c.start,
        end: relative ? c.end + segPts : c.end,
        text: c.text
      }));
    } else {
      cues = Parser.parseSubtitle(rawClean, { url: subUrl });
      if (!cues || cues.length === 0) return;
    }
    state.hls.lastRawHead = (rawClean || '').slice(0, 220);
    const existing = state.hls.segments.get(key);
    const seq = existing ? existing.at : ++state.hls.seq;
    state.hls.segments.set(key, {
      key,
      track: key.includes('/') ? key.split('/')[0] : '',
      segPts,
      relative,
      firstRaw,
      cues,
      at: seq
    });
    // If this newly arrived segment belongs to a known playlist, keep activePlaylistUrl synced
    if (!existing) {
      for (const [plUrl, pl] of state.hls.playlistMap) {
        if (pl.keys.has(key)) {
          state.hls.activePlaylistUrl = plUrl;
          break;
        }
      }
    }
    rebuildFromSegments();
  }

  function pickActiveTrack() {
    // The player only fetches segments of the subtitle track currently selected by the user,
    // so the track of the most recently *first-seen* segment is the active one.
    let best = null;
    let bestAt = -1;
    for (const seg of state.hls.segments.values()) {
      if (seg.at > bestAt) {
        bestAt = seg.at;
        best = seg.track;
      }
    }
    return best;
  }

  function trackLabel(track) {
    return (track && state.hls.trackLabels[track]) || (track ? track.slice(0, 8) : '');
  }

  function segmentOffset(seg) {
    const entry = state.hls.playlist.get(seg.key);
    if (entry && seg.segPts !== null) return { offset: entry.start - seg.segPts, mapped: true, entry };
    return { offset: 0, mapped: false, entry: null };
  }

  function rebuildFromSegments() {
    const track = pickActiveTrack();
    const activePl = state.hls.activePlaylistUrl ? state.hls.playlistMap.get(state.hls.activePlaylistUrl) : null;
    const textMap = new Map();
    state.cues.forEach((c) => {
      if (state.translations[c.id]) textMap.set(c.text, state.translations[c.id]);
    });

    const seen = new Set();
    const cues = [];
    let mappedCount = 0;
    let segCount = 0;
    for (const seg of state.hls.segments.values()) {
      const inActive = activePl ? activePl.keys.has(seg.key) : seg.track === track;
      if (!inActive) continue;
      segCount += 1;
      const { offset, mapped } = segmentOffset(seg);
      if (mapped) mappedCount += 1;
      for (const c of seg.cues) {
        const start = c.start + offset;
        const end = c.end + offset;
        const sig = `${Math.round(start * 10)}_${c.text}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        cues.push({ start, end, text: c.text });
      }
    }
    cues.sort((a, b) => a.start - b.start);
    const translations = {};
    cues.forEach((c, idx) => {
      c.id = idx;
      if (textMap.has(c.text)) translations[idx] = textMap.get(c.text);
    });

    const prevCount = state.cues.length;
    state.cues = cues;
    state.translations = translations;
    state.failCount = {};
    state.activeCueId = -1;
    const activeLabel = (activePl && activePl.label) || trackLabel(track);
    const alignNote = mappedCount === segCount && segCount > 0 ? '已按播放列表对齐' : mappedCount > 0 ? `部分对齐 ${mappedCount}/${segCount}` : '未对齐(无播放列表)';
    state.subtitleSource = `自动捕获: 分段流 [${activeLabel}] (${cues.length}条, ${alignNote})`;
    state.subtitleLoadedAt = Date.now();
    updateToolbarUI();
    renderCurrentCue();
    if (cues.length !== prevCount || Object.keys(translations).length < cues.length) {
      scheduleTranslation();
    }
  }

  function prefetchAroundTime(t) {
    const activePl = state.hls.activePlaylistUrl ? state.hls.playlistMap.get(state.hls.activePlaylistUrl) : null;
    if (!activePl || !activePl.entries || activePl.entries.length === 0) return;
    const now = Date.now();
    if (now - state.hls.lastPrefetchAt < 1500) return;
    state.hls.lastPrefetchAt = now;

    const minT = Math.max(0, t - 30);
    const maxT = t + 600;
    const candidates = activePl.entries.filter(
      (e) => e.start + e.duration >= minT && e.start <= maxT
    );
    let queued = 0;
    for (const e of candidates) {
      if (queued >= 10) break;
      if (state.hls.segments.has(e.key) || triedUrls.has(e.uri)) continue;
      queued += 1;
      tryLoadSubtitleUrl(e.uri);
    }
  }

  function handleSubtitlePlaylist(text, url) {
    const entries = Parser.parseHlsPlaylist(text, url).filter((e) => /\.(vtt|webvtt)$/i.test(e.key));
    if (entries.length === 0) return false;
    for (const e of entries) state.hls.playlist.set(e.key, e);
    const fname = (url || '').split('?')[0].split('/').pop() || '';
    const lm = fname.match(/composite_([A-Za-z]{2,3}(?:-[A-Za-z]+)?)_([A-Z]+)/);
    const label = lm ? `${lm[1]}${lm[2] && lm[2] !== 'NORMAL' ? ' ' + lm[2] : ''}` : fname.slice(0, 24);
    const keys = new Set();
    for (const e of entries) {
      keys.add(e.key);
      const tr = e.key.includes('/') ? e.key.split('/')[0] : '';
      if (tr) state.hls.trackLabels[tr] = label;
    }
    const tail = (url || '').split('?')[0].split('/').slice(-2).join('/');
    state.hls.playlistMap.set(tail, { url: tail, label, entries, keys });
    state.hls.activePlaylistUrl = tail;
    if (!state.hls.playlists.some((p) => p.url === tail)) {
      state.hls.playlists.push({
        url: tail,
        segments: entries.length,
        total: Math.round(entries[entries.length - 1].start + entries[entries.length - 1].duration),
        head: entries.slice(0, 4).map((e) => `${e.key.split('/').pop()}@${e.start.toFixed(3)}+${e.duration}`)
      });
      if (state.hls.playlists.length > 6) state.hls.playlists.shift();
    }
    if (state.hls.segments.size > 0) rebuildFromSegments();
    prefetchAroundTime(state.video ? state.video.currentTime : 0);
    return true;
  }

  const triedPlaylists = new Set();
  async function tryLoadPlaylistUrl(url) {
    if (!url || triedPlaylists.has(url)) return;
    triedPlaylists.add(url);
    let text = '';
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (r.ok) text = await r.text();
    } catch (_) {}
    if (!text) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'FETCH_TEXT', url });
        if (res && res.ok) text = res.text;
      } catch (_) {}
    }
    if (text && /^\s*#EXTM3U/.test(text) && /#EXTINF/.test(text)) handleSubtitlePlaylist(text, url);
  }

  function collectHlsDiag() {
    const out = {
      playlists: state.hls.playlists,
      playlistEntries: state.hls.playlist.size,
      activeTrack: pickActiveTrack(),
      activeTrackLabel: trackLabel(pickActiveTrack()),
      trackLabels: state.hls.trackLabels,
      lastRawHead: state.hls.lastRawHead,
      segments: []
    };
    for (const seg of state.hls.segments.values()) {
      const { offset, mapped, entry } = segmentOffset(seg);
      out.segments.push({
        key: seg.key.split('/').pop(),
        track: trackLabel(seg.track),
        seq: seg.at,
        segPts: seg.segPts,
        firstRaw: seg.firstRaw,
        relative: seg.relative,
        cues: seg.cues.length,
        mapped,
        timelineStart: entry ? Math.round(entry.start * 1000) / 1000 : null,
        offset: Math.round(offset * 1000) / 1000
      });
    }
    return out;
  }

  async function loadSubtitleContent(rawText, sourceLabel, subUrl = '') {
    const rawClean = Parser.extractSubtitleText(rawText) || rawText;

    // Segmented HLS WebVTT (Disney+ pts_xxx.vtt, Apple TV, etc.) -> dedicated segment pipeline
    const isChunk =
      /(pts_\d+|seg(ment)?[-_]?\d+|frag[-_]?\d+|\/subs?\/chunk)/i.test(subUrl) ||
      /X-TIMESTAMP-MAP/i.test(rawText);
    if (isChunk) {
      handleSubtitleSegment(rawClean, subUrl);
      return;
    }

    const newCues = Parser.parseSubtitle(rawClean, { url: subUrl });
    if (!newCues || newCues.length === 0) return;

    const hash = Parser.hashString(rawClean.slice(0, 8192) + ':' + newCues.length);
    if (hash === state.subtitleHash && state.cues.length > 0) {
      return; // Same subtitle already loaded
    }

    state.cues = newCues;
    state.subtitleHash = hash;
    state.subtitleSource = sourceLabel || '自动捕获';
    state.subtitleLoadedAt = Date.now();
    state.translations = {};
    state.failCount = {};
    state.lastError = '';
    state.activeCueId = -1;

    // Load cached translations if present
    const cacheKey = getCacheKey();
    try {
      const cached = await chrome.storage.local.get(cacheKey);
      if (cached && cached[cacheKey]) {
        state.translations = cached[cacheKey];
      }
    } catch (_) {
      // Ignore cache read error
    }

    updateToolbarUI();
    renderCurrentCue();
    showToolbarTemporarily();
    scheduleTranslation();
  }

  function getCacheKey() {
    const provTag = state.settings.provider === 'google_free' ? 'gfree' : 'ai';
    const domainTag = state.settings.domainPreset || 'general';
    const customTag = state.settings.customPrompt
      ? '_' + Parser.hashString(state.settings.customPrompt.trim())
      : '';
    return `srtCache_${state.subtitleHash}_${state.settings.targetLang}_${provTag}_${domainTag}${customTag}`;
  }

  let cacheSaveTimer = null;
  function persistCacheDebounced() {
    if (!state.subtitleHash) return;
    clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => {
      const key = getCacheKey();
      chrome.storage.local.set({ [key]: state.translations }).catch(() => {});
    }, 800);
  }

  function renderCurrentCue() {
    if (!subBoxEl) return;
    if (!state.settings.enabled || !state.video || state.cues.length === 0) {
      subBoxEl.classList.add('hidden');
      return;
    }

    const t = state.video.currentTime - (state.settings.timeOffset || 0);
    const idx = Parser.findCueIndexAtTime(state.cues, t);
    if (idx === -1) {
      state.activeCueId = -1;
      subBoxEl.classList.add('hidden');
      return;
    }

    const cue = state.cues[idx];
    state.activeCueId = cue.id;
    const translated = state.translations[cue.id] || '';
    const mode = state.settings.displayMode || 'bilingual';

    if (mode === 'original') {
      translatedEl.style.display = 'none';
      originalEl.style.display = 'inline-block';
      originalEl.textContent = cue.text;
    } else if (mode === 'translated') {
      originalEl.style.display = 'none';
      translatedEl.style.display = 'inline-block';
      translatedEl.textContent = translated || `... ${cue.text}`;
    } else {
      // bilingual
      if (translated) {
        translatedEl.style.display = 'inline-block';
        translatedEl.style.opacity = '1';
        translatedEl.textContent = translated;
      } else if (state.translating) {
        translatedEl.style.display = 'inline-block';
        translatedEl.style.opacity = '0.65';
        translatedEl.textContent = '翻译中...';
      } else {
        translatedEl.style.display = 'none';
        translatedEl.textContent = '';
      }
      originalEl.style.display = 'inline-block';
      originalEl.textContent = cue.text;
    }

    subBoxEl.classList.remove('hidden');
  }

  // --- Lookahead Batch Translation Scheduler ---
  let workerRunning = false;

  async function scheduleTranslation() {
    if (workerRunning) return;
    if (!state.settings.enabled || state.cues.length === 0) return;

    workerRunning = true;
    state.translating = true;
    state.lastError = '';
    updateToolbarUI();
    let consecutiveFailures = 0;
    const needs = (cue) => !state.translations[cue.id] && (state.failCount[cue.id] || 0) < 2;

    try {
      while (state.settings.enabled && state.cues.length > 0) {
        const currentTime = state.video ? state.video.currentTime - (state.settings.timeOffset || 0) : 0;
        const startIdx = Parser.findNextCueIndex(state.cues, Math.max(0, currentTime));
        const batchSize = Math.max(5, Math.min(30, Number(state.settings.batchSize) || 15));

        // Find first untranslated cue from current playback position onwards,
        // and if all upcoming cues are done, wrap around to translate earlier cues.
        let targetStart = -1;
        for (let i = startIdx; i < state.cues.length; i++) {
          if (needs(state.cues[i])) {
            targetStart = i;
            break;
          }
        }
        if (targetStart === -1) {
          for (let i = 0; i < startIdx; i++) {
            if (needs(state.cues[i])) {
              targetStart = i;
              break;
            }
          }
        }

        if (targetStart === -1) {
          // All cues translated!
          if (
            state.settings.autoDownloadSrt &&
            state.subtitleHash &&
            state.autoDownloadedHash !== state.subtitleHash &&
            Object.keys(state.translations).length > 0
          ) {
            state.autoDownloadedHash = state.subtitleHash;
            downloadTranslatedSrt();
          }
          break;
        }

        const targetCues = [];
        for (let i = targetStart; i < state.cues.length && targetCues.length < batchSize; i++) {
          if (needs(state.cues[i])) {
            targetCues.push({ id: state.cues[i].id, text: state.cues[i].text });
          }
        }

        const contextCues = state.cues
          .slice(Math.max(0, targetStart - 3), targetStart)
          .map((c) => ({ id: c.id, text: c.text }));

        let resp;
        try {
          resp = await chrome.runtime.sendMessage({
            type: 'TRANSLATE_BATCH',
            payload: { contextCues, targetCues }
          });
        } catch (e) {
          resp = { ok: false, error: e?.message || String(e) };
        }

        if (!resp || !resp.ok) {
          state.lastError = (resp && resp.error) || '翻译请求失败';
          consecutiveFailures++;
          if (isContextInvalidatedError(state.lastError)) break;
          // Network/model down: stop and let user fix settings
          if (/HTTP|fetch|Failed|连接|refused/i.test(state.lastError) || consecutiveFailures >= 3) break;
          // Unparseable batch: skip these cues (count failure) and keep going
          targetCues.forEach((c) => {
            state.failCount[c.id] = (state.failCount[c.id] || 0) + 1;
          });
          updateToolbarUI();
          continue;
        }
        consecutiveFailures = 0;
        state.lastError = '';

        const map = resp.translations || {};
        for (const [idStr, text] of Object.entries(map)) {
          state.translations[Number(idStr)] = text;
        }
        // Cues the model kept dropping
        targetCues.forEach((c) => {
          if (!state.translations[c.id]) state.failCount[c.id] = (state.failCount[c.id] || 0) + 1;
        });
        persistCacheDebounced();
        renderCurrentCue();
        updateToolbarUI();
        if (state.settings.provider === 'google_free') {
          await new Promise((r) => setTimeout(r, 350));
        }
      }
    } catch (err) {
      state.lastError = err?.message || String(err);
    } finally {
      workerRunning = false;
      state.translating = false;
      updateToolbarUI();
    }
  }

  // --- DOM Subtitle Fallback Observer (when player renders subtitles in DOM) ---
  const domSub = {
    observer: null,
    lastText: '',
    cache: {},
    history: [],
    translatingText: ''
  };

  function isTimecodeOrUiLabel(text) {
    if (!text || text.length < 3 || text.length > 300) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?(\s*\/\s*\d{1,2}:\d{2}(:\d{2})?)?$/.test(text)) return true;
    if (/^(倍速|选集|原画|超清|高清|流畅|字幕|关闭|调整|添加|0\.\d+x|1\.\d+x|2\.0x)$/i.test(text)) return true;
    return false;
  }

  function scanDomSubtitle(host) {
    if (!state.settings.enabled || state.cues.length > 0 || !state.video) return;
    const vRect = state.video.getBoundingClientRect();
    if (vRect.width < 100 || vRect.height < 100) return;

    const candidates = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || '').trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || el.closest('.srt-ai-overlay-root')) continue;
      if (el.closest('button, input, select, a, [role="button"], [role="menu"]')) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Must be in the lower half of the video, and not in the very bottom control bar (< 36px from bottom edge)
      const inLowerHalf = rect.top >= vRect.top + vRect.height * 0.5 && rect.bottom <= vRect.bottom - 24;
      if (!inLowerHalf) continue;

      if (!isTimecodeOrUiLabel(text)) {
        candidates.push({ el, text, top: rect.top });
      }
    }

    if (candidates.length === 0) {
      if (domSub.lastText) {
        domSub.lastText = '';
        if (subBoxEl) subBoxEl.classList.add('hidden');
      }
      return;
    }

    // Group nearby subtitle lines
    candidates.sort((a, b) => a.top - b.top);
    const combined = Array.from(new Set(candidates.map((c) => c.text))).join('\n');
    if (isTimecodeOrUiLabel(combined)) return;

    if (combined !== domSub.lastText) {
      domSub.lastText = combined;
      renderDomTranslation(combined);
    }
  }

  async function renderDomTranslation(text) {
    if (!subBoxEl || !state.settings.enabled || state.cues.length > 0) return;

    const cached = domSub.cache[text];
    if (cached) {
      showDomSubtitleBox(text, cached);
      return;
    }

    // Show loading or original while translating
    showDomSubtitleBox(text, '');

    if (domSub.translatingText === text) return;
    domSub.translatingText = text;

    try {
      const contextCues = domSub.history.slice(-2).map((t, i) => ({ id: i, text: t }));
      const resp = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_BATCH',
        payload: {
          contextCues,
          targetCues: [{ id: 100, text }]
        }
      });
      if (resp && resp.ok && resp.translations && resp.translations[100]) {
        const translated = resp.translations[100];
        domSub.cache[text] = translated;
        domSub.history.push(text);
        if (domSub.history.length > 10) domSub.history.shift();
        if (domSub.lastText === text && state.cues.length === 0) {
          showDomSubtitleBox(text, translated);
        }
      } else if (resp && !resp.ok) {
        state.lastError = resp.error || '翻译失败';
        updateToolbarUI();
      }
    } catch (err) {
      state.lastError = err?.message || String(err);
      updateToolbarUI();
    } finally {
      if (domSub.translatingText === text) domSub.translatingText = '';
    }
  }

  function showDomSubtitleBox(original, translated) {
    if (!subBoxEl || !state.settings.enabled) return;
    if (!translated) {
      subBoxEl.classList.add('hidden');
      return;
    }
    // Since fnOS already renders the original English subtitle at the bottom,
    // display the translated Chinese line cleanly above it (unless user picks original)
    originalEl.style.display = 'none';
    translatedEl.style.display = 'inline-block';
    translatedEl.textContent = translated;
    subBoxEl.style.bottom = `${(state.settings.bottomOffset || 48) + 48}px`;
    subBoxEl.classList.remove('hidden');
  }

  function startDomSubtitleObserver(host) {
    if (domSub.observer) domSub.observer.disconnect();
    let timer = null;
    domSub.observer = new MutationObserver(() => {
      if (state.cues.length > 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => scanDomSubtitle(host), 60);
    });
    domSub.observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // --- Video & Track Discovery ---
  function collectVideosDeep(root, out = []) {
    if (!root) return out;
    const vids = root.querySelectorAll ? root.querySelectorAll('video') : [];
    for (const v of vids) out.push(v);
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of all) {
      if (el.shadowRoot) collectVideosDeep(el.shadowRoot, out);
    }
    return out;
  }

  function findPrimaryVideo() {
    const videos = collectVideosDeep(document);
    if (videos.length === 0) return null;
    // Prefer a video that actually has media loaded / is playing, then the largest one
    const score = (x) => (x.readyState >= 2 ? 2 : 0) + (!x.paused ? 1 : 0);
    videos.sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return videos[0];
  }

  function extractFromTextTracks(video) {
    if (!video || !video.textTracks || state.cues.length > 0) return false;
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      // Disabled tracks don't expose cues; switch to hidden (loads cues without native rendering change)
      if (track.mode === 'disabled' && (track.kind === 'subtitles' || track.kind === 'captions')) {
        try {
          track.mode = 'hidden';
          setTimeout(() => extractFromTextTracks(video), 1200);
        } catch (_) {}
      }
      if (!track.__srtAiCueBound) {
        track.__srtAiCueBound = true;
        track.addEventListener('cuechange', () => extractFromTextTracks(video));
      }
      if (track.cues && track.cues.length > 0) {
        const lines = [];
        for (let j = 0; j < track.cues.length; j++) {
          const c = track.cues[j];
          const text = (c.text || '').trim();
          if (!text) continue;
          const fmt = (sec) => {
            const h = String(Math.floor(sec / 3600)).padStart(2, '0');
            const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
            const s = String(Math.floor(sec % 60)).padStart(2, '0');
            const ms = String(Math.round((sec % 1) * 1000)).padStart(3, '0');
            return `${h}:${m}:${s},${ms}`;
          };
          lines.push(`${lines.length + 1}\n${fmt(c.startTime)} --> ${fmt(c.endTime)}\n${text}`);
        }
        if (lines.length > 0) {
          loadSubtitleContent(lines.join('\n\n'), `播放器轨道: ${track.label || track.language || 'TextTrack'}`);
          return true;
        }
      }
    }
    return false;
  }

  function checkVideoTracks(video) {
    if (!video || state.cues.length > 0) return;
    if (extractFromTextTracks(video)) return;

    if (video.textTracks) {
      video.textTracks.addEventListener('addtrack', () => extractFromTextTracks(video));
    }

    const tracks = video.querySelectorAll('track');
    for (const track of tracks) {
      const src = track.getAttribute('src');
      if (src) {
        fetch(src)
          .then((r) => (r.ok ? r.text() : ''))
          .then((text) => {
            if (Parser.looksLikeSubtitle(text)) {
              loadSubtitleContent(text, `页面轨道: ${track.label || src.split('/').pop()}`);
            }
          })
          .catch(() => {});
        break;
      }
    }
  }

  function resetForNewVideo() {
    state.cues = [];
    state.subtitleHash = '';
    state.subtitleSource = '';
    state.translations = {};
    state.failCount = {};
    state.lastError = '';
    state.activeCueId = -1;
    state.hls = createHlsState();
    domSub.lastText = '';
    updateToolbarUI();
    renderCurrentCue();
  }

  function attachVideo(video) {
    if (location.href !== state.lastPageUrl) {
      state.lastPageUrl = location.href;
      if (Date.now() - state.subtitleLoadedAt > 2500) {
        resetForNewVideo();
      }
    }

    const curSrc = video ? (video.currentSrc || video.src || '') : '';
    if (curSrc && state.lastVideoSrc && curSrc !== state.lastVideoSrc) {
      state.lastVideoSrc = curSrc;
      if (Date.now() - state.subtitleLoadedAt > 2500) {
        resetForNewVideo();
      }
      setTimeout(() => checkVideoTracks(video), 600);
    } else if (curSrc && !state.lastVideoSrc) {
      state.lastVideoSrc = curSrc;
    }

    if (!video || state.video === video) {
      if (video) {
        mountOverlayToVideo(video);
        if (state.cues.length === 0) checkVideoTracks(video);
      }
      return;
    }

    state.video = video;
    mountOverlayToVideo(video);
    updateToolbarUI();
    checkVideoTracks(video);

    video.addEventListener('timeupdate', () => {
      renderCurrentCue();
      if (state.hls.activePlaylistUrl) prefetchAroundTime(video.currentTime);
    });
    video.addEventListener('seeked', () => {
      renderCurrentCue();
      if (state.hls.activePlaylistUrl) {
        state.hls.lastPrefetchAt = 0;
        prefetchAroundTime(video.currentTime);
      }
      scheduleTranslation();
    });
    video.addEventListener('play', () => {
      renderCurrentCue();
      scheduleTranslation();
      if (rootEl) {
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(() => {
          if (rootEl) rootEl.classList.remove('show-toolbar');
        }, 500);
      }
    });
    video.addEventListener('pause', () => {
      showToolbarTemporarily(3000);
    });
  }

  function scanForVideo() {
    const v = findPrimaryVideo();
    if (v) attachVideo(v);
  }

  function isMatchingYouTubeVideo(subUrl) {
    if (!/youtube\.com$/i.test(location.hostname) || !subUrl) return true;
    try {
      const pageVid = new URLSearchParams(location.search).get('v');
      const u = new URL(subUrl, location.origin);
      const subVid = u.searchParams.get('v');
      if (pageVid && subVid && pageVid !== subVid) return false;
    } catch (_) {}
    return true;
  }

  // Listen to MAIN world network interceptor
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data && data.source === 'srt-ai-interceptor' && data.type === 'PLAYLIST_CAPTURED') {
      if (data.url) triedPlaylists.add(data.url);
      handleSubtitlePlaylist(data.content, data.url || location.href);
      return;
    }
    if (data && data.source === 'srt-ai-interceptor' && data.type === 'SUBTITLE_CAPTURED') {
      if (!state.video && !findPrimaryVideo()) return;
      if (!isMatchingYouTubeVideo(data.url)) return;
      const fileName = (data.url || '').split('?')[0].split('/').pop() || '网络捕获';
      state.diag.interceptorHits.push(data.url || '(inline)');
      loadSubtitleContent(data.content, `自动捕获: ${fileName}`, data.url || '');
    }
  });

  // Subtitle URLs reported by background webRequest monitor (covers Worker requests too)
  const triedUrls = new Set();
  async function tryLoadSubtitleUrl(url) {
    if (!url || triedUrls.has(url)) return;
    if (!state.video && !findPrimaryVideo()) return;
    if (!isMatchingYouTubeVideo(url)) return;
    triedUrls.add(url);
    const entry = { url, result: 'pending' };
    state.diag.monitorUrls.push(entry);

    let text = '';
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (r.ok) text = await r.text();
      else entry.result = `页面fetch HTTP ${r.status}`;
    } catch (e) {
      entry.result = `页面fetch失败: ${e.message}`;
    }
    let sub = Parser.extractSubtitleText(text);
    if (!sub) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'FETCH_TEXT', url });
        if (res && res.ok) sub = Parser.extractSubtitleText(res.text);
        else if (res) entry.result += ` | 后台fetch: ${res.error}`;
        if (res && res.ok && !sub) entry.result = `非字幕内容: ${String(res.text).slice(0, 80)}`;
      } catch (_) {}
    }
    if (sub) {
      entry.result = 'OK';
      const fileName = decodeURIComponent(url.split('?')[0].split('/').pop() || '网络捕获');
      loadSubtitleContent(sub, `自动捕获: ${fileName}`, url);
    }
  }

  function collectDiagnostics() {
    const v = state.video;
    const info = {
      frameUrl: location.href,
      isTop: window === window.top,
      videoCount: collectVideosDeep(document).length,
      iframeCount: document.querySelectorAll('iframe').length,
      overlayMounted: !!(rootEl && rootEl.isConnected)
    };
    if (v) {
      const r = v.getBoundingClientRect();
      info.currentTime = Math.round(v.currentTime * 100) / 100;
      info.paused = v.paused;
      info.duration = Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : String(v.duration);
      const ranges = (tr) => {
        const out = [];
        try {
          for (let i = 0; i < tr.length && i < 6; i++) out.push(`${tr.start(i).toFixed(2)}-${tr.end(i).toFixed(2)}`);
        } catch (_) {}
        return out;
      };
      info.buffered = ranges(v.buffered);
      info.seekable = ranges(v.seekable);
      info.allVideos = collectVideosDeep(document).map((x) => {
        const rr = x.getBoundingClientRect();
        return {
          picked: x === v,
          id: x.id || '',
          size: `${Math.round(rr.width)}x${Math.round(rr.height)}`,
          t: Math.round(x.currentTime * 100) / 100,
          dur: Number.isFinite(x.duration) ? Math.round(x.duration) : String(x.duration),
          paused: x.paused,
          ready: x.readyState
        };
      });
      info.video = {
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        src: (v.currentSrc || v.src || '').slice(0, 160),
        textTracks: Array.from(v.textTracks || []).map((t) => ({
          kind: t.kind,
          label: t.label,
          lang: t.language,
          mode: t.mode,
          cues: t.cues ? t.cues.length : null
        })),
        trackTags: v.querySelectorAll('track').length
      };
      // Elements stacked over the video (canvas-based subtitle renderers, etc.)
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.85;
      info.elementsAtSubtitleArea = document
        .elementsFromPoint(cx, cy)
        .slice(0, 8)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`);
      info.canvasCount = document.querySelectorAll('canvas').length;
      // Sample text near the bottom area of the player
      const host = rootEl && rootEl.parentElement;
      if (host) {
        const texts = [];
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode()) && texts.length < 15) {
          const t = (n.nodeValue || '').trim();
          if (t && n.parentElement && !n.parentElement.closest('.srt-ai-overlay-root')) {
            texts.push(`${n.parentElement.tagName.toLowerCase()}.${(n.parentElement.className || '').toString().slice(0, 40)}: ${t.slice(0, 60)}`);
          }
        }
        info.hostTag = `${host.tagName.toLowerCase()}.${(host.className || '').toString().slice(0, 60)}`;
        info.textInPlayer = texts;
      }
    }
    info.activeCueId = state.activeCueId;
    info.hls = collectHlsDiag();
    info.cuesTotal = state.cues.length;
    if (state.cues.length > 0) {
      info.cueRange = {
        firstStart: state.cues[0].start,
        firstEnd: state.cues[0].end,
        firstText: state.cues[0].text.slice(0, 30),
        lastStart: state.cues[state.cues.length - 1].start,
        lastEnd: state.cues[state.cues.length - 1].end,
        lastText: state.cues[state.cues.length - 1].text.slice(0, 30)
      };
      if (v) {
        const curIdx = Parser.findCueIndexAtTime(state.cues, v.currentTime);
        const t = v.currentTime - (state.settings.timeOffset || 0);
        const nextIdx = Parser.findNextCueIndex(state.cues, t);
        info.nearCues = state.cues
          .slice(Math.max(0, nextIdx - 2), nextIdx + 2)
          .map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)} ${c.text.slice(0, 30)}`);
        info.userTimeOffset = state.settings.timeOffset || 0;
        info.activeCueMatch = curIdx !== -1 ? {
          idx: curIdx,
          start: state.cues[curIdx].start,
          end: state.cues[curIdx].end,
          text: state.cues[curIdx].text.slice(0, 40),
          hasTrans: !!state.translations[state.cues[curIdx].id]
        } : null;
      }
    }
    info.interceptorHits = state.diag.interceptorHits.slice(-10);
    info.monitorUrls = state.diag.monitorUrls.slice(-10);
    return info;
  }

  // Listen to fullscreen changes (Chrome + Safari)
  document.addEventListener('fullscreenchange', () => {
    if (state.video) mountOverlayToVideo(state.video);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (state.video) mountOverlayToVideo(state.video);
  });

  // Listen to messages from popup / background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SETTINGS_UPDATED') {
      const prevKey = getCacheKey();
      state.settings = { ...state.settings, ...(message.settings || {}) };
      const nextKey = getCacheKey();
      applyOverlayStyles();
      updateToolbarUI();
      if (prevKey !== nextKey && state.cues.length > 0) {
        state.translations = {};
        state.failCount = {};
        chrome.storage.local
          .get(nextKey)
          .then((res) => {
            if (res && res[nextKey]) state.translations = res[nextKey];
          })
          .finally(() => {
            renderCurrentCue();
            scheduleTranslation();
          });
      } else {
        renderCurrentCue();
        if (state.settings.enabled) scheduleTranslation();
      }
      sendResponse({ ok: true });
    } else if (message?.type === 'LOAD_SRT_TEXT') {
      loadSubtitleContent(message.content, `手动导入: ${message.fileName || 'SRT'}`);
      sendResponse({ ok: true });
    } else if (message?.type === 'EXPORT_SRT') {
      const res = downloadTranslatedSrt(message.mode);
      sendResponse(res);
    } else if (message?.type === 'PLAYLIST_URL_SEEN') {
      tryLoadPlaylistUrl(message.url);
    } else if (message?.type === 'SUBTITLE_URL_SEEN') {
      tryLoadSubtitleUrl(message.url);
    } else if (message?.type === 'GET_PAGE_STATUS') {
      sendResponse({
        ok: true,
        hasVideo: !!state.video,
        cueCount: state.cues.length,
        translatedCount: Object.keys(state.translations).length,
        subtitleSource: state.subtitleSource,
        translating: state.translating,
        lastError: state.lastError,
        diag: message.withDiag ? collectDiagnostics() : undefined
      });
    }
    return false;
  });

  // Keyboard Shortcut: Alt+T (or Option+T on Mac) to toggle / cycle display mode
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

    if (e.altKey && (e.code === 'KeyT' || e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      e.stopPropagation();
      if (!state.settings.enabled) {
        state.settings.enabled = true;
        state.settings.displayMode = 'bilingual';
      } else if (state.settings.displayMode === 'bilingual') {
        state.settings.displayMode = 'translated';
      } else if (state.settings.displayMode === 'translated') {
        state.settings.displayMode = 'original';
      } else {
        state.settings.enabled = false;
      }
      savePartialSettings({ enabled: state.settings.enabled, displayMode: state.settings.displayMode });
      updateToolbarUI();
      renderCurrentCue();
      showToolbarTemporarily();
      if (state.settings.enabled) scheduleTranslation();
    }
  });

  // Initial load
  chrome.runtime
    .sendMessage({ type: 'GET_SETTINGS' })
    .then((res) => {
      if (res && res.ok && res.settings) {
        state.settings = { ...state.settings, ...res.settings };
      }
    })
    .catch(() => {})
    .finally(() => {
      scanForVideo();
      const observer = new MutationObserver(() => scanForVideo());
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
      setInterval(scanForVideo, 2000);
    });
})();
