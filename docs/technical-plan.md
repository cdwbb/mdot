# mdot 桌面端技术方案

> 版本 v1.1 · 2026-10-23 · 状态：1.0.0 已实现，作为设计与取舍记录保留
> 目标平台：**Windows 10/11 + macOS 12+**（仅桌面端，不做 Linux / 移动端）
> 产品参考：Typora（无缝实时预览的 Markdown 编辑器）
> 品牌资产：应用图标见 `src-tauri/icons/`，主界面 icon 为 `public/mdot.svg`
> 核心体验要求：**秒开**（空窗可见 <400ms / 可输入 <1s）、**响应快**（输入延迟 <16ms）、**双栏**（无缝 + 源码/预览双模式）

---

## 1. 产品定位

mdot 是一个**本地优先、双模式、无缝实时预览（WYSIWYG）的 Markdown 编辑器**：没有编辑/预览分屏，输入即渲染；文件纯本地读写，不依赖云服务。名字即扩展名——"md." 读作 em-dee-dot，就是 mdot。

两种编辑形态，用户自由切换并记忆偏好：

- **无缝模式**（默认）：Typora 式所见即所得，元语法符号隐藏，光标处展开
- **双栏模式**：左源码（CodeMirror 6）右预览，可同步滚动，适合长文校对与纯文本思维

差异化机会：Typora 收费 $14.99、闭源且无双栏；开源的 MarkText 维护不稳。mdot 以 Tauri 的 5MB 级体积 + 秒开体验 + 自有品牌系统切入，做"轻、快、好看"的写作工具。

## 2. 技术选型

### 2.1 总览

| 层 | 选型 | 理由 |
|---|---|---|
| 应用壳 | **Tauri 2.x**（Rust 后端 + 系统 WebView） | 安装包 ~8MB（Electron 方案 ~110MB）、空闲内存 20–100MB、冷启动 <0.5s；仅做 Win+mac，两端 WebView 均为成熟引擎 |
| 前端框架 | **React + TypeScript + Vite** | 编辑器生态最大，团队单一语言 |
| 编辑器内核 | **Milkdown**（无缝模式）+ **CodeMirror 6**（双栏源码栏） | Markdown 原生双向绑定，所见即所得开箱即用；双栏用成熟源码编辑器，见 §4 |
| Markdown 解析 | markdown-it（双栏预览管道） | 无状态纯函数管道，长文重渲染快一个量级 |
| 数学公式 | KaTeX | 比 MathJax 快，MarkText 同款 |
| 图表 | Mermaid | Typora 同款，v11 |
| 代码高亮 | CodeMirror 6（Crepe 内置） / Shiki | 代码块内嵌编辑器实例 |
| 状态管理 | zustand | 轻量，编辑器外状态（文件树、设置、主题）够用 |
| 文件监视 | Rust `notify` crate | 跨平台文件系统事件 |
| 自动更新 | `tauri-plugin-updater` | 签名更新，5MB 全量更新无感 |

### 2.2 为什么不是 Electron

Typora、MarkText、Obsidian、VS Code 都用 Electron，生态最成熟。但对 mdot 是错的权衡：编辑器属于**常驻型工具**，Electron 的 200–400MB 常驻内存和 1–2s 冷启动直接伤害写作体验；且 Typora 类编辑器 90% 的复杂度在前端编辑器内核，Rust 边界层只剩文件/对话框/更新，官方插件能覆盖大半。若后续发现 Rust 层成为瓶颈，前端代码可平移到 Electron（UI 代码不变），迁移成本可控。

## 3. 总体架构

```
┌─────────────────────────────────────────────────┐
│  WebView 层（Win: WebView2 / mac: WKWebView）      │
│                                                   │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ 编辑器内核 │  │ UI 外壳   │  │ 主题/品牌系统 │  │
│  │ Milkdown  │  │ 标题栏/   │  │ CSS 变量 +   │  │
│  │ (无缝模式)│  │ 侧栏/大纲 │  │ mdot 色板    │  │
│  │ + CM6     │  │ + 命令面板│  │              │  │
│  │ (双栏模式)│  └───────────┘  └──────────────┘  │
│  └───────────┘                                    │
│  ┌───────────────────────────────────────────┐   │
│  │ 前端服务层：zustand store + Tauri IPC 客户端 │   │
│  └───────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  Tauri IPC（invoke / emit，capabilities 白名单）   │
├─────────────────────────────────────────────────┤
│  Rust 后端                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐  │
│  │ 文件模块│ │ 监视模块│ │ 导出模块│ │ 更新模块 │  │
│  │ fs/对话框│ │ notify │ │ PDF/   │ │ updater  │  │
│  │ 工作区 │ │ 事件推送│ │ HTML/  │ │ 签名校验 │  │
│  │ 最近文件│ │        │ │ docx   │ │          │  │
│  └────────┘ └────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────┘
```

