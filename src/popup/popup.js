const PRESETS = {
  google_free: {
    baseUrl: 'https://translate.googleapis.com',
    apiKey: '',
    model: 'google-gtx-free'
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'qwen2.5:7b'
  },
  lmstudio: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    model: 'local-model'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4.7-flash'
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini'
  }
};

const els = {
  enabled: document.getElementById('enabled'),
  provider: document.getElementById('provider'),
  baseUrl: document.getElementById('baseUrl'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  targetLang: document.getElementById('targetLang'),
  domainPreset: document.getElementById('domainPreset'),
  customPrompt: document.getElementById('customPrompt'),
  displayMode: document.getElementById('displayMode'),
  batchSize: document.getElementById('batchSize'),
  fontSize: document.getElementById('fontSize'),
  fontSizeVal: document.getElementById('fontSizeVal'),
  bottomOffset: document.getElementById('bottomOffset'),
  bottomOffsetVal: document.getElementById('bottomOffsetVal'),
  testBtn: document.getElementById('testBtn'),
  saveBtn: document.getElementById('saveBtn'),
  testResult: document.getElementById('testResult'),
  importSrtBtn: document.getElementById('importSrtBtn'),
  exportSrtBtn: document.getElementById('exportSrtBtn'),
  autoDownloadSrt: document.getElementById('autoDownloadSrt'),
  popupFileInput: document.getElementById('popupFileInput'),
  pageStatusText: document.getElementById('pageStatusText'),
  pageSubSource: document.getElementById('pageSubSource'),
  clearCacheBtn: document.getElementById('clearCacheBtn'),
  cacheMsg: document.getElementById('cacheMsg')
};

let providerProfiles = {};

function saveCurrentProviderProfile() {
  const p = els.provider.value;
  if (!p || p === 'google_free') return;
  providerProfiles[p] = {
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim()
  };
}

function collectSettingsFromUI() {
  saveCurrentProviderProfile();
  return {
    enabled: els.enabled.checked,
    provider: els.provider.value,
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim(),
    targetLang: els.targetLang.value,
    domainPreset: els.domainPreset.value,
    customPrompt: els.customPrompt.value.trim(),
    displayMode: els.displayMode.value,
    batchSize: Number(els.batchSize.value) || 15,
    fontSize: Number(els.fontSize.value) || 22,
    bottomOffset: Number(els.bottomOffset.value) || 48,
    autoDownloadSrt: !!els.autoDownloadSrt.checked,
    providerProfiles
  };
}

function applySettingsToUI(s) {
  providerProfiles = { ...(s.providerProfiles || {}) };
  els.enabled.checked = !!s.enabled;
  els.provider.value = s.provider || 'ollama';
  els.baseUrl.value = s.baseUrl || '';
  els.apiKey.value = s.apiKey || '';
  els.model.value = s.model || '';
  // Seed current provider profile if not yet stored
  if (s.provider && s.provider !== 'google_free' && !providerProfiles[s.provider]) {
    providerProfiles[s.provider] = {
      baseUrl: s.baseUrl || '',
      apiKey: s.apiKey || '',
      model: s.model || ''
    };
  }
  els.targetLang.value = s.targetLang || '简体中文';
  els.domainPreset.value = s.domainPreset || 'general';
  els.customPrompt.value = s.customPrompt || '';
  els.displayMode.value = s.displayMode || 'bilingual';
  els.batchSize.value = s.batchSize || 15;
  els.fontSize.value = s.fontSize || 22;
  els.fontSizeVal.textContent = els.fontSize.value;
  els.bottomOffset.value = s.bottomOffset || 48;
  els.bottomOffsetVal.textContent = els.bottomOffset.value;
  els.autoDownloadSrt.checked = !!s.autoDownloadSrt;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function notifyActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    return null;
  }
}

/** Query every frame and return the status of the frame that owns the video (or the top frame). */
async function getPageStatus(withDiag = false) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return { best: null, all: [] };
  let frames = [{ frameId: 0 }];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames;
  } catch (_) {}
  const all = await Promise.all(
    frames.map((f) =>
      chrome.tabs
        .sendMessage(tab.id, { type: 'GET_PAGE_STATUS', withDiag }, { frameId: f.frameId })
        .then((res) => (res ? { frameId: f.frameId, ...res } : null))
        .catch(() => null)
    )
  );
  const valid = all.filter(Boolean);
  const best =
    valid.find((r) => r.cueCount > 0) || valid.find((r) => r.hasVideo) || valid.find((r) => r.frameId === 0) || null;
  return { best, all: valid, tabId: tab.id };
}

async function saveAndSyncSettings(showMsg = true) {
  const settings = collectSettingsFromUI();
  const res = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  if (res && res.ok) {
    await notifyActiveTab({ type: 'SETTINGS_UPDATED', settings: res.settings });
    if (showMsg) {
      els.testResult.className = 'msg ok';
      els.testResult.textContent = '设置已保存并同步到当前视频';
    }
  }
}

