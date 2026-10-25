import { useMemo } from 'react';
import { Columns2, Focus, LayoutGrid, PenLine, Timer, Type, Moon, Sun, Monitor } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { countStats } from '../utils/markdown';
import { toggleMode } from '../editor/modeSwitch';
import { THEME_LABEL, nextTheme } from '../theme';

export default function StatusBar() {
  const content = useAppStore((s) => s.doc.content);
  const dirty = useAppStore((s) => s.doc.content !== s.doc.savedContent);
  const mode = useAppStore((s) => s.mode);
  const line = useAppStore((s) => s.cursorLine);
  const column = useAppStore((s) => s.cursorColumn);
  const activePane = useAppStore((s) => s.activePane);
  const paneA = useAppStore((s) => s.paneA);
  const paneB = useAppStore((s) => s.paneB);
  const focusMode = useAppStore((s) => s.focusMode);
  const typewriter = useAppStore((s) => s.settings.typewriter);
  const autoSave = useAppStore((s) => s.settings.autoSave);
  const theme = useAppStore((s) => s.settings.theme);
  const saveState = useAppStore((s) => s.saveState);

  const stats = useMemo(() => countStats(content), [content]);
  const activePaneState = activePane === 'a' ? paneA : paneB;
  const showCursor = mode === 'split' || (mode === 'dual' && activePaneState.view === 'source');

  const ThemeIcon =
    theme === 'system' ? Monitor : theme === 'ink' || theme === 'midnight' ? Moon : Sun;
  const statusText =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'error'
        ? '保存失败'
        : dirty
          ? autoSave
            ? '编辑中 · 自动保存'
            : '未保存'
          : '已保存';

  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span className="statusbar__item">
          <span className={`statusbar__dot ${dirty ? 'is-dirty' : ''}`} />
          {statusText}
        </span>
        <span className="statusbar__sep" />
        <button className="statusbar__item statusbar__mode" onClick={toggleMode} title="切换编辑模式">
          {mode === 'seamless' ? (
            <PenLine size={11} />
          ) : mode === 'split' ? (
            <Columns2 size={11} />
          ) : (
            <LayoutGrid size={11} />
          )}
          {mode === 'seamless' ? '无缝模式' : mode === 'split' ? '双栏模式' : '双文档'}
        </button>
        <span className="statusbar__sep" />
        <span className="statusbar__item" title="字数（中文按字、西文按词）">
          {stats.words.toLocaleString('zh-CN')} 字
        </span>
        <span className="statusbar__item" title="字符数（不含空白）">
          {stats.chars.toLocaleString('zh-CN')} 字符
        </span>
        <span className="statusbar__item" title="预计阅读时间">
          <Timer size={10} />
          {stats.readingMinutes} 分钟
        </span>
        {showCursor && (
          <span className="statusbar__item" title="光标位置（行 / 列）">
            第 {line} 行 · 第 {column} 列
          </span>
        )}
      </div>

      <div className="statusbar__spacer" />

      <div className="statusbar__group">
        <button
          className={`statusbar__item ${focusMode ? 'is-accent' : ''}`}
          onClick={() => useAppStore.getState().setFocusMode(!focusMode)}
          title="专注模式：隐藏界面干扰 (Ctrl/Cmd + Shift + F)"
        >
          <Focus size={11} />
          专注
        </button>
        <button
          className={`statusbar__item ${typewriter ? 'is-accent' : ''}`}
          onClick={() =>
            useAppStore.getState().patchSettings({ typewriter: !typewriter })
          }
          title="打字机模式：光标保持居中 (Ctrl/Cmd + Shift + T)"
        >
          <Type size={11} />
          打字机
        </button>
        <span className="statusbar__sep" />
        <button
          className="statusbar__item"
          onClick={() =>
            useAppStore.getState().patchSettings({ theme: nextTheme(theme) })
          }
          title={`主题：${THEME_LABEL[theme]}（点击切换）`}
        >
          <ThemeIcon size={11} />
        </button>
        <span className="statusbar__item" title="编码">
          UTF-8
        </span>
        <span className="statusbar__item" title="Markdown">
          Markdown
        </span>
      </div>
    </footer>
  );
}
