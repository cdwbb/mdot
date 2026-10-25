import { useMemo } from 'react';
import {
  Check,
  Columns2,
  Download,
  FilePlus2,
  FileText,
  Focus,
  FolderOpen,
  FolderTree,
  LayoutGrid,
  ListTree,
  Moon,
  PanelLeft,
  PenLine,
  Printer,
  Save,
  SaveAll,
  Settings,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { THEME_LABEL, nextTheme } from '../theme';
import {
  closeDocument,
  exportHtml,
  newDocument,
  openFileDialog,
  openPath,
  openSample,
  openWorkspaceDialog,
  printDocument,
  saveDocument,
} from './actions';
import { switchMode, toggleMode } from '../editor/modeSwitch';
import { emitGoto } from '../editor/bus';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  keys?: string;
  run: () => void | Promise<void>;
}

export function useCommands(): Command[] {
  const mode = useAppStore((s) => s.mode);
  const theme = useAppStore((s) => s.settings.theme);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const focusMode = useAppStore((s) => s.focusMode);
  const typewriter = useAppStore((s) => s.settings.typewriter);
  const outline = useAppStore((s) => s.outline);
  const recent = useAppStore((s) => s.recent);
  const showWelcome = useAppStore((s) => s.showWelcome);

  return useMemo(() => {
    const list: Command[] = [
      {
        id: 'new',
        label: '新建文档',
        group: '文件',
        icon: FilePlus2,
        keys: 'Mod N',
        run: newDocument,
      },
      {
        id: 'open',
        label: '打开文件…',
        group: '文件',
        icon: FolderOpen,
        keys: 'Mod O',
        run: () => openFileDialog(),
      },
      {
        id: 'workspace',
        label: '打开文件夹作为工作区…',
        group: '文件',
        icon: FolderTree,
        keys: 'Mod Shift O',
        run: () => openWorkspaceDialog(),
      },
      {
        id: 'save',
        label: '保存',
        group: '文件',
        icon: Save,
        keys: 'Mod S',
        run: () => saveDocument(),
      },
      {
        id: 'save-as',
        label: '另存为…',
        group: '文件',
        icon: SaveAll,
        keys: 'Mod Shift S',
        run: () => saveDocument(true),
      },
      {
        id: 'export-html',
        label: '导出 HTML（含样式与图表）',
        group: '导出',
        icon: Download,
        keys: 'Mod Shift E',
        run: exportHtml,
      },
      {
        id: 'print',
        label: '打印 / 导出 PDF…',
        group: '导出',
        icon: Printer,
        keys: 'Mod Shift P',
        run: printDocument,
      },
      {
        id: 'close',
        label: '关闭当前文档',
        group: '文件',
        icon: X,
        run: closeDocument,
      },
      {
        id: 'mode-toggle',
        label:
          mode === 'seamless'
            ? '切换到双栏（源码 + 预览）'
            : mode === 'split'
              ? '切换到双文档'
              : '切换到无缝模式',
        group: '视图',
        icon: Columns2,
        keys: 'Mod /',
        run: toggleMode,
      },
      {
        id: 'mode-seamless',
        label: '无缝模式（所见即所得）',
        group: '视图',
        icon: PenLine,
        run: () => switchMode('seamless'),
      },
      {
        id: 'mode-split',
        label: '双栏模式（源码 + 预览）',
        group: '视图',
        icon: Columns2,
        run: () => switchMode('split'),
      },
      {
        id: 'mode-dual',
        label: '双文档模式（两个独立窗格）',
        group: '视图',
        icon: LayoutGrid,
        run: () => switchMode('dual'),
      },
      {
        id: 'theme',
        label: `切换主题（当前：${THEME_LABEL[theme]}）`,
        group: '视图',
        icon: Moon,
        run: () =>
          useAppStore.getState().patchSettings({
            theme: nextTheme(theme),
          }),
      },
      {
        id: 'sidebar',
        label: sidebarOpen ? '隐藏侧栏' : '显示侧栏',
        group: '视图',
        icon: PanelLeft,
        keys: 'Mod Shift B',
        run: () => useAppStore.getState().setSidebarOpen(!sidebarOpen),
      },
      {
        id: 'focus',
        label: focusMode ? '退出专注模式' : '进入专注模式',
        group: '视图',
        icon: Focus,
        keys: 'Mod Shift F',
        run: () => useAppStore.getState().setFocusMode(!focusMode),
      },
      {
        id: 'typewriter',
        label: typewriter ? '关闭打字机模式' : '开启打字机模式',
        group: '视图',
        icon: Type,
        keys: 'Mod Shift T',
        run: () => useAppStore.getState().patchSettings({ typewriter: !typewriter }),
      },
      {
        id: 'settings',
        label: '打开设置…',
        group: '视图',
        icon: Settings,
        keys: 'Mod ,',
        run: () => useAppStore.getState().setSettingsOpen(true),
      },
      {
        id: 'sample-welcome',
        label: '示例：欢迎使用 mdot',
        group: '示例',
        icon: Sparkles,
        run: () => openSample('welcome'),
      },
      {
        id: 'sample-syntax',
        label: '示例：Markdown 语法速查',
        group: '示例',
        icon: FileText,
        run: () => openSample('syntax'),
      },
    ];

    if (!showWelcome) {
      for (const item of outline.slice(0, 14)) {
        list.push({
          id: `outline-${item.id}`,
          label: item.text,
          hint: `H${item.level} · 第 ${item.line} 行`,
          group: '跳转到标题',
          icon: ListTree,
          run: () => emitGoto({ anchor: item.id, line: item.line }),
        });
      }
    }

    for (const item of recent.slice(0, 6)) {
      list.push({
        id: `recent-${item.path}`,
        label: item.name,
        hint: item.path,
        group: '最近文件',
        icon: Check,
        run: () => openPath(item.path),
      });
    }

    return list;
  }, [mode, theme, sidebarOpen, focusMode, typewriter, outline, recent, showWelcome]);
}