职责划分原则：**文档内容的真相在前端（Milkdown 文档模型），文件的真相在 Rust**。任何"写盘"动作都必须经过 Rust 原子写（临时文件 + rename），前端不直接碰文件系统。

## 4. 编辑器内核设计（核心难点）

mdot 的核心架构约束是**双模式**：无缝模式（Typora 式所见即所得）+ 双栏模式（源码 | 预览）。两种形态不共享文档模型，**Markdown 文本是唯一真相**，两个编辑器都是它的视图。

### 4.0 双模式架构：Markdown 为唯一真相

| 模式 | 编辑视图 | 预览视图 |
|---|---|---|
| 无缝（默认） | Milkdown（Crepe）WYSIWYG | 即编辑区本身 |
| 双栏 | CodeMirror 6 源码编辑器 | markdown-it 渲染管道（只读） |

- 无缝 → 双栏：`getMarkdown()` 序列化 → 灌入 CM6 与预览管道
- 双栏 → 无缝：CM6 取值 → `insert()` 灌入 Milkdown
- 切换目标延迟 < 100ms（1 万字内文档），切换时保留滚动位置近似映射
- 双栏内实时同步：CM6 变更 → 防抖 150ms → 预览管道重渲染，滚动位置按锚点保持

### 4.1 为什么双栏预览用 markdown-it 而不是 Milkdown 只读实例

Milkdown 只读实例能 100% 复用主题，但每 150ms 重建 ProseMirror 文档，长文必卡。markdown-it 是无状态纯函数管道，快一个量级；视觉通过共享 CSS 变量与同一套排版 token 对齐。KaTeX / Mermaid / 代码高亮在预览管道内按需懒加载。若后期视觉一致性不达标，再评估只读实例方案（Crepe 与 Kit 同源，替换只碰编辑器层）。

### 4.2 选型策略：Crepe 起步，Kit 兜底

- **第一阶段无缝模式用 `@milkdown/crepe`**：开箱即用的 Typora 式编辑器，内置浮动工具栏、斜杠菜单（`/` 唤起）、表格拖拽编辑、CodeMirror 6 代码块、KaTeX 公式。目标是用最小成本先跑通"打开→编辑→保存"主链路。
- **Crepe 的定制上限（主题 CSS、功能开关）不够时，下沉到 `@milkdown/kit`**：60+ 命名导出自组合插件，UI 完全自建。Crepe 与 Kit 同源，下沉只重写编辑器配置层，不碰文件层和 UI 外壳。
- **不自研内核**。MarkText 的 Muya 是唯一开源的 Typora 式内核，但代码庞大且社区维护慢；ProseMirror 生态（Milkdown 底座）远比自建可靠。

### 4.3 双向绑定与保存

- 编辑器内容 → Markdown：`editor.action(getMarkdown())`（`@milkdown/utils`）。
- Markdown → 编辑器：`editor.action(insert(markdown))` 或初始化时灌入。
- **自动保存**：Milkdown `listener` 插件的 `markdownUpdated` 回调 → 防抖 800ms → invoke Rust 原子写。保存态在 UI 上明示（标题栏小圆点），不打断写作。
- **往返保真测试**：建一组黄金样本（含表格、公式、任务列表、代码围栏、Front Matter），两种模式下各保存一次再打开做 diff，纳入 CI。

### 4.4 光标行为（Typora 体验的关键细节）

- 元语法符号（`**`、`#`、`![]()`）平时隐藏，光标进入所在元素时展开显示原文——Milkdown 对 inline mark 的展开由内核处理，样式层需保证与 mdot 品牌字体一致。
- 代码围栏内是独立 CodeMirror 6 实例，获得完整编辑能力（高亮、缩进、自动配对）。
- 中文 IME 输入法 composition 期间的渲染抖动需实测，必要时对 composition 事件做渲染节流。
- 双栏模式同步滚动：以标题/代码块锚点建立源码行号 ↔ 预览元素映射，双向；用户手动滚动时短暂断开同步（避免打架）。

### 4.5 备选降级路径

