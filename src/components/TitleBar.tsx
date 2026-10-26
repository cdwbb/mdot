import {
  Download,
  Loader2,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  Save,
  Settings as SettingsIcon,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { isDesktop } from '../services/backend';
import { exportHtml, saveDocument, showWelcome as goHome } from '../app/actions';
import Logo from './Logo';
import { THEME_LABEL, nextTheme } from '../theme';

function windowAction(action: 'minimize' | 'toggleMaximize' | 'close'): void {
  if (!isDesktop) return;
  void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    if (action === 'minimize') void win.minimize();
    else if (action === 'toggleMaximize') void win.toggleMaximize();
    else void win.close();
  });
}

export default function TitleBar() {
  const doc = useAppStore((s) => s.doc);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const saveState = useAppStore((s) => s.saveState);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const theme = useAppStore((s) => s.settings.theme);
  const autoSave = useAppStore((s) => s.settings.autoSave);
  const platform = useAppStore((s) => s.platform);
  const showWelcome = useAppStore((s) => s.showWelcome);

  const dirty = doc.content !== doc.savedContent;
  const ThemeIcon =
    theme === 'system' ? Monitor : theme === 'ink' || theme === 'midnight' ? Moon : Sun;

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__left" data-tauri-drag-region>
        <button
          className="titlebar__brand no-drag"
          title="回到 mdot 主屏"
          onClick={() => goHome()}
        >
          <Logo size={19} />
          <span className="titlebar__brand-name">mdot</span>
        </button>
        <span className="titlebar__divider" />
        <div className="titlebar__doc" data-tauri-drag-region>
          <span className={`titlebar__filename ${doc.path ? '' : 'is-untitled'}`}>
            {showWelcome ? '本地 Markdown 工作台' : doc.name}
          </span>
          {dirty && !showWelcome && (
            <span className="dirty-dot" title="有未保存的修改" aria-label="有未保存的修改" />
          )}
          {!showWelcome && (
            <span
              className={`save-state ${
                saveState === 'saved' ? 'is-saved' : saveState === 'error' ? 'is-error' : ''
              }`}
            >
              {saveState === 'saving' && (
                <>
                  <Loader2 size={10} className="spin" /> 保存中
                </>
              )}
              {saveState === 'saved' && '已保存' }
              {saveState === 'error' && '保存失败'}
              {saveState !== 'saving' && saveState !== 'saved' && saveState !== 'error' && (
                <>{dirty ? (autoSave ? '自动保存已开启' : '未保存') : autoSave ? '自动保存' : '手动保存'}</>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="titlebar__right no-drag">
        <button
          className={`icon-btn ${sidebarOpen ? 'is-active' : ''}`}
          title={`${sidebarOpen ? '隐藏' : '显示'}侧栏 (Ctrl/Cmd + Shift + B)`}
          onClick={() => useAppStore.getState().setSidebarOpen(!sidebarOpen)}
        >
          <PanelLeft size={15} />
        </button>
        <button
          className={`icon-btn titlebar__save ${dirty ? 'is-dirty' : ''}`}
          title="保存 (Ctrl/Cmd + S)"
          onClick={() => void saveDocument()}
          disabled={showWelcome || !activeTabId}
        >
          {saveState === 'saving' ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Save size={15} />
          )}
        </button>
        <button
          className="icon-btn"
          title="导出 HTML (Ctrl/Cmd + Shift + E)"
          onClick={() => void exportHtml()}
          disabled={showWelcome}
        >
          <Download size={15} />
        </button>
        <button
          className="icon-btn"
          title={`主题：${THEME_LABEL[theme]}（点击切换）`}
          onClick={() =>
            useAppStore.getState().patchSettings({ theme: nextTheme(theme) })
          }
        >
          <ThemeIcon size={15} />
        </button>
        <button
          className="icon-btn"
          title="设置 (Ctrl/Cmd + ,)"
          onClick={() => useAppStore.getState().setSettingsOpen(true)}
        >
          <SettingsIcon size={15} />
        </button>

        {platform !== 'mac' && platform !== 'web' && (
          <div className="window-controls">
            <button aria-label="最小化" onClick={() => windowAction('minimize')}>
              <Minus size={14} />
            </button>
            <button aria-label="最大化 / 还原" onClick={() => windowAction('toggleMaximize')}>
              <Square size={11} />
            </button>
            <button className="wc-close" aria-label="关闭" onClick={() => windowAction('close')}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
