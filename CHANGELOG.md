# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-26

首次公开发布。1.0.0 汇总了内部迭代阶段的全部能力，从该版本起对外使用语义化版本号。

### Added

- **三种视图**：无缝所见即所得（Milkdown Crepe）、双栏源码 + 预览（CodeMirror 6 + markdown-it）、双文档并排窗格，切换并记忆偏好
- **扩展语法**：KaTeX 行内与块级公式、Mermaid 11 图表、代码高亮、YAML Front Matter（保存时原样保留）、任务清单
- **源码工具栏**：标题、强调、上下标、高亮、行内数学、表格、公式块、HTML 块、前置元数据等一键插入
- **多标签页与会话恢复**：标签内容、当前文档、视图、窗格与阅读位置自动还原；设置中可关闭并清除
- **工作区**：文件树、大纲、近期文件（可整体关闭显示）、命令面板（`Ctrl/Cmd + K`）
- **图片处理**：粘贴/拖拽图片自动存入文档同级 `assets/` 并插入相对路径
- **文件安全**：外部修改监听与冲突提示、退出前未保存保护（系统原生对话框只提示一次）、Rust 侧临时文件 + rename 原子写
- **自动保存**：失焦立即保存 + 可调间隔（0.8 秒 / 10 秒 / 30 秒 / 1 / 2 / 5 分钟）
- **外观**：暖纸、雪白、青瓷、墨夜、深空、跟随系统六套主题；自托管 Inter / Lora / JetBrains Mono
- **写作辅助**：打字机模式（三种视图均保持光标行居中）、专注模式、状态栏行列号
- **导出**：导出 HTML；PDF 通过系统打印
- **权限收敛**：Tauri capabilities 白名单，前端只能调用已声明的命令与插件权限
- **打包分发**：Windows NSIS 中文安装向导 + 单文件便携版；macOS DMG；GitHub Actions 打 tag 自动构建并发布 Release，附带 `SHA256SUMS.txt`

### Known limitations

- 未做代码签名与自动更新；无 docx 导出、无 Vim 键位
- Milkdown 保存会重新序列化 Markdown，表格对齐与部分转义可能被规范化
- 读取兼容 UTF-8 / UTF-16 / GBK，保存统一写回 UTF-8
- CSP 暂未启用，`assetProtocol.scope` 仍为 `**`
- 启动与内存尚未达到设计预算（详见 README 的已知限制）

[1.0.0]: https://github.com/cdwbb/mdot/releases/tag/v1.0.0