若 Crepe 的定制化阻碍品牌落地，按序降级：Kit 自组合 → CodeMirror 6 + markdown-it 自建渲染层（Obsidian 路线，工作量最大但最自由）。文件层、UI 外壳、构建分发三层不受影响。

## 5. 文件与数据层

| 关注点 | 方案 |
|---|---|
| 打开/保存 | `tauri-plugin-dialog` 选文件；`tauri-plugin-fs` 或 Rust command 读写 |
| 工作区 | 单文件夹工作区模式：文件树侧栏 + 最近文件（`tauri-plugin-store` 持久化） |
| 自动保存 | 防抖 800ms + 原子写（写 `.md.tmp` → `rename`），**默认开启**（设置可关），崩溃不留半截文件 |
| 外部修改 | Rust `notify` 监听工作区，文件被外部改动 → 事件推前端 → 顶部提示"已重新加载/冲突另存" |
| Front Matter | YAML 块作为编辑器特殊节点，保存时原样保留在文首 |
| 图片 | 粘贴/拖拽图片 → 存入文档同目录 `assets/`（可配置）→ 插入相对路径引用 |
| 设置 | `tauri-plugin-store` JSON：主题、字体、字号、自动保存开关、工作区路径 |

## 6. 功能范围与里程碑

> **1.0.0 已落地**：多标签页、会话恢复（标签/窗格/视图/滚动位置）、双文档布局、暖纸等六套主题与自托管字体、会话开关、双栏左右交换、行列号、源码格式工具栏、可调自动保存间隔、打字机模式、默认收起侧栏、最近文件的文件名/时间分行显示、退出时未保存内容的受控提示、"显示最近文件"开关，Windows 安装包采用 NSIS exe。以下里程碑保留为设计记录。

### M1 · MVP（验证主链路，约 3 周）

- 打开/编辑/保存本地 `.md`（对话框 + 拖入文件）
- **无缝模式**：Crepe 所见即所得编辑——标题/列表/引用/粗斜体/链接/分割线/代码块（含高亮）/表格
- **双栏模式（基础版）**：CM6 源码 + markdown-it 预览管道，防抖同步，一键切换并记忆偏好
- **秒开三件套落地**：窗口先行 + 按需加载 + 启动零阻塞，达成 §8 启动预算
- 浅色 + 深色两套主题，接入 mdot 品牌色板
- 导出 HTML；PDF 用系统打印对话框
- 窗口标题显示文件名 + 未保存指示

### M2 · 完整编辑器（约 3–4 周）

- KaTeX 公式、Mermaid 图表（无缝 + 预览双管道）
- 双栏增强：同步滚动、>2000 行文档虚拟化/分块渲染
- 大纲面板（标题树，点击跳转）
- 工作区文件树 + 最近文件 + 外部修改监听（notify）
- 图片粘贴/拖拽 + assets 管理
- Focus / Typewriter 模式、命令面板（Ctrl/Cmd+K）
- 自动保存 + 往返保真测试入 CI（两种模式各自验证）

### M3 · 打磨与分发（约 2 周）

- 设置面板（主题、字体、字号、保存策略）
- 自定义主题（CSS 文件，参考 Typora 主题机制）
- 双端代码签名 + 自动更新通道
- 官网/落地页（用现成品牌资产 + OG 图）

### M4 · 后续候选

- docx 导出（Pandoc sidecar 或 docx crate）
- 命令面板（`@milkdown/plugin-slash` 扩展 / 自建）
- Vim 键位（ProseMirror 层可行但工作量中等，按用户反馈排期）

## 7. UI/UX 与品牌系统对接

- **色板**：直接映射 `mdot-logo` 已定稿的品牌色——主色 `#4285F4`（强调/链接/选中）、强调黄 `#FBBC05`（光标高亮/待办）、墨色 `#232F3D`（正文）、红 `#EA4335` / 绿 `#34A853`（状态色）。全部走 CSS 变量，深浅主题共用一套 token。
- **字体**：正文默认 Lora / 宋体类衬线，界面用 Inter，代码用 JetBrains Mono（自托管 woff2 + 系统回退）；设置中可切换无衬线或等宽。
- **图标**：`tauri icon` 从 `mdot-logo/png/` 的 `mdot-icon-*.png` 生成双端图标 + 托盘图标；窗口内 UI 图标用 Lucide（轻、tree-shakeable）。
- **窗口**：Win 用自绘标题栏（Tauri `decorations: false` + 自定义拖拽区，嵌 mdot 图标）；mac 用原生交通灯 + 透明标题栏。两端行为差异在能力层隔离，UI 组件统一。
- **写作体验基线**：对标 Typora 的 Focus/Typewriter、宽版心（约 68–75 字符）、无干扰 chrome；营销标（d 内黄点版）用于启动画面和关于页。

