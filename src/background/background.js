const DEFAULT_SETTINGS = {
  enabled: true,
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'ollama',
  model: 'qwen2.5:7b',
  targetLang: '简体中文',
  displayMode: 'bilingual', // 'bilingual' | 'translated' | 'original'
  fontSize: 22,
  bottomOffset: 48,
  bgOpacity: 0.65,
  batchSize: 15,
  timeOffset: 0,
  autoDownloadSrt: false,
  domainPreset: 'general',
  customPrompt: '',
  providerProfiles: {}
};

const DOMAIN_PROMPTS = {
  general: '日常影视与综合视频，译文自然口语化。',
  track_fitness:
    '专业田径、跑步技术、体能训练教练教学视频。请使用地道的田径与运动科学术语（如配速、步频、步幅、间歇跑、核心、发力、标志物跑/マーカー走、钻栏、超量恢复等）。注意原字幕可能是语音识别生成，若遇到明显同音字错误（如日语「マーカー層」实为「マーカー走」），请结合田径训练语境自动修正翻译。',
  medical_health:
    '运动康复、解剖学与医学健康视频。请准确翻译肌肉群、关节、生物力学及康复训练专业术语。',
  tech_code:
    '科技数码、人工智能与软件工程视频。请保留常见英文技术专有名词缩写，使用地道的技术社区表达。',
  finance_biz:
    '商业财经、宏观经济与投资访谈视频。请使用准确的金融、商业与经济学专业术语。',
  gaming_anime:
    '游戏电竞、动漫与二次元视频。请使用符合玩家与动漫迷习惯的地道术语。',
  academic:
    '大学公开课、科学探索与纪录片。译文应严谨、准确、逻辑清晰。'
};

async function getSettings() {
  const res = await chrome.storage.local.get('srtAiSettings');
  return { ...DEFAULT_SETTINGS, ...(res.srtAiSettings || {}) };
}

function normalizeChatUrl(baseUrl) {
  let url = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) throw new Error('API Base URL 不能为空');
  if (url.endsWith('/chat/completions')) return url;
  // Any versioned base like /v1, /v4 (Zhipu: /api/paas/v4), /v3 (Volcengine)
  if (/\/v\d+$/.test(url)) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