async function refreshPageStatus() {
  const { best: res } = await getPageStatus(false);
  if (!res) {
    els.pageStatusText.textContent = '当前页面未检测到视频播放器';
    els.pageSubSource.textContent = '请打开飞牛OS视频播放页';
    return;
  }
  if (!res.hasVideo) {
    els.pageStatusText.textContent = '未检测到 <video> 元素';
    els.pageSubSource.textContent = '请先开始播放视频';
  } else if (res.cueCount === 0) {
    els.pageStatusText.textContent = '已检测到视频，等待加载字幕';
    els.pageSubSource.textContent = '可直接拖入 .srt 文件或点击右侧导入';
  } else {
    els.pageStatusText.textContent = `已加载 ${res.cueCount} 条字幕（已译 ${res.translatedCount}）`;
    els.pageSubSource.textContent = res.lastError ? `错误: ${res.lastError}` : res.subtitleSource || '';
  }
}

// Event Listeners
let autoSaveTimer = null;
function scheduleAutoSave() {
  saveCurrentProviderProfile();
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveAndSyncSettings(false), 250);
}

els.provider.addEventListener('change', () => {
  const nextProv = els.provider.value;
  const saved = providerProfiles[nextProv];
  const preset = PRESETS[nextProv];
  if (saved) {
    els.baseUrl.value = saved.baseUrl || (preset && preset.baseUrl) || '';
    els.model.value = saved.model || (preset && preset.model) || '';
    els.apiKey.value = saved.apiKey !== undefined ? saved.apiKey : (preset && preset.apiKey) || '';
  } else if (preset) {
    els.baseUrl.value = preset.baseUrl;
    els.model.value = preset.model;
    if (preset.apiKey !== undefined) els.apiKey.value = preset.apiKey;
  }
  saveAndSyncSettings(false);
});

[els.baseUrl, els.model, els.apiKey, els.customPrompt, els.batchSize].forEach((el) => {
  el.addEventListener('input', scheduleAutoSave);
});

els.fontSize.addEventListener('input', () => {
  els.fontSizeVal.textContent = els.fontSize.value;
});

els.bottomOffset.addEventListener('input', () => {
  els.bottomOffsetVal.textContent = els.bottomOffset.value;
});

[els.enabled, els.targetLang, els.domainPreset, els.displayMode, els.fontSize, els.bottomOffset, els.autoDownloadSrt].forEach((el) => {
  el.addEventListener('change', () => saveAndSyncSettings(false));
});

els.saveBtn.addEventListener('click', () => saveAndSyncSettings(true));

els.testBtn.addEventListener('click', async () => {
  await saveAndSyncSettings(false);
  els.testResult.className = 'msg';
  els.testResult.textContent = '正在测试连接...';
  const settings = collectSettingsFromUI();
  const res = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', settings });
  if (res && res.ok) {
    els.testResult.className = 'msg ok';
    els.testResult.textContent = `连接成功 (${res.latencyMs}ms): ${res.reply}`;
  } else {
    els.testResult.className = 'msg err';
    els.testResult.textContent = `连接失败: ${(res && res.error) || '未知错误'}`;
  }
});

els.importSrtBtn.addEventListener('click', () => {
  els.popupFileInput.click();
});

els.exportSrtBtn.addEventListener('click', async () => {
  const res = await notifyActiveTab({ type: 'EXPORT_SRT' });
  if (res && res.ok) {
    els.cacheMsg.textContent = `已下载: ${res.fileName}`;
  } else {
    els.cacheMsg.textContent = (res && res.error) || '当前页面还没有可导出的字幕';
  }
});

els.popupFileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    if (typeof reader.result === 'string') {
      await notifyActiveTab({
        type: 'LOAD_SRT_TEXT',
        content: reader.result,
        fileName: file.name
      });
      await refreshPageStatus();
    }
  };
  reader.readAsText(file, 'utf-8');
  els.popupFileInput.value = '';
});

els.clearCacheBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
  if (res && res.ok) {
    els.cacheMsg.textContent = `已清除 ${res.removed} 部视频缓存`;
  }
});

// Diagnostics
document.getElementById('diagBtn').addEventListener('click', async () => {
  const out = document.getElementById('diagOutput');
  out.value = '正在收集...';
  const { all, tabId } = await getPageStatus(true);
  let net = null;
  try {
    net = await chrome.runtime.sendMessage({ type: 'GET_TAB_REQUESTS', tabId });
  } catch (_) {}
  const report = {
    version: chrome.runtime.getManifest().version,
    ua: navigator.userAgent,
    frames: all,
    mediaRequestCount: net && net.mediaCount,
    requests: ((net && net.requests) || []).map((r) => `${r.status} ${r.type} [${r.ct.split(';')[0]}] ${r.url.slice(0, 200)}`)
  };
  out.value = JSON.stringify(report, null, 2);
});

document.getElementById('copyDiagBtn').addEventListener('click', async () => {
  const out = document.getElementById('diagOutput');
  out.select();
  try {
    await navigator.clipboard.writeText(out.value);
  } catch (_) {
    document.execCommand('copy');
  }
});

// Init
(async function init() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (res && res.ok && res.settings) {
    applySettingsToUI(res.settings);
  }
  await refreshPageStatus();
})();
