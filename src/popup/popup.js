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
  cacheMsg: document.getElementById('cacheMsg'),
  addModelBtn: document.getElementById('addModelBtn'),
  delModelBtn: document.getElementById('delModelBtn'),
  customModelGroup: document.getElementById('customModelGroup'),
  newModelBox: document.getElementById('newModelBox'),
  newModelName: document.getElementById('newModelName'),
  newModelBaseUrl: document.getElementById('newModelBaseUrl'),
  newModelCode: document.getElementById('newModelCode'),
  newModelApiKey: document.getElementById('newModelApiKey'),
  testNewModelBtn: document.getElementById('testNewModelBtn'),
  saveAndUseModelBtn: document.getElementById('saveAndUseModelBtn'),
  saveOnlyModelBtn: document.getElementById('saveOnlyModelBtn'),
  cancelAddModelBtn: document.getElementById('cancelAddModelBtn'),
  newModelTestResult: document.getElementById('newModelTestResult'),
  openStandaloneBtn: document.getElementById('openStandaloneBtn')
};

let providerProfiles = {};
let customModels = [];

function renderCustomModelOptions() {
  if (!els.customModelGroup) return;
  els.customModelGroup.innerHTML = '';
  if (customModels.length === 0) {
    els.customModelGroup.classList.add('hidden');
    return;
  }
  els.customModelGroup.classList.remove('hidden');
  customModels.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (自定义)`;
    els.customModelGroup.appendChild(opt);
  });
}

function updateDeleteBtnVisibility() {
  if (!els.delModelBtn) return;
  const val = els.provider.value;
  const isCustom = customModels.some((m) => m.id === val);
  els.delModelBtn.classList.toggle('hidden', !isCustom);
}

function saveCurrentProviderProfile() {
  const p = els.provider.value;
  if (!p || p === 'google_free') return;
  const profile = {
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim()
  };
  providerProfiles[p] = profile;

  // Also sync to customModels array if it is a user-created model
  const customIdx = customModels.findIndex((m) => m.id === p);
  if (customIdx !== -1) {
    customModels[customIdx] = {
      ...customModels[customIdx],
      ...profile
    };
  }
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
    providerProfiles,
    customModels
  };
}

function applySettingsToUI(s) {
  providerProfiles = { ...(s.providerProfiles || {}) };
  customModels = Array.isArray(s.customModels) ? [...s.customModels] : [];
  renderCustomModelOptions();

  els.enabled.checked = !!s.enabled;
  els.provider.value = s.provider || 'ollama';
  // Fallback if saved provider no longer exists
  if (!els.provider.value && els.provider.options.length > 0) {
    els.provider.selectedIndex = 0;
  }
  updateDeleteBtnVisibility();

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
  const custom = customModels.find((m) => m.id === nextProv);

  if (saved) {
    els.baseUrl.value = saved.baseUrl || (custom && custom.baseUrl) || (preset && preset.baseUrl) || '';
    els.model.value = saved.model || (custom && custom.model) || (preset && preset.model) || '';
    els.apiKey.value = saved.apiKey !== undefined ? saved.apiKey : (custom && custom.apiKey) || (preset && preset.apiKey) || '';
  } else if (custom) {
    els.baseUrl.value = custom.baseUrl || '';
    els.model.value = custom.model || '';
    els.apiKey.value = custom.apiKey || '';
  } else if (preset) {
    els.baseUrl.value = preset.baseUrl;
    els.model.value = preset.model;
    if (preset.apiKey !== undefined) els.apiKey.value = preset.apiKey;
  }
  updateDeleteBtnVisibility();
  saveAndSyncSettings(false);
});

// Custom Model CRUD handlers
els.addModelBtn?.addEventListener('click', () => {
  const isHidden = els.newModelBox.classList.contains('hidden');
  if (isHidden) {
    els.newModelBox.classList.remove('hidden');
    els.newModelName.value = '';
    els.newModelBaseUrl.value = 'https://';
    els.newModelCode.value = '';
    els.newModelApiKey.value = '';
    els.newModelTestResult.className = 'msg';
    els.newModelTestResult.textContent = '';
    els.newModelName.focus();
  } else {
    els.newModelBox.classList.add('hidden');
  }
});

els.cancelAddModelBtn?.addEventListener('click', () => {
  els.newModelBox.classList.add('hidden');
});

function showNewTestResult(text, isOk) {
  if (!els.newModelTestResult) return;
  if (isOk === null) {
    els.newModelTestResult.className = 'msg';
  } else {
    els.newModelTestResult.className = isOk ? 'msg ok' : 'msg err';
  }
  els.newModelTestResult.textContent = text;
}

els.testNewModelBtn?.addEventListener('click', async () => {
  const baseUrl = els.newModelBaseUrl.value.trim();
  const model = els.newModelCode.value.trim();
  const apiKey = els.newModelApiKey.value.trim();
  const targetLang = els.targetLang.value || '简体中文';

  if (!baseUrl) {
    showNewTestResult('请先填写 API Base URL', false);
    els.newModelBaseUrl.focus();
    return;
  }
  if (!model) {
    showNewTestResult('请先填写模型名称', false);
    els.newModelCode.focus();
    return;
  }

  showNewTestResult('正在测试连接此新配置...', null);
  const res = await chrome.runtime.sendMessage({
    type: 'TEST_CONNECTION',
    settings: {
      provider: 'custom',
      baseUrl,
      model,
      apiKey,
      targetLang
    }
  });

  if (res && res.ok) {
    showNewTestResult(`连接成功 (${res.latencyMs}ms): ${res.reply}`, true);
  } else {
    showNewTestResult(`连接失败: ${(res && res.error) || '未知错误'}`, false);
  }
});

function collectNewModelData() {
  const name = els.newModelName.value.trim();
  const baseUrl = els.newModelBaseUrl.value.trim();
  const model = els.newModelCode.value.trim();
  const apiKey = els.newModelApiKey.value.trim();

  if (!name) {
    alert('请输入模型备注别名（例如：通义千问Plus、中转API）');
    els.newModelName.focus();
    return null;
  }
  const id = `custom_${Date.now()}`;
  return { id, name, baseUrl, model, apiKey };
}

// 选项 A：保存并立即使用（切换当前视频调用的模型）
els.saveAndUseModelBtn?.addEventListener('click', () => {
  const newMod = collectNewModelData();
  if (!newMod) return;

  customModels.push(newMod);
  providerProfiles[newMod.id] = {
    baseUrl: newMod.baseUrl,
    model: newMod.model,
    apiKey: newMod.apiKey
  };
  renderCustomModelOptions();

  // 此时用户明确要求切换：切换并同步给播放器
  els.provider.value = newMod.id;
  els.baseUrl.value = newMod.baseUrl;
  els.model.value = newMod.model;
  els.apiKey.value = newMod.apiKey;
  updateDeleteBtnVisibility();
  els.newModelBox.classList.add('hidden');

  saveAndSyncSettings(true);
});

// 选项 B：仅保存备用（绝对不修改当前正在跑的翻译引擎！）
els.saveOnlyModelBtn?.addEventListener('click', () => {
  const newMod = collectNewModelData();
  if (!newMod) return;

  customModels.push(newMod);
  providerProfiles[newMod.id] = {
    baseUrl: newMod.baseUrl,
    model: newMod.model,
    apiKey: newMod.apiKey
  };
  renderCustomModelOptions();

  // 注意：保持 els.provider.value 原封不动！视频播放器继续使用当前旧模型翻译！
  els.newModelBox.classList.add('hidden');
  saveAndSyncSettings(false);

  els.testResult.className = 'msg ok';
  els.testResult.textContent = `已添加模型「${newMod.name}」到列表备用，当前调用模型不受影响`;
});

els.delModelBtn?.addEventListener('click', () => {
  const currentId = els.provider.value;
  const mod = customModels.find((m) => m.id === currentId);
  if (!mod) return;
  if (!confirm(`确定要删除自定义模型配置「${mod.name}」吗？`)) return;

  customModels = customModels.filter((m) => m.id !== currentId);
  delete providerProfiles[currentId];
  renderCustomModelOptions();

  // Switch back to zhipu or google_free
  els.provider.value = 'zhipu';
  els.provider.dispatchEvent(new Event('change'));
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
    requests: ((net && net.requests) || []).map((r) => {
      let clean = (r.url || '').split('#')[0].split('?')[0];
      clean = clean.replace(/\/dvt2=[^/]+\//gi, '/dvt2=[REDACTED]/');
      const hasQuery = (r.url || '').includes('?') ? '?[REDACTED]' : '';
      const u = `${clean}${hasQuery}`;
      const displayUrl = u.length > 150 ? `${u.slice(0, 70)}...${u.slice(-60)}` : u;
      return `${r.status} ${r.type} [${r.ct.split(';')[0]}] ${displayUrl}`;
    })
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

// Standalone window support
const isStandalone = window.location.search.includes('standalone') || window.innerWidth > 450;
if (isStandalone && els.openStandaloneBtn) {
  els.openStandaloneBtn.style.display = 'none';
}

els.openStandaloneBtn?.addEventListener('click', () => {
  const url = chrome.runtime.getURL('src/popup/popup.html?standalone=1');
  if (chrome.windows && chrome.windows.create) {
    chrome.windows.create({
      url,
      type: 'popup',
      width: 440,
      height: 680,
      focused: true
    });
    window.close();
  } else {
    window.open(url, '_blank');
  }
});

// Immediate save on blur / close so half-typed keys or URLs are never lost
function flushImmediateSave() {
  saveCurrentProviderProfile();
  const settings = collectSettingsFromUI();
  chrome.storage.local.set({ srtAiSettings: settings }).catch(() => {});
}

window.addEventListener('beforeunload', flushImmediateSave);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushImmediateSave();
});

// Init
(async function init() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (res && res.ok && res.settings) {
    applySettingsToUI(res.settings);
  }
  await refreshPageStatus();
})();
