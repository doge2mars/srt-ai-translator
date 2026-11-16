# SRT AI Translator - 实时视频字幕翻译插件

专为**飞牛OS (fnOS)** 等网页视频播放器打造的浏览器插件（支持 **Chrome** 与 **Safari**），支持调用**本地 AI 模型（Ollama / LM Studio）**与**在线模型（DeepSeek / OpenAI 等）**，实现双语字幕预翻译与全屏渲染。

## 核心特性
- **三种字幕获取方式**：
  1. 自动拦截播放器加载的 `.srt` / `.vtt` 网络请求；
  2. 自动读取 `<video>` 的 `<track>` 字幕轨；
  3. **万能兜底**：直接把本地 `.srt` / `.vtt` 文件拖进视频播放画面，或点击悬浮工具栏 / 插件弹窗的「导入 SRT」。
- **上下文批量预翻译**：根据当前播放进度，在后台提前批量翻译后续字幕（附带前文语境），并自动缓存到浏览器本地。
- **全屏双语字幕**：支持网页全屏显示，可切换「双语 / 仅译文 / 仅原文」，支持 `±0.5s` 时间轴微调、字号和边距调节。

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
