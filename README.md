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

### 🚀 小白一键安装（推荐 · 无需敲命令 · 30秒搞定）

1. **第一步：下载插件压缩包**  
   👉 [**点击直接下载插件包 (ZIP)**](https://github.com/doge2mars/srt-ai-translator/archive/refs/heads/main.zip)（或点击页面右上角绿色 `Code` 按钮 -> `Download ZIP`）。
2. **第二步：解压文件**  
   下载完成后，双击解压该 `.zip` 压缩包，会得到一个名为 `srt-ai-translator-main` 的文件夹。
3. **第三步：一键拖入浏览器**  
   - 打开 **Chrome**、**Edge** 或 **360** 等浏览器；
   - 地址栏直接输入并回车：`chrome://extensions/`（Edge 浏览器输入 `edge://extensions/`）；
   - 打开右上角的 **「开发者模式」** 开关；
   - 将刚才解压出的 `srt-ai-translator-main` 文件夹，**直接鼠标拖拽进浏览器窗口中**（或者点击左上角「加载已解压的扩展程序」选中该文件夹）。
4. **安装完成！**  
   去飞牛OS、YouTube 打开任意视频，页面上就会出现翻译控制条，自动开始翻译！

---

### 💻 开发者安装（Git 方式）

```bash
git clone https://github.com/doge2mars/srt-ai-translator.git
```
在浏览器扩展管理页点击「加载已解压的扩展程序」，选择该目录即可。

---

### 2. 在 Safari 中安装与编译（macOS）

> **说明**：Safari 不支持直接加载解压文件夹，必须封装为 `.app` 扩展应用。

#### 方式 A：直接下载预编译好的 Safari App（推荐 · 本地免装 Xcode）

1. 前往 [**GitHub Releases 页面**](https://github.com/doge2mars/srt-ai-translator/releases) 下载 `SRT-AI-Translator-Safari-macOS.zip`（也可在 [GitHub Actions](https://github.com/doge2mars/srt-ai-translator/actions) 最新绿色构建记录的 **Artifacts** 中下载）。
2. 解压后将 `SRT AI Translator.app` 拖入 **应用程序（`/Applications`）** 文件夹。
3. 打开「终端」，执行以下命令清除下载隔离标记：
   ```bash
   xattr -cr "/Applications/SRT AI Translator.app"
   ```
4. 打开 **Safari → 设置 → 高级**，勾选底部的 **「显示网页开发者功能」**。
5. 切换到同一设置窗口最右侧新出现的 **「开发者」** 标签页，勾选 **「允许未签名的扩展」**（输入 Mac 密码确认）。
6. 切换到 **「扩展」** 标签页，勾选启用 **SRT AI Translator**，并在右侧网站权限中设为「始终允许」即可。

> **若「扩展」列表中未出现**：可在终端执行一次手动注册，再按 `Cmd + Q` 完全退出并重开 Safari：
> ```bash
> /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R -trusted "/Applications/SRT AI Translator.app"
> pluginkit -a "/Applications/SRT AI Translator.app/Contents/PlugIns/SRT AI Translator Extension.appex"
> ```

#### 方式 B：本地从源码编译 Safari App（需要完整版 Xcode）

1. 从 Mac App Store 安装完整版 **Xcode**（仅安装 Command Line Tools 不包含 Safari 转换工具）。
2. 将插件源码精简复制到临时目录并转换工程：
   ```bash
   mkdir -p /tmp/ext-src && cp manifest.json /tmp/ext-src/ && cp -R icons src /tmp/ext-src/
   xcrun safari-web-extension-converter /tmp/ext-src \
     --project-location ~/Desktop/SRT-AI-Safari \
     --app-name "SRT AI Translator" \
     --bundle-identifier "com.local.srt-ai-translator" \
     --macos-only --swift --no-prompt
   ```
3. Xcode 会自动打开生成的工程，在 **Signing & Capabilities** 中选择你的个人 Apple ID（免费账号即可），点击左上角 **Run (▶)** 编译运行一次。
4. 若不想登录 Apple ID，也可以命令行无证书编译并保留沙盒权限进行本地签名（完整脚本可参考仓库内的 [`.github/workflows/build-safari.yml`](.github/workflows/build-safari.yml)）。

#### 方式 C：GitHub Actions 云端自动编译

- 本仓库已配置 [`.github/workflows/build-safari.yml`](.github/workflows/build-safari.yml)。Fork 本仓库后，进入 **Actions → Build Safari Extension (macOS) → Run workflow**，即可在 GitHub 提供的 macOS 环境里自动完成转换、沙盒签名并打包出 `.zip`。

---

## 🎬 使用与唤出指南（找不到界面看这里）

为了实现无打扰沉浸观影，插件的控制条**默认是隐藏的**，首次安装后可以通过以下方式唤出与调用：

### 1. 打开设置面板（选模型 / 填 API Key / 诊断）
- 点击浏览器右上角工具栏的 **SRT AI Translator** 图标即可打开设置面板（建议点击浏览器拼图图标将其固定到工具栏）。
- **防关闭小技巧**：填写 API Key 需要切换标签页去复制参数时，可点击设置面板右上角的 **`↗` 弹出独立窗口**（或右键扩展图标进入“选项”），窗口不会因失焦而自动关闭。

### 2. 唤出视频右上角悬浮控制条
播放视频时，右上角悬浮控制条默认隐藏（不挡画面），可通过以下任意方式唤出：
- **鼠标移至视频画面右上角**：在右上角感应区域悬停即可自动显现，鼠标移开或继续播放后自动收起；
- **暂停视频**：暂停播放时会自动弹出提示当前字幕捕获与翻译进度；
- **按快捷键 `Option + T`（Mac）/ `Alt + T`（Win）**：切换显示模式并唤出控制条；
- 点击控制条最右侧 **`✕`** 可随时手动收起。

### 3. 触发字幕翻译
- **自动捕获**：在飞牛OS、YouTube、Bilibili、Disney+ 打开视频（流媒体平台请确保播放器已开启字幕轨），插件会自动拦截字幕并开始预翻译。
  > 首次安装或更新扩展后，请刷新一次视频网页（`Cmd + R` / `F5`）。
- **手动拖拽导入**：任意网页视频均可直接把本地 `.srt` / `.vtt` 字幕文件**拖到视频画面上松开**，或通过控制条/设置面板手动导入。

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

### 选项 D：多模型自定义管理（通义千问 / OneAPI中转 / 硅基流动等）
* 点击「服务预设」右侧的 **「＋ 新建模型」**；
* 输入自定义名称（如 `通义千问Plus`、`极速中转API`、`SiliconFlow`）；
* 填写对应的 API Base URL（如千问的 `https://dashscope.aliyuncs.com/compatible-mode/v1`）、模型名称与 API Key；
* 系统会自动独立保存每个模型的配置，随时在下拉菜单中一键切换或删除！

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
