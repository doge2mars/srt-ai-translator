/**
 * SRT / WebVTT subtitle parser and utilities.
 * Exposed on window.SrtParser for content scripts.
 */
(function (global) {
  'use strict';

  function parseTimestamp(ts) {
    // Supports HH:MM:SS,mmm | HH:MM:SS.mmm | MM:SS.mmm
    const cleaned = ts.trim().replace(',', '.');
    const parts = cleaned.split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return h * 3600 + m * 60 + s;
    }
    if (parts.length === 2) {
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return m * 60 + s;
    }
    return 0;
  }

  function cleanSubtitleText(raw) {
    return raw
      .replace(/\{\\[^}]+\}/g, '') // Strip ASS/SSA override tags like {\an8}
      .replace(/<[^>]+>/g, '')     // Strip HTML tags like <i>, <font>
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function isAss(text) {
    return /\[Events\]/i.test(text) || /^Dialogue:\s*\d/m.test(text);
  }

  function isYouTubeXml(text) {
    return /<transcript[\s>]/i.test(text) && /<text\s+start=/i.test(text);
  }

  function parseYouTubeXml(text) {
    const cues = [];
    const re = /<text\s+[^>]*start=["']([\d.]+)["'][^>]*dur=["']([\d.]+)["'][^>]*>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = parseFloat(m[1]) || 0;
      const dur = parseFloat(m[2]) || 2;
      const raw = m[3]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');
      const clean = cleanSubtitleText(raw);
      if (!clean) continue;
      cues.push({ id: cues.length, start, end: start + dur, text: clean });
    }
    return cues;
  }

  function parseJsonSubtitleObject(obj) {
    if (!obj || typeof obj !== 'object') return null;

    // 1. YouTube timedtext fmt=json3: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }
    if (Array.isArray(obj.events)) {
      const rawEvents = [];
      for (const ev of obj.events) {
        if (!ev || !Array.isArray(ev.segs) || typeof ev.tStartMs !== 'number') continue;
        const text = ev.segs
          .map((s) => (s && typeof s.utf8 === 'string' ? s.utf8 : ''))
          .join('')
          .replace(/\n+/g, ' ')
          .trim();
        if (!text) continue;
        const start = ev.tStartMs / 1000;
        const dur = (typeof ev.dDurationMs === 'number' ? ev.dDurationMs : 2500) / 1000;
        rawEvents.push({ start, end: start + dur, text });
      }
      if (rawEvents.length > 0) {
        // 1) Clamp overlapping end times (common in YouTube auto-generated captions)
        const clamped = [];
        for (let i = 0; i < rawEvents.length; i++) {
          const cur = rawEvents[i];
          const next = rawEvents[i + 1];
          const end = next && next.start > cur.start && next.start < cur.end ? next.start : cur.end;
          if (end - cur.start < 0.05) continue;
          clamped.push({ start: cur.start, end, text: cur.text });
        }

        // 2) Smartly merge fragmented ASR cues into natural sentence clauses
        const cues = [];
        for (let i = 0; i < clamped.length; i++) {
          const cur = { ...clamped[i] };
          while (i + 1 < clamped.length) {
            const nxt = clamped[i + 1];
            const endsWithPunct = /[.?!。？！…♪"”’)]$/.test(cur.text);
            const gap = nxt.start - cur.end;
            const totalDur = nxt.end - cur.start;
            const isCjk = /[\u3040-\u30ff\u4e00-\u9fff]/.test(cur.text);
            const maxLen = isCjk ? 38 : 92;
            const joiner = isCjk ? ' ' : ' ';
            const combinedLen = cur.text.length + 1 + nxt.text.length;

            if (!endsWithPunct && gap <= 0.55 && totalDur <= 6.8 && combinedLen <= maxLen) {
              cur.text = `${cur.text}${joiner}${nxt.text}`.replace(/\s+/g, ' ').trim();
              cur.end = nxt.end;
              i++;
            } else {
              break;
            }
          }
          cues.push({ id: cues.length, start: cur.start, end: cur.end, text: cur.text });
        }
        return cues;
      }
    }

    // 2. Bilibili JSON subtitle: { body: [{ from, to, content }] }
    if (Array.isArray(obj.body) && obj.body.length > 0 && typeof obj.body[0].from === 'number') {
      const cues = [];
      for (const item of obj.body) {
        const text = cleanSubtitleText(String(item.content || ''));
        if (!text) continue;
        cues.push({ id: cues.length, start: Number(item.from) || 0, end: Number(item.to) || 0, text });
      }
      if (cues.length > 0) return cues;
    }

    return null;
  }

  function parseAss(content) {
    const lines = content.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
    let inEvents = false;
    let fields = null;
    const raw = [];
    for (const line of lines) {
      const t = line.trim();
      if (/^\[.+\]$/.test(t)) {
        inEvents = /^\[Events\]$/i.test(t);
        continue;
      }
      if (!inEvents) continue;
      if (/^Format:/i.test(t)) {
        fields = t.slice(7).split(',').map((s) => s.trim().toLowerCase());
        continue;
      }
      if (/^Dialogue:/i.test(t)) {
        const f = fields || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
        const body = t.slice(9).trim();
        const parts = body.split(',');
        if (parts.length < f.length) continue;
        const head = parts.slice(0, f.length - 1);
        const text = parts.slice(f.length - 1).join(',');
        const start = parseTimestamp(head[f.indexOf('start')] || '0');
        const end = parseTimestamp(head[f.indexOf('end')] || '0');
        const clean = cleanSubtitleText(text.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '));
        if (!clean || end <= start) continue;
        raw.push({ start, end, text: clean });
      }
    }
    raw.sort((a, b) => a.start - b.start);
    const seen = new Set();
    const cues = [];
    for (const c of raw) {
      const key = `${c.start}|${c.end}|${c.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cues.push({ id: cues.length, ...c });
    }
    return cues;
  }

  /** Extract SRT/VTT/ASS/YouTube/Bilibili text from raw payload. */
  function extractSubtitleText(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        // Check if this JSON is directly a YouTube json3 or Bilibili subtitle object
        if (parseJsonSubtitleObject(parsed)) return trimmed;
        const queue = [parsed];
        let guard = 0;
        while (queue.length > 0 && guard++ < 5000) {
          const cur = queue.shift();
          if (typeof cur === 'string') {
            if (looksLikeSubtitle(cur)) return cur;
          } else if (cur && typeof cur === 'object') {
            if (parseJsonSubtitleObject(cur)) return JSON.stringify(cur);
            for (const v of Object.values(cur)) queue.push(v);
          }
        }
        return null;
      } catch (_) {
        // not JSON (ASS files start with "[Script Info]")
      }
    }
    return looksLikeSubtitle(raw) ? raw : null;
  }

  function parseSubtitle(content, options = {}) {
    if (!content || typeof content !== 'string') return [];
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const jsonCues = parseJsonSubtitleObject(JSON.parse(trimmed));
        if (jsonCues && jsonCues.length > 0) return jsonCues;
      } catch (_) {}
    }
    if (isYouTubeXml(content)) return parseYouTubeXml(content);
    if (isAss(content)) return parseAss(content);

    // HLS WebVTT X-TIMESTAMP-MAP or URL PTS detection
    let timeOffset = 0;
    const tsMapMatch = content.match(/X-TIMESTAMP-MAP\s*=\s*([^\r\n]+)/i);
    if (tsMapMatch) {
      const mapStr = tsMapMatch[1];
      const localMatch = mapStr.match(/LOCAL:([0-9:.]+)/i);
      const mpegMatch = mapStr.match(/MPEGTS:(\d+)/i);
      if (localMatch && mpegMatch) {
        const localSec = parseTimestamp(localMatch[1] || '0');
        const mpegSec = parseInt(mpegMatch[1], 10) / 90000;
        timeOffset = mpegSec - localSec;
      }
    } else if (options && typeof options.url === 'string') {
      const ptsMatch = options.url.match(/pts_(\d+)/i);
      if (ptsMatch) {
        const rawPts = parseInt(ptsMatch[1], 10);
        // Disney+ (BAMTech) uses millisecond timestamps in pts_xxxxxx.vtt (e.g., 2563728 ms = 2563.7s = 42m43s)
        timeOffset = rawPts / 1000;
      }
    }

    const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    const timeRegex = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trimEnd());
      if (lines.length === 0) continue;

      // Skip WEBVTT header, NOTE, STYLE, REGION blocks
      const first = lines[0].trim();
      if (
        first.startsWith('WEBVTT') ||
        first.startsWith('NOTE') ||
        first.startsWith('STYLE') ||
        first.startsWith('REGION')
      ) {
        continue;
      }

      let timeLineIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        if (timeRegex.test(lines[i])) {
          timeLineIdx = i;
          break;
        }
      }
      if (timeLineIdx === -1) continue;

      const timeLine = lines[timeLineIdx];
      const arrowIdx = timeLine.indexOf('-->');
      const startStr = timeLine.slice(0, arrowIdx).trim();
      // VTT can have cue settings after end timestamp (e.g., "00:01:00.000 align:start")
      const endPart = timeLine.slice(arrowIdx + 3).trim().split(/\s+/)[0];

      let start = parseTimestamp(startStr);
      let end = parseTimestamp(endPart);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

      const text = cleanSubtitleText(lines.slice(timeLineIdx + 1).join('\n'));
      if (!text) continue;

      cues.push({
        id: cues.length,
        start,
        end,
        text
      });
    }

    // Apply HLS WebVTT PTS offset if chunk cues are relative (e.g. starting near 0:00 while offset is minutes into the video)
    if (timeOffset > 0 && cues.length > 0) {
      const firstStart = cues[0].start;
      if (firstStart < timeOffset - 10) {
        cues.forEach((c) => {
          c.start += timeOffset;
          c.end += timeOffset;
        });
      }
    }

    // Sort by start time just in case
    cues.sort((a, b) => a.start - b.start);
    cues.forEach((c, idx) => {
      c.id = idx;
    });
    return cues;
  }

  function looksLikeSubtitle(text) {
    if (!text || typeof text !== 'string' || text.length < 10) return false;
    const sample = text.slice(0, 4000);
    if (/^\uFEFF?WEBVTT/i.test(sample.trimStart())) return true;
    if (isAss(text) || isYouTubeXml(text)) return true;
    if (/"events"\s*:\s*\[[\s\S]*?"tStartMs"/i.test(sample)) return true;
    if (/"body"\s*:\s*\[[\s\S]*?"from"\s*:/i.test(sample)) return true;
    return /\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}/.test(sample);
  }

  function findCueIndexAtTime(cues, time) {
    if (!cues || cues.length === 0) return -1;
    let lo = 0;
    let hi = cues.length - 1;
    let candidate = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= time) {
        candidate = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (candidate !== -1 && time <= cues[candidate].end) {
      return candidate;
    }
    // Check a couple of preceding cues in case of overlapping cues
    for (let i = candidate - 1; i >= Math.max(0, candidate - 3); i--) {
      if (time >= cues[i].start && time <= cues[i].end) {
        return i;
      }
    }
    return -1;
  }

  function findNextCueIndex(cues, time) {
    if (!cues || cues.length === 0) return 0;
    let lo = 0;
    let hi = cues.length - 1;
    let ans = cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].end >= time) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function hashString(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function formatSrtTimestamp(sec) {
    const clamped = Math.max(0, Number(sec) || 0);
    const totalMs = Math.round(clamped * 1000);
    const ms = String(totalMs % 1000).padStart(3, '0');
    const totalSec = Math.floor(totalMs / 1000);
    const s = String(totalSec % 60).padStart(2, '0');
    const totalMin = Math.floor(totalSec / 60);
    const m = String(totalMin % 60).padStart(2, '0');
    const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
    return `${h}:${m}:${s},${ms}`;
  }

  function exportSrt(cues, translations, mode = 'bilingual', timeOffset = 0) {
    if (!cues || cues.length === 0) return '';
    const offset = Number(timeOffset) || 0;
    const blocks = [];
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const start = formatSrtTimestamp(c.start + offset);
      const end = formatSrtTimestamp(c.end + offset);
      const trans = (translations && translations[c.id]) ? translations[c.id].trim() : '';
      let body = '';
      if (mode === 'translated') {
        body = trans || c.text;
      } else if (mode === 'original') {
        body = c.text;
      } else {
        // bilingual: translated on top, original below
        body = trans ? `${trans}\n${c.text}` : c.text;
      }
      blocks.push(`${i + 1}\n${start} --> ${end}\n${body}`);
    }
    return blocks.join('\n\n') + '\n';
  }

  function mergeCues(existingCues, newCues, existingTranslations = {}) {
    if (!existingCues || existingCues.length === 0) {
      return { cues: newCues || [], translations: existingTranslations || {} };
    }
    if (!newCues || newCues.length === 0) {
      return { cues: existingCues, translations: existingTranslations };
    }

    // Map existing translations by exact text and timestamp signature
    const transMap = new Map();
    for (const c of existingCues) {
      if (existingTranslations[c.id]) {
        transMap.set(`${Math.round(c.start * 10) / 10}_${c.text}`, existingTranslations[c.id]);
        transMap.set(c.text, existingTranslations[c.id]);
      }
    }

    const merged = [...existingCues];
    for (const nc of newCues) {
      // Check if duplicate already exists (overlap in time + same text)
      const exists = merged.some(
        (ec) => Math.abs(ec.start - nc.start) < 0.6 && ec.text === nc.text
      );
      if (!exists) {
        merged.push({ start: nc.start, end: nc.end, text: nc.text });
      }
    }

    // Sort all merged cues by start time
    merged.sort((a, b) => a.start - b.start);

    // Re-index continuous IDs and restore translations
    const finalTranslations = {};
    merged.forEach((c, idx) => {
      c.id = idx;
      const keyExact = `${Math.round(c.start * 10) / 10}_${c.text}`;
      if (transMap.has(keyExact)) {
        finalTranslations[idx] = transMap.get(keyExact);
      } else if (transMap.has(c.text)) {
        finalTranslations[idx] = transMap.get(c.text);
      }
    });

    return { cues: merged, translations: finalTranslations };
  }

  global.SrtParser = {
    parseSubtitle,
    looksLikeSubtitle,
    extractSubtitleText,
    findCueIndexAtTime,
    findNextCueIndex,
    hashString,
    formatSrtTimestamp,
    exportSrt,
    mergeCues
  };
})(window);