function normalizeSourceLine(text) {
  // Join internal SRT line breaks without inserting "/" so the model never copies "/" into translations
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

function buildTranslationPrompt(contextCues, targetCues, settings) {
  const targetLang = settings.targetLang || '简体中文';
  const presetDesc = DOMAIN_PROMPTS[settings.domainPreset] || DOMAIN_PROMPTS.general;
  const extraPrompt = (settings.customPrompt || '').trim();

  const contextBlock =
    contextCues && contextCues.length > 0
      ? `前文语境（仅供参考，无需翻译）：\n${contextCues.map((c) => `- ${normalizeSourceLine(c.text)}`).join('\n')}\n\n`
      : '';

  const linesBlock = targetCues
    .map((c) => `[${c.id}] ${normalizeSourceLine(c.text)}`)
    .join('\n');

  const systemLines = [
    `你是一位专业的影视与专业领域字幕翻译专家。请将用户提供的字幕逐条翻译成自然、地道、符合口语习惯的${targetLang}。`,
    `【当前视频领域与背景】：${presetDesc}`
  ];
  if (extraPrompt) {
    systemLines.push(`【用户补充术语/要求】：${extraPrompt}`);
  }
  systemLines.push(
    `【严格规则】：`,
    `1. 保持每条字幕的编号 [ID] 一一对应，不要合并或遗漏条目。`,
    `2. 结合前文语境和视频专业领域，保持专业术语、人名、语气连贯；若某句在原字幕中被断成半句，请结合上下句翻出完整连贯的意思。`,
    `3. 严禁在译文中输出 "/" 斜杠或多余换行符，每条译文应是一句通顺连贯的话。`,
    `4. 只输出纯 JSON 对象，格式为：{"translations": {"ID": "译文", ...}}，不要输出任何额外解释或 markdown 标记。`
  );

  const systemPrompt = systemLines.join('\n');
  const userPrompt = `${contextBlock}请翻译以下字幕条目：\n${linesBlock}`;
  return { systemPrompt, userPrompt };
}

function stripThinking(text) {
  let t = String(text || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Unclosed think block: drop everything before the closing tag if present
  const closeIdx = t.toLowerCase().lastIndexOf('</think>');
  if (closeIdx !== -1) t = t.slice(closeIdx + 8);
  return t.trim();
}

function cleanTranslatedLine(str) {
  return String(str || '')
    .replace(/\s*\/\s*/g, '，')
    .replace(/，+/g, '，')
    .replace(/^，|，$/g, '')
    .trim();
}

function parseTranslationResponse(rawText, targetCues) {
  const result = {};
  if (!rawText) return result;
  const ids = new Set(targetCues.map((c) => c.id));

  const cleaned = stripThinking(rawText).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // 1. JSON (object map, {translations:{}}, or array forms)
  const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i !== -1);
  if (starts.length > 0) {
    const s = Math.min(...starts);
    const e = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (e > s) {
      const jsonStr = cleaned.slice(s, e + 1);
      let parsed = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (_) {
        try {
          parsed = JSON.parse(jsonStr.replace(/,\s*([\]}])/g, '$1'));
        } catch (_) {}
      }

      if (parsed) {
        if (!Array.isArray(parsed) && parsed.translations) parsed = parsed.translations;
        if (Array.isArray(parsed)) {
          parsed.forEach((item, idx) => {
            if (typeof item === 'string') {
              const cue = targetCues[idx];
              if (cue && item.trim()) result[cue.id] = cleanTranslatedLine(item);
            } else if (item && typeof item === 'object') {
              const id = Number(String(item.id ?? item.ID ?? '').replace(/[^\d]/g, ''));
              const text = item.text ?? item.translation ?? item.translated ?? item.zh;
              if (ids.has(id) && typeof text === 'string' && text.trim()) result[id] = cleanTranslatedLine(text);
            }
          });
        } else if (typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            const id = Number(String(k).replace(/[^\d]/g, ''));
            if (ids.has(id) && typeof v === 'string' && v.trim()) result[id] = cleanTranslatedLine(v);
          }
        }
        if (Object.keys(result).length > 0) return result;
      }
    }
  }

  // 2. Fallback: line-by-line parser (tolerates cut-off JSON, bullet points, numbered lists)
  const lineReg = /^(?:[\*\-•]\s*)?(?:ID\s*[:：]?)?\s*[\[【"]?(\d+)[\]】"]?\s*[:：\-\.、]?\s*(.+)$/i;
  for (const line of cleaned.split('\n')) {
    const m = line.trim().match(lineReg);
    if (m) {
      const id = Number(m[1]);
      const text = cleanTranslatedLine(
        m[2].replace(/^["'“”]\s*[:：]?\s*/, '').replace(/["'“”],?\s*$/, '')
      );
      if (ids.has(id) && text) result[id] = text;
    }
  }

  // 3. Single cue: treat the whole reply as the translation
  if (Object.keys(result).length === 0 && targetCues.length === 1 && cleaned && cleaned.length < 400) {
    result[targetCues[0].id] = cleanTranslatedLine(cleaned.replace(/^\[?\d+\]?\s*[:：]?\s*/, ''));
  }
  return result;
}

const GOOGLE_LANG_MAP = {
  '简体中文': 'zh-CN',
  '繁體中文': 'zh-TW',
  'English': 'en',
  '日本語': 'ja'
};

async function callGoogleFreeTranslate(textPayload, targetLang, retries = 2) {
  const tl = GOOGLE_LANG_MAP[targetLang] || 'zh-CN';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: `q=${encodeURIComponent(textPayload)}`
    });
  } catch (netErr) {
    throw new Error('Google 翻译网络连接失败，请确认是否已开启网络代理并能访问 Google 服务');
  }

  if (resp.status === 429) {
    if (retries > 0) {
      // Backoff if rate limited: wait 1.8s then 3s and retry
      const waitMs = retries === 2 ? 1800 : 3200;
      await new Promise((r) => setTimeout(r, waitMs));
      return callGoogleFreeTranslate(textPayload, targetLang, retries - 1);
    }
    throw new Error('Google 翻译频控限流 (429)，请稍等 1 分钟或切换到本地/智谱大模型');
  }

  if (!resp.ok) {
    throw new Error(`Google 翻译请求失败: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google 翻译返回格式异常');
  }
  return data[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
}

async function translateCuesWithGoogleFree(targetCues, targetLang) {
  // Prepend [ID] to each line: Google Translate preserves bracketed numbers perfectly!
  // This allows translating all 15 cues in ONE single HTTP request, eliminating line mismatch
  // and completely avoiding Google's 429 rate limit.
  const payload = targetCues
    .map((c) => `[${c.id}] ${normalizeSourceLine(c.text)}`)
    .join('\n');

  const translatedText = await callGoogleFreeTranslate(payload, targetLang);
  const result = {};
  const ids = new Set(targetCues.map((c) => c.id));
  const lineReg = /^[\[【]?(\d+)[\]】]?\s*[:：\-\.、]?\s*(.+)$/;

  for (const line of translatedText.split('\n')) {
    const m = line.trim().match(lineReg);
    if (m) {
      const id = Number(m[1]);
      if (ids.has(id)) {
        result[id] = cleanTranslatedLine(m[2]);
      }
    }
  }

  // If any cue missed bracket match, fill directly if only 1 cue
  if (Object.keys(result).length === 0 && targetCues.length === 1) {
    result[targetCues[0].id] = cleanTranslatedLine(translatedText);
  }
  return result;
}

const ZHIPU_FREE_FALLBACKS = ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4-flash-250414'];

async function callChatCompletion(settings, messages, temperature = 0.2) {
  const url = normalizeChatUrl(settings.baseUrl);
  const headers = {
    'Content-Type': 'application/json'
  };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${settings.apiKey.trim()}`;
  }

  const isZhipu = /bigmodel\.cn|z\.ai/i.test(url);
  const modelsToTry = [settings.model];
  if (isZhipu && ZHIPU_FREE_FALLBACKS.includes((settings.model || '').toLowerCase())) {
    for (const fb of ZHIPU_FREE_FALLBACKS) {
      if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
    }
  }

  let lastErr = null;
  const isLocal = /localhost|127\.0\.0\.1/i.test(url);
  for (const modelName of modelsToTry) {
    const isQwen3 = /qwen3/i.test(modelName || '') && !/vl/i.test(modelName || '');
    const finalMessages = isQwen3
      ? messages.map((m, idx) => {
          if (idx === messages.length - 1 && m.role === 'user' && !m.content.includes('/no_think')) {
            return { ...m, content: `${m.content} /no_think` };
          }
          return m;
        })
      : messages;

    const body = {
      model: modelName,
      messages: finalMessages,
      temperature,
      max_tokens: 2048
    };
    if (isZhipu) {
      body.thinking = { type: 'disabled' };
    } else if (isQwen3) {
      body.chat_template_kwargs = { enable_thinking: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), isLocal ? 60000 : 35000);

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new Error(`模型响应超时 (${isLocal ? '60s' : '35s'})，请检查模型负载或调小批次`);
      }
      throw e;
    }
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('模型返回格式异常，未找到 choices[0].message.content');
      }
      return content;
    }

    const errText = await resp.text().catch(() => '');
    lastErr = new Error(`HTTP ${resp.status} (${modelName}): ${errText.slice(0, 300) || resp.statusText}`);
    // If 429 (1305 overloaded) and we have fallback models left, try the next one immediately
    if (resp.status === 429 && modelsToTry.length > 1) {
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

async function translateCues(settings, contextCues, targetCues, depth = 0) {
  const { systemPrompt, userPrompt } = buildTranslationPrompt(contextCues, targetCues, settings);
  const raw = await callChatCompletion(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
  const translations = parseTranslationResponse(raw, targetCues);

  // Retry the missing ones in smaller chunks (models often drop/merge lines in big batches)
  const missing = targetCues.filter((c) => !translations[c.id]);
  if (missing.length > 0 && depth < 2 && targetCues.length > 1) {
    const chunkSize = Math.max(1, Math.ceil(missing.length / 2));
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      try {
        const sub = await translateCues(settings, contextCues, chunk, depth + 1);
        Object.assign(translations, sub);
      } catch (_) {
        // keep partial results
      }
    }
  }
  if (Object.keys(translations).length === 0) lastRawOutput = raw;
  return translations;
}

let lastRawOutput = '';

async function handleTranslateBatch(payload) {
  const settings = await getSettings();
  const { contextCues = [], targetCues = [] } = payload;
  if (targetCues.length === 0) return { translations: {} };

  if (settings.provider === 'google_free') {
    const translations = await translateCuesWithGoogleFree(targetCues, settings.targetLang);
    return { translations };
  }

  const translations = await translateCues(settings, contextCues, targetCues);
  if (Object.keys(translations).length === 0) {
    const preview = stripThinking(lastRawOutput).replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`无法解析模型输出: ${preview || '(空)'}`);
  }
  return { translations };
}