## 8. 非功能性需求（体验与响应是硬指标）

| 项 | 预算 |
|---|---|
| **秒开** | 空窗口可见 < 400ms；1 万字内文档可输入 < 1s；5000 行文档可输入 < 2s（期间显示骨架屏） |
| **输入响应** | < 16ms/击键（60fps），长文不衰减 |
| **模式切换** | 无缝 ⇄ 双栏 < 100ms |
| **双栏同步** | 预览刷新防抖 150ms；滚动锚点偏移 < 半屏 |
| 内存 | 空闲 < 150MB（含 WebView） |
| 安装包 | Win/mac 均 < 15MB |
| 安全 | Tauri capabilities 白名单：前端只能调用显声明的 command；不开 nodeIntegration 类能力；localStorage 不用，敏感状态走 Rust 侧 |
| 可访问性 | 编辑器焦点管理、屏幕阅读器基本可用（ProseMirror aria 支持） |
| 数据安全 | 纯本地；无遥测。崩溃上报（可选）走用户同意的 opt-in |

### 8.1 秒开策略（五件套）

1. **窗口先行**：Tauri 以 `visible: false` 启动，前端骨架屏就绪后立即 `show()`——用户先看到窗框和品牌元素，编辑器在后台 hydration，感知启动 ≈ 窗框出现时间
2. **按需加载**：Milkdown/Crepe、CodeMirror 6、Mermaid（1MB+）、KaTeX、语言高亮数据全部动态 `import()`；首屏只加载编辑器外壳 + 主题 CSS
3. **启动零阻塞**：文件树扫描、最近文件、设置读取全部异步；Rust 侧启动期不执行任何阻塞 command
4. **包体即速度**：release profile 开 LTO + `strip` + `panic="abort"`；安装包小 = 下载等待短
5. **二次启动**：单实例模式（新文件替换当前 tab 而非新窗口）；OS 文件缓存天然命中

### 8.2 响应策略

- ProseMirror 增量更新是输入延迟的天然保障；>2000 行文档引导/提示切双栏源码模式（CM6 长文更稳）
- 自动保存防抖 800ms + 窗口失焦/隐藏时立即保存，**永不在输入路径上做磁盘 IO**
- 导出（PDF/docx）等重活全部在 Rust 异步执行，UI 线程零阻塞
- 动效 60/120fps，尊重 `prefers-reduced-motion`

### 8.3 体验清单（"体验感要好"的落地项）

- 双模式自由切换并记忆偏好，默认无缝；切换动画 < 100ms 无感
- Focus / Typewriter 模式、命令面板（Ctrl/Cmd+K）、斜杠菜单
- **中文排版优化**：CJK 标点悬挂、中西文混排自动间距、全角括号行首行尾禁则——Typora 亦重视 CJK，这是本土差异化细节
- 拖拽打开、图片粘贴入 assets、优雅的空状态与错误状态（打不开的文件、编码异常）
- 深色模式跟随系统；mac 毛玻璃 / Win 亚克力窗口材质可选
- 品牌触点：启动画面与关于页用营销标（d 内黄点版），窗口图标用主图标

## 9. 构建、签名与分发

| 平台 | 签名 | 分发 |
|---|---|---|
| Windows | Authenticode 证书（约 ¥1500–3000/年） | `.msi`（WiX）+ 便携 `.exe`；官网直连 |
| macOS | Apple Developer Program（$99/年）+ 公证（notarization） | `.dmg` + `.app`；官网直连 |

- 自动更新：`tauri-plugin-updater` + 静态 JSON 更新清单（官网/CDN），ed25519 签名。
- CI：GitHub Actions 双端矩阵构建（macOS runner 出 Win 包需额外配置或双 runner）；版本号单一来源（`tauri.conf.json`）。
- 未解决风险：Windows 无证书初期只能裸发，会被 SmartScreen 拦截——建议注册当天就买证书，或初期引导用户官网下载 + 说明。

## 10. 项目结构

