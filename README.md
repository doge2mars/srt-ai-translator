# SRT AI Translator - 实时视频字幕翻译插件

专为**飞牛OS (fnOS)** 等网页视频播放器打造的浏览器插件（支持 **Chrome** 与 **Safari**），支持调用**本地 AI 模型（Ollama / LM Studio）**与**在线模型（DeepSeek / OpenAI 等）**，实现双语字幕预翻译与全屏渲染。

## 核心特性
- **支持多平台字幕自动抓取**：
  1. 飞牛OS (fnOS) 本地同目录字幕自动捕获；
  2. YouTube (油管) timedtext 原生字幕自动拦截；
  3. Bilibili (B站) AI 字幕与 CC 字幕自动捕获；
  4. 万能拖拽 / 本地选择 `.srt` / `.vtt` / `.ass` 文件兜底。
- **多翻译引擎自由切换**：
  1. **Google 免费翻译**（免 Key · 极速 0.1s 批量翻译 · 0 成本）；
  2. **本地模型**（LM Studio / Ollama，支持 Qwen2.5 / Qwen3 并自动跳过思考）；
  3. **在线大模型**（智谱 GLM、DeepSeek、OpenAI 及自定义兼容接口）。
- **专业领域与错字纠正 Prompt**：
  - 内置「田径/体能教练」、「运动康复/医学」、「科技编程」、「商业财经」等专业领域；
  - 自动结合上下文纠正原字幕的同音识别错误（如 `マーカー層 → マーカー走`）。
- **观影人性化体验**：
  - **自动防重叠**：接管字幕时自动隐藏油管及飞牛原生字幕层；
  - **清晰配色**：中文字幕高亮醒目暖黄色，原文柔和白，一眼分清；
  - **鼠标拖拽定位**：直接按住画面字幕即可上下拖动，防止遮挡比分牌或画面；
  - **快捷键控制**：按 `Option + T` (或 `Alt + T`) 快速切换「双语 / 仅译文 / 仅原文 / 关闭」；
  - **一键导出 / 自动保存 SRT**：全片翻译完成后可自动或一键下载带原片名的双语/中文 `.srt` 文件回传 NAS。

---

## 一、在 Chrome 中安装使用

1. 打开 Chrome 地址栏输入：`chrome://extensions/`
2. 打开右上角的 **开发者模式**（Developer mode）
3. 点击左上角 **加载已解压的扩展程序**（Load unpacked）
4. 选择本项目的文件夹：`srt-ai-translator`

---

## 二、在 Safari 中安装使用（macOS）

1. 确保电脑已安装 Xcode（或 Xcode Command Line Tools）。
2. 在终端运行苹果官方转换工具，将本插件打包为 Safari 扩展项目：
   ```bash
   xcrun safari-web-extension-converter /Users/feiwang/.gemini/antigravity/scratch/srt-ai-translator --project-location ~/Desktop/SRT-AI-Safari --app-name "SRT AI Translator"
   ```
3. Xcode 会自动打开生成的工程，点击左上角 **Run (▶)** 编译运行一次。
4. 打开 **Safari -> 设置 -> 扩展**，勾选启用 **SRT AI Translator**。
5. 如果你在 Safari 中使用本地 Ollama，注意在 Safari 扩展权限中允许访问所有网站（或你的飞牛OS地址与 `localhost`）。

---

## 三、配置本地模型（以 Ollama 为例）

1. 确保本地已运行 Ollama 并拉取了模型（例如）：
   ```bash
   ollama pull qwen2.5:7b
   ```
2. **重要（如遇 403 跨域报错）**：Chrome/Safari 插件后台访问本地 Ollama 时，建议启动 Ollama 时允许跨域来源：
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```
3. 点击浏览器右上角的插件图标，服务预设选择 **Ollama (本地默认)**，点击 **测试连接**，看到绿色提示即可使用！
