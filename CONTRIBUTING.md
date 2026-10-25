# 贡献指南

感谢你对 mdot 的兴趣。本文说明开发环境、代码约定与提交流程。

## 开发环境

1. Node.js 20+（推荐 22+）、Rust stable + Cargo
2. Windows 需 Visual Studio Build Tools（MSVC + Windows SDK）；macOS 需 Xcode Command Line Tools
3. `npm install` 后：

```bash
npm run tauri:dev    # 桌面端开发（推荐，文件能力完整）
npm run dev          # 浏览器预览，仅用于 UI 走查
npm run check        # TypeScript 类型检查（提交前必须通过）
npm run build        # 仅构建前端
npm run tauri:build  # 构建安装包
```

Windows 首次构建请在 "x64 Native Tools Command Prompt for VS 2022" 中执行，或先运行 `vcvars64.bat`，否则 Rust 找不到 `link.exe`。

## 代码约定

- TypeScript `strict` 模式；不使用 `any`，必要时用 `unknown` 加类型收窄
- 2 空格缩进、单引号、语句结尾分号；组件文件 PascalCase，其余 camelCase
- 注释默认不写。只在解释"为什么"（隐藏约束、绕过的具体 bug、不明显的不变量）时写一行
- 状态集中在 `src/store/useAppStore.ts`（zustand）；跨模块动作放 `src/app/actions.ts`，命令面板条目放 `src/app/commands.ts`
- 前端不直接调 Tauri API，一律经 `src/services/backend.ts` 的 `Backend` 接口，保证浏览器预览模式可用
- 写盘只能走 Rust 侧原子写（临时文件 + rename），前端不得绕过

## 改动编辑器内核时

无缝、双栏、双文档是三条独立渲染路径，任何内核改动都要分别验证：

- 打开示例文档（欢迎使用 mdot / Markdown 语法速查）确认渲染无回归
- 输入 → 保存 → 重新打开，确认 Markdown 往返结果符合预期
- 切换主题与打字机/专注模式，确认无样式或滚动异常
- 大文档（含多个 Mermaid 图表与图片）下的首屏与输入延迟

## 提交流程

1. 从 `main` 切出分支：`feat/xxx`、`fix/xxx`、`docs/xxx`
2. 大功能先开 Issue 讨论，避免返工
3. 提交信息使用 Conventional Commits：`feat: 支持 docx 导出`、`fix: 修复退出时未保存提示重复弹出`
4. 一个 PR 只做一件事；PR 描述里说明动机与验证方式
5. 若涉及用户可见变更，更新 `CHANGELOG.md`（Unreleased 段）

## 添加一种新主题

1. 在 `src/theme.ts` 的 `THEMES` 增加 `value` / `label` / `scheme`
2. 在样式中以 CSS 变量覆盖 token（正文、强调、边框、背景、代码块底色），不要写死颜色
3. 深浅两套各验证一遍：无缝模式的元语法提示、代码块高亮、表格边框、选中态

## 版本与发布

版本号需同步四处：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（及 `Cargo.lock`）、`src/version.ts` 的兜底常量。桌面版界面显示的是二进制自身版本，无需改前端代码。

发布由维护者执行：打 `v*` 标签推送后，GitHub Actions 自动构建 Windows/macOS 安装包并创建 Release。**不要把安装包提交进仓库。**

## 行为准则

就一条：像自己会被别人 PR 卡住那样对待贡献者。批评代码，不批评人。