```
mdot/
├─ src/                        # 前端（React + TS）
│  ├─ editor/
│  │  ├─ seamless/             # Milkdown/Crepe（无缝模式）
│  │  ├─ split/                # CM6 源码 + markdown-it 预览管道（双栏模式）
│  │  └─ modeSwitch.ts         # 模式切换、序列化、滚动位置映射
│  ├─ components/              # UI 外壳（标题栏、侧栏、大纲、状态栏）
│  ├─ store/                   # zustand：文件树、设置、主题
│  ├─ services/                # Tauri IPC 封装（invoke/emit 类型安全层）
│  ├─ theme/                   # CSS 变量、品牌 token、深浅主题
│  └─ main.tsx
├─ src-tauri/                  # Rust 后端
│  ├─ src/
│  │  ├─ commands/             # Tauri command：文件读写、工作区、导出
│  │  ├─ watcher.rs            # notify 文件监视
│  │  ├─ export.rs             # PDF/HTML/docx
│  │  └─ main.rs
│  ├─ capabilities/            # 权限白名单
│  └─ tauri.conf.json
├─ docs/                       # 本方案 + 决策记录（ADR）
├─ tests/                      # 往返保真黄金样本
└─ .github/workflows/          # 双端 CI
```

## 11. 关键依赖清单

**前端（package.json，实施时锁定具体版本）**

```
react, react-dom, typescript, vite, @vitejs/plugin-react
@tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs,
@tauri-apps/plugin-store, @tauri-apps/plugin-updater
@milkdown/crepe, @milkdown/react, @milkdown/kit, @milkdown/theme-nord
codemirror, @codemirror/lang-markdown, @codemirror/language-data, @codemirror/view
markdown-it                                  # 双栏预览管道
katex, mermaid
zustand, lucide-react
```

**Rust（Cargo.toml）**

```toml
tauri = { version = "2", features = [] }
tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-store, tauri-plugin-updater
notify = "6"          # 文件监视
serde, serde_json     # 序列化
```

## 12. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Crepe 定制化上限（工具栏/主题不合品牌） | 中 | 下沉 Kit 自组合；UI 外壳与编辑器层解耦，替换不影响全局 |
| 双 WebView 渲染差异（Win/mac 字体度量、滚动条） | 中 | 样式全部走 CSS 变量 + 显式 font-family 栈；双端每里程碑截图回归 |
| 5000+ 行文档无缝模式输入卡顿 | 中 | >2000 行引导切双栏；双栏下 CM6 + 增量预览重渲染；必要时分块/虚拟化 |
| 双栏同步滚动映射不准 | 低 | 锚点映射 + 用户手动滚动时短暂断开同步；不追求像素级对齐，保可用 |
| Rust 学习曲线拖慢文件层 | 低 | 文件层 API 面小（读写/监视/导出），官方插件覆盖大半；预留 1 周缓冲 |
| 未签名分发被 SmartScreen/Gatekeeper 拦截 | 高（首发转化） | 首发前办好双端证书；未拿证前官网引导 + 说明 |
| Windows 证书年费成本 | 低 | 个人开发者可选 OV 证书或初期接受警告 |

## 13. 参考实现

- **Typora**（闭源，体验基准）：Electron + 自研 AST 渲染 + CodeMirror 5 代码块 + MathJax/Mermaid + Pandoc 导出
- **MarkText**（MIT）：Electron + Vue + Muya 自研内核，唯一开源的 Typora 式无缝内核，值得读源码
- **Vditor**（MIT）：浏览器端所见即所得编辑器，IR 模式成熟，可作 web 备选内核
- **Milkdown 官方文档**：milkdown.dev（Kit/Crepe/React 集成、listener 自动保存范例）

---

## 附：决策记录（ADR）摘要

| # | 决策 | 状态 |
|---|---|---|
| 1 | 壳层选 Tauri 2 而非 Electron | 已定 |
| 2 | 编辑器内核选 Milkdown（Crepe 起步） | 已定 |
| 3 | 不做 Linux / 移动端 | 已定 |
| 4 | 前端 React + TS 而非 Vue/Svelte | 已定（生态） |
| 5 | 代码高亮用 CodeMirror 6 而非 Shiki | 暂定（Crepe 内置；后期可混用） |
| 6 | 自动保存默认开启（设置里可关闭） | 已定（2026-10-23 用户拍板） |
| 7 | 双模式架构：Markdown 字符串为唯一真相，Milkdown / CM6 互为视图 | 已定 |
| 8 | 双栏预览管道用 markdown-it 而非 Milkdown 只读实例 | 已定（性能优先，视觉靠共享 token 对齐） |
| 9 | 秒开列为目标级需求：窗口先行 + 全量按需加载 | 已定 |