async function handleTestConnection(customSettings) {
  const settings = customSettings ? { ...DEFAULT_SETTINGS, ...customSettings } : await getSettings();
  const start = Date.now();
  if (settings.provider === 'google_free') {
    const res = await callGoogleFreeTranslate(['Hello, welcome to the movie!'], settings.targetLang);
    return {
      ok: true,
      reply: res.join(' '),
      latencyMs: Date.now() - start
    };
  }
  const reply = await callChatCompletion(
    settings,
    [
      {
        role: 'system',
        content: `Translate the user text to ${settings.targetLang}. Reply with the translation only.`
      },
      { role: 'user', content: 'Hello, welcome to the movie!' }
    ],
    0.1
  );
  return {
    ok: true,
    reply: stripThinking(reply),
    latencyMs: Date.now() - start
  };
}

async function handleClearCache() {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter((k) => k.startsWith('srtCache_'));
  if (cacheKeys.length > 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
  return { removed: cacheKeys.length };
}

// ---------------- Network monitor (sees worker/XHR/fetch requests of every tab) ----------------
const tabRequests = new Map(); // tabId -> [{url,type,status,ct,frameId,t}]
const SKIP_EXT = /\.(js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|mkv|m4s|ts|m3u8|mp3|aac|flac|wasm|map)(\?|$)/i;
const SUB_URL_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)|subtitle|caption|timedtext|aisubtitle|\/subs?\b|[?&/_-]sub(s|title)?[=/_-]/i;

