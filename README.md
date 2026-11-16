# SRT AI Translator - 实时视频字幕翻译浏览器插件

专为 **飞牛OS (fnOS)**、**YouTube**、**Disney+**、**Bilibili** 等网页视频播放器打造的通用双语字幕翻译扩展。支持 **Chrome / Edge / Safari / Firefox**，可自由调用 **本地大模型（LM Studio / Ollama）**、**在线 AI（智谱 GLM、DeepSeek 等）** 或 **免费 Google 极速翻译**。

---

## ✨ 核心特性

- **多平台字幕全自动拦截抓取**：
  - **飞牛OS (fnOS)**：自动截获媒体库中同目录的外挂/内嵌字幕并启动预翻译；
  - **YouTube (油管)**：自动捕获原生 `timedtext` (json3 / xml) 字幕并自动关联分段；
  - **Bilibili (B站)**：自动捕获 AI 字幕与 CC 字幕；
  - **万能本地导入**：任意播放网页均可直接拖入或点击导入 `.srt` / `.vtt` / `.ass` 文件。
- **多翻译引擎，自由切换**：
  - **Google 免费翻译**：免 Key、零成本、单次批量极速预翻译（延迟 < 200ms）；
  - **本地大模型**：LM Studio / Ollama（深度适配 Qwen2.5 / Qwen3，自动关闭思考模式提升出字速度）；
  - **在线大模型**：智谱 GLM（推荐 `glm-4.5-air` / `glm-4.7-flash`）、DeepSeek、OpenAI 及兼容 `/v1/chat/completions` 的任意模型服务。
- **专业领域与错字纠正（AI 模式）**：
  - 内置「田径/体能教练」、「运动康复/医学」、「科技编程」、「商业财经」等专业术语预设；
  - 自动结合上下文纠正原字幕的同音识别错误（如日文 `マーカー層 → マーカー走`）。
- **观影人性化体验**：
  - **自动防重叠**：接管字幕时自动隐藏 YouTube 及飞牛原生字幕层，避免重叠眼花；
  - **高对比清晰配色**：中文字幕高亮醒目暖黄色（`#fde047`），原文柔和白，一眼分清；
  - **鼠标拖拽自由定位**：直接按住画面字幕即可任意上下拖动，防止遮挡比分牌或画面主体；
  - **快捷键控制**：按 `Option + T`（Windows: `Alt + T`）快速循环切换「双语 / 仅译文 / 仅原文 / 关闭」；
  - **一键导出 / 自动保存 SRT**：全片翻译完成后可一键下载（或自动保存）带原视频文件名的双语/中文 `.srt` 文件，方便回传 NAS。

---

## 📦 安装教程

### 1. 在 Chrome / Edge / 360 等 Chromium 浏览器中安装

1. 克隆或下载本项目到本地：
   ```bash
   git clone https://github.com/doge2mars/srt-ai-translator.git
   ```
2. 打开浏览器扩展管理页面：
   - **Chrome**: 地址栏访问 `chrome://extensions/`
   - **Edge**: 地址栏访问 `edge://extensions/`
3. 开启页面右上角的 **开发者模式**（Developer mode）；
4. 点击左上角的 **加载已解压的扩展程序**（Load unpacked）；
5. 选择解压出的 `srt-ai-translator` 项目文件夹即可完成安装。

---

### 2. 在 Safari 中安装使用（macOS）

1. 确保电脑已安装 Xcode（或安装 Xcode Command Line Tools）：
   ```bash
   xcode-select --install
   ```
2. 在终端进入本项目目录，运行苹果官方转换工具打包为 Safari App 扩展：
   ```bash
   cd srt-ai-translator
   xcrun safari-web-extension-converter . --project-location ~/Desktop/SRT-AI-Safari --app-name "SRT AI Translator"
   ```
3. Xcode 会自动打开生成的工程，在顶部菜单选择签名 Team（个人免费账号即可），点击左上角 **Run (▶)** 运行一次；
4. 打开 **Safari 浏览器 -> 设置 -> 扩展**，勾选启用 **SRT AI Translator**；
5. 在「网站权限」中允许本插件访问您的 NAS 播放地址或所有网站即可。

---

## ⚙️ 模型配置指南

点击浏览器右上角插件图标进入配置面板：

### 选项 A：Google 免费翻译（推荐首选体验）
* **服务预设**：选择 `Google 免费翻译 (极速免Key)`
* **说明**：无需任何 API Key，延迟极低（约 0.1~0.2 秒），适合看剧时快速秒出字幕。

### 选项 B：在线大模型（智谱 GLM / DeepSeek）
* **服务预设**：选择 `智谱 GLM (在线)` 或 `DeepSeek (在线)`
* **API Base URL**：
  - 智谱 GLM：`https://open.bigmodel.cn/api/paas/v4`
  - DeepSeek：`https://api.deepseek.com/v1`
* **模型名称**：
  - 智谱：`glm-4.5-air` 或 `glm-4.7-flash`
  - DeepSeek：`deepseek-chat`
* **API Key**：填写您申请的服务商 API Key。

### 选项 C：本地大模型（LM Studio / Ollama）
* **LM Studio**：
  1. 打开 LM Studio，下载模型（推荐 `Qwen2.5-7B-Instruct` 或 `Qwen3-8B` 系列）；
  2. 启动本地本地服务器（Local Server，默认端口 `1234`）；
  3. 插件服务预设选择 `LM Studio (本地默认)`，点击 **测试连接**。
* **Ollama**：
  1. 拉取模型：`ollama pull qwen2.5:7b`
  2. 启动并配置允许浏览器跨域访问：
     ```bash
     OLLAMA_ORIGINS="*" ollama serve
     ```
  3. 插件服务预设选择 `Ollama (本地默认)`，点击 **测试连接**。

---

## 🎯 快捷键操作

| 快捷键 | 功能说明 |
| :--- | :--- |
| **`Option + T`** (Mac) / **`Alt + T`** (Win) | 快速切换显示模式：双语 → 仅译文 → 仅原文 → 关闭 |
| **鼠标左键拖拽字幕** | 自由上下拖动字幕至画面任意舒适位置 |
| **控制栏 `+0.5s` / `-0.5s`** | 实时微调字幕时间轴延迟或提前 |

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源，欢迎提交 Issue 和 PR 共同完善！
