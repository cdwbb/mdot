export interface SampleDoc {
  id: string;
  title: string;
  fileName: string;
  content: string;
}

const welcome = `---
title: 欢迎使用 mdot
author: mdot
created: 2026-10-25
tags: [markdown, editor]
---

# 欢迎使用 mdot

> **本地优先、三种视图、纸张般温润的 Markdown 编辑器。**
> 文字与文件都留在你的电脑上，不经过任何服务器。

这是一个可以立刻开始写作的工作台。左边是文件与大纲，中间是编辑器，顶部可以在
**无缝**、**双栏**与**双文档**三种视图之间切换——它们共享同一份 Markdown 文本。
标签页会记住打开过的文档，退出前停在哪一页，下次回来就在哪一页。

## 先试试这几个动作

- 把光标放到 **粗体**、*斜体*、~~删除线~~ 或 \`行内代码\` 上，元语法会展开
- 输入 \`/\` 唤起斜杠菜单，插入标题、表格、代码块、公式
- 按 \`Ctrl/Cmd + K\` 打开命令面板，几乎所有操作都在里面
- 按 \`Ctrl/Cmd + /\` 在无缝、双栏与双文档之间切换
- 双栏或双文档的源码上方有完整格式工具栏，标题、表格、公式都能直接插入
- 按 \`Ctrl/Cmd + Tab\` 在标签页之间巡回，\`Ctrl/Cmd + W\` 关闭当前标签
- 直接拖一个 \`.md\` 文件到窗口里，或者按 \`Ctrl/Cmd + O\` 打开

## 它擅长的事

| 能力 | 说明 | 状态 |
| --- | --- | :---: |
| 无缝编辑 | Milkdown Crepe，输入即渲染 | ✅ |
| 双栏校对 | CodeMirror 6 + markdown-it | ✅ |
| 双文档 | 两个窗格，各自选择文档与显示方式 | ✅ |
| 源码工具栏 | 标题、列表、表格、公式、图片等快捷插入 | ✅ |
| 会话恢复 | 标签、窗格、视图与阅读位置自动还原 | ✅ |
| 数学公式 | KaTeX，行内与块级 | ✅ |
| 图表 | Mermaid 11，按需加载 | ✅ |
| 自动保存 | 间隔可调（0.8 秒–5 分钟）+ 原子写 | ✅ |
| 本地优先 | 无账号、无遥测、纯文件 | ✅ |

## 数学与图表

质能方程 $E = mc^2$ 可以写在行内；块级公式同样自然：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

\`\`\`mermaid
graph LR
  A[打开文档] --> B{选择视图}
  B -->|无缝| C[Crepe 所见即所得]
  B -->|双栏| D[CM6 源码 + 预览]
  B -->|双文档| G[两个窗格独立编辑]
  C --> E[自动保存]
  D --> E
  G --> E
  E --> F[(本地文件)]
\`\`\`

## 代码块

\`\`\`ts
type Mode = 'seamless' | 'split' | 'dual';

export function switchMode(next: Mode): void {
  // Markdown 文本是唯一真相，编辑器只是它的视图。
  document.documentElement.dataset.mode = next;
}
\`\`\`

## 写作时的小细节

1. 标题、列表、引用、任务清单都支持键盘流式输入
2. 表格可以直接拖拽调整列宽
3. 图片粘贴后会自动落到文档同目录的 \`assets/\` 里
4. 中文标点做了行首行尾禁则与中西文间距处理
5. 标签页可以双击重命名，未保存的修改会以圆点提示
6. 设置里可切换暖纸、雪白、青瓷、墨夜与深空五套配色
7. 深色模式跟随系统，也可以手动锁定

- [x] 打开一份文档
- [x] 写下一段话
- [ ] 把它保存到本地
- [ ] 关掉窗口，明天再回来

---

*这份示例不会自动保存到磁盘。想保留它，按 \`Ctrl/Cmd + Shift + S\` 另存为即可。*
`;

const syntax = `# Markdown 语法速查

## 标题

\`\`\`markdown
# 一级标题
## 二级标题
### 三级标题
\`\`\`

## 强调

**粗体**、*斜体*、***粗斜体***、~~删除线~~、\`行内代码\`、==高亮==（部分解析器）

## 列表

- 无序列表
- 嵌套
  - 第二层
1. 有序列表
2. 第二项

- [ ] 未完成任务
- [x] 已完成任务

## 引用与分割线

> 引用可以包含 **其他语法**。
>
> > 也可以嵌套。

---

## 链接与图片

[mdot 官网](https://example.com) · ![图片说明](assets/example.png)

## 代码

\`\`\`js
const answer = 42;
console.log(\`answer is \${answer}\`);
\`\`\`

## 表格

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| a | b | c |
| 1 | 2 | 3 |

## 公式

行内 $a^2 + b^2 = c^2$，块级：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## 脚注与 HTML

<details>
<summary>折叠内容</summary>

Markdown 里的 HTML 块也会被保留（导出时同样生效）。

</details>
`;

export const SAMPLES: SampleDoc[] = [
  { id: 'welcome', title: '欢迎使用 mdot', fileName: '欢迎使用 mdot.md', content: welcome },
  { id: 'syntax', title: 'Markdown 语法速查', fileName: 'Markdown 语法速查.md', content: syntax },
];

export function getSample(id: string): SampleDoc | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}