function isSubtitleCandidate(url, type, ct) {
  if (type === 'media' || type === 'image' || type === 'font' || type === 'stylesheet' || type === 'script') return false;
  if (SKIP_EXT.test(url)) return false;
  const c = (ct || '').toLowerCase();
  if (c.includes('text/vtt') || c.includes('subrip') || c.includes('x-ssa') || c.includes('x-ass')) return true;
  return SUB_URL_RE.test(url);
}

if (typeof chrome !== 'undefined' && chrome.webRequest && chrome.webRequest.onCompleted) {
  chrome.webRequest.onCompleted.addListener(
    (d) => {
      if (d.tabId < 0) return;
      if (d.type === 'main_frame') tabRequests.set(d.tabId, []);
      const ct = (d.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-type')?.value || '';
      const list = tabRequests.get(d.tabId) || [];
      list.push({ url: d.url, type: d.type, status: d.statusCode, ct, frameId: d.frameId, t: Date.now() });
      if (list.length > 400) list.splice(0, list.length - 400);
      tabRequests.set(d.tabId, list);

      if (d.statusCode >= 200 && d.statusCode < 300 && isSubtitleCandidate(d.url, d.type, ct)) {
        chrome.tabs.sendMessage(d.tabId, { type: 'SUBTITLE_URL_SEEN', url: d.url }).catch(() => {});
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => tabRequests.delete(tabId));
}

async function handleFetchText(url) {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) throw new Error('文件过大');
  return new TextDecoder('utf-8').decode(buf);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'GET_TAB_REQUESTS': {
          const list = tabRequests.get(message.tabId) || [];
          sendResponse({
            ok: true,
            requests: list.filter((r) => !['image', 'font', 'stylesheet', 'media'].includes(r.type)).slice(-120),
            mediaCount: list.filter((r) => r.type === 'media').length
          });
          break;
        }
        case 'FETCH_TEXT': {
          const text = await handleFetchText(message.url);
          sendResponse({ ok: true, text });
          break;
        }
        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          break;
        }
        case 'SAVE_SETTINGS': {
          const current = await getSettings();
          const next = { ...current, ...(message.settings || {}) };
          await chrome.storage.local.set({ srtAiSettings: next });
          sendResponse({ ok: true, settings: next });
          break;
        }
        case 'TRANSLATE_BATCH': {
          const res = await handleTranslateBatch(message.payload || {});
          sendResponse({ ok: true, ...res });
          break;
        }
        case 'TEST_CONNECTION': {
          const res = await handleTestConnection(message.settings);
          sendResponse(res);
          break;
        }
        case 'CLEAR_CACHE': {
          const res = await handleClearCache();
          sendResponse({ ok: true, ...res });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true; // Keep message channel open for async response
});
