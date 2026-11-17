/**
 * Runs in page MAIN world to passively intercept .srt / .vtt subtitle network responses
 * (such as fnOS web player loading same-directory subtitle files).
 */
(function () {
  'use strict';

  // If the browser ignored `"world": "MAIN"` (e.g. older Safari/Firefox) and ran this in Isolated World,
  // inject into the page's MAIN world via <script src> so XHR/fetch hooks work everywhere.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.getURL) {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('src/content/interceptor.js');
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (_) {}
    return;
  }

  if (window.__srtAiInterceptorInstalled) return;
  window.__srtAiInterceptorInstalled = true;

  function isSubtitleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    return (
      clean.endsWith('.srt') ||
      clean.endsWith('.vtt') ||
      clean.endsWith('.ass') ||
      /sub(title)?|caption|timedtext|aisubtitle|vtt|srt|track/i.test(url)
    );
  }

  function looksLikeSubtitleText(text) {
    if (!text || typeof text !== 'string' || text.length < 10) return false;
    const head = text.slice(0, 4000);
    if (/^\uFEFF?WEBVTT/i.test(head.trimStart())) return true;
    if (/\[Events\]/i.test(text) || /^Dialogue:\s*\d/m.test(head)) return true;
    if (/<transcript[\s>]/i.test(head) && /<text\s+start=/i.test(head)) return true;
    if (/"events"\s*:\s*\[[\s\S]*?"tStartMs"/i.test(head)) return true;
    if (/"body"\s*:\s*\[[\s\S]*?"from"\s*:/i.test(head)) return true;
    return /\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}/.test(head);
  }

  function extractSubtitleFromPayload(raw) {
    if (!raw || typeof raw !== 'string') return null;
    if (looksLikeSubtitleText(raw)) return raw;

    // Some NAS players wrap SRT/VTT inside JSON (e.g., { data: "1\n00:00:..." })
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const obj = JSON.parse(trimmed);
        const queue = [obj];
        while (queue.length > 0) {
          const cur = queue.shift();
          if (typeof cur === 'string' && looksLikeSubtitleText(cur)) {
            return cur;
          }
          if (cur && typeof cur === 'object') {
            for (const val of Object.values(cur)) {
              if (typeof val === 'string' && looksLikeSubtitleText(val)) return val;
              if (val && typeof val === 'object') queue.push(val);
            }
          }
        }
      } catch (_) {
        // Not valid JSON
      }
    }
    return null;
  }

  // HLS subtitle playlist (m3u8 listing .vtt segments) -> lets content script map segments onto the player timeline
  function maybeEmitPlaylist(url, text) {
    if (!text || typeof text !== 'string') return false;
    const head = text.slice(0, 200).trimStart();
    if (!head.startsWith('#EXTM3U')) return false;
    if (!/#EXTINF/i.test(text) || !/\.(vtt|webvtt)(\?|\s|$)/im.test(text)) return false;
    window.postMessage(
      { source: 'srt-ai-interceptor', type: 'PLAYLIST_CAPTURED', url: url || '', content: text },
      '*'
    );
    return true;
  }

  function emitSubtitle(url, rawContent) {
    if (maybeEmitPlaylist(url, rawContent)) return;
    const content = extractSubtitleFromPayload(rawContent);
    if (!content) return;
    window.postMessage(
      {
        source: 'srt-ai-interceptor',
        type: 'SUBTITLE_CAPTURED',
        url: url || '',
        content
      },
      '*'
    );
  }

  // Hook window.fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        const ct = (response.headers && response.headers.get('content-type')) || '';
        const mightBeSub =
          isSubtitleUrl(reqUrl) ||
          /mpegurl/i.test(ct) ||
          /\.m3u8(\?|$)/i.test(reqUrl) ||
          ct.includes('text/vtt') ||
          ct.includes('application/x-subrip') ||
          ct.includes('text/srt') ||
          ct.includes('text/plain') ||
          ct.includes('application/octet-stream') ||
          (ct.includes('application/json') && isSubtitleUrl(reqUrl));

        if (mightBeSub && response.ok) {
          const clone = response.clone();
          clone.text().then((text) => emitSubtitle(reqUrl, text)).catch(() => {});
        }
      } catch (_) {
        // Ignore inspection errors
      }
      return response;
    };
  }

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__srtAiUrl = typeof url === 'string' ? url : '';
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        if (this.status < 200 || this.status >= 300) return;
        const url = this.__srtAiUrl || '';
        if (this.responseType === '' || this.responseType === 'text') {
          const text = this.responseText;
          if (maybeEmitPlaylist(url, text)) return;
          if (isSubtitleUrl(url) || looksLikeSubtitleText(text)) {
            emitSubtitle(url, text);
          }
        } else if (this.responseType === 'arraybuffer' && this.response instanceof ArrayBuffer) {
          if (isSubtitleUrl(url) || this.response.byteLength < 2 * 1024 * 1024) {
            const text = new TextDecoder('utf-8').decode(this.response);
            if (maybeEmitPlaylist(url, text)) return;
            if (isSubtitleUrl(url) || looksLikeSubtitleText(text)) {
              emitSubtitle(url, text);
            }
          }
        } else if (this.responseType === 'blob' && this.response instanceof Blob) {
          if (isSubtitleUrl(url) || this.response.size < 2 * 1024 * 1024) {
            this.response.text().then((text) => {
              if (maybeEmitPlaylist(url, text)) return;
              if (isSubtitleUrl(url) || looksLikeSubtitleText(text)) {
                emitSubtitle(url, text);
              }
            }).catch(() => {});
          }
        } else if (this.responseType === 'json' && this.response && isSubtitleUrl(url)) {
          emitSubtitle(url, JSON.stringify(this.response));
        }
      } catch (_) {
        // Ignore inspection errors
      }
    });
    return origSend.apply(this, args);
  };

  // YouTube helper: auto-fetch captionTrack or trigger CC so timedtext is requested
  if (/youtube\.com$/i.test(location.hostname)) {
    let lastYtVideoId = '';
    const checkYouTubeCaptions = () => {
      try {
        const params = new URLSearchParams(location.search);
        const vid = params.get('v') || '';
        if (!vid || vid === lastYtVideoId) return;

        const player = document.getElementById('movie_player');
        const resp =
          (player && typeof player.getPlayerResponse === 'function' && player.getPlayerResponse()) ||
          window.ytInitialPlayerResponse;
        const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          lastYtVideoId = vid;
          const ccBtn = document.querySelector('.ytp-subtitles-button[aria-pressed="false"]');
          if (ccBtn) {
            ccBtn.click();
          } else if (tracks[0]?.baseUrl) {
            fetch(`${tracks[0].baseUrl}&fmt=json3`)
              .then((r) => (r.ok ? r.text() : ''))
              .then((t) => emitSubtitle(tracks[0].baseUrl, t))
              .catch(() => {});
          }
        }
      } catch (_) {}
    };
    window.addEventListener('yt-navigate-finish', () => setTimeout(checkYouTubeCaptions, 800));
    setInterval(checkYouTubeCaptions, 2500);
  }
})();
