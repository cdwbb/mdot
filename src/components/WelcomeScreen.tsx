import { BookOpen, FilePlus2, FileText, FolderOpen, FolderTree, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { isDesktop } from '../services/backend';
import { newDocument, openFileDialog, openPath, openSample, openWorkspaceDialog } from '../app/actions';
import { APP_VERSION } from '../version';
import Logo from './Logo';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} 天前` : new Date(ts).toLocaleDateString('zh-CN');
}

export default function WelcomeScreen() {
  const recent = useAppStore((s) => s.recent);
  const showRecent = useAppStore((s) => s.settings.showRecent);
  const shortcut = isDesktop ? 'Ctrl/Cmd' : 'Ctrl/Cmd';

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__brand">
          <Logo size={58} className="welcome__logo" />
          <div>
            <h1 className="welcome__title">mdot</h1>
            <p className="welcome__subtitle">本地优先 · 三种视图 · 纸张般温润</p>
          </div>
        </div>

        <p className="welcome__tagline">
          一个安静的写作工作台。文字留在你的电脑上，输入即渲染；
          需要校对长文时切到双栏，需要并排处理两份文档时切到双文档。
          标签页与退出前的阅读位置都会自动恢复。
        </p>

        <div className="welcome__actions">
          <button className="welcome-card" onClick={newDocument}>
            <span className="welcome-card__icon">
              <FilePlus2 size={15} />
            </span>
            <span className="welcome-card__label">新建文档</span>
            <span className="welcome-card__hint">从空白开始，Ctrl/Cmd + N</span>
          </button>
          <button className="welcome-card" onClick={() => void openFileDialog()}>
            <span className="welcome-card__icon">
              <FolderOpen size={15} />
            </span>
            <span className="welcome-card__label">打开文件</span>
            <span className="welcome-card__hint">.md / .markdown / .txt</span>
          </button>
          <button className="welcome-card" onClick={() => void openWorkspaceDialog()}>
            <span className="welcome-card__icon">
              <FolderTree size={15} />
            </span>
            <span className="welcome-card__label">打开文件夹</span>
            <span className="welcome-card__hint">
              {isDesktop ? '整个目录变成文件树' : '需要桌面版'}
            </span>
          </button>
        </div>

        {showRecent && (
          <section className="welcome__recent">
            <div className="welcome__section-title">最近打开</div>
            {recent.length ? (
              recent.map((item) => (
                <button
                  key={item.path}
                  className="recent-row"
                  onClick={() => void openPath(item.path)}
                  title={item.path}
                >
                  <FileText size={14} style={{ color: 'var(--text-faint)', flex: '0 0 auto' }} />
                  <span className="recent-row__main">
                    <span className="recent-row__name">{item.name}</span>
                    <span className="recent-row__path">{item.path}</span>
                  </span>
                  <span className="recent-row__time" style={{ flex: '0 0 auto' }}>
                    {timeAgo(item.ts)}
                  </span>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '2px 8px 8px' }}>
                打开过的文件会出现在这里。
              </div>
            )}
          </section>
        )}

        <section className="welcome__recent">
          <div className="welcome__section-title">示例</div>
          <button className="recent-row" onClick={() => void openSample('welcome')}>
            <Sparkles size={14} style={{ color: 'var(--brand-blue)', flex: '0 0 auto' }} />
            <span className="recent-row__main">
              <span className="recent-row__name">欢迎使用 mdot</span>
              <span className="recent-row__path">公式、图表、表格、任务清单的完整展示</span>
            </span>
          </button>
          <button className="recent-row" onClick={() => void openSample('syntax')}>
            <BookOpen size={14} style={{ color: 'var(--text-faint)', flex: '0 0 auto' }} />
            <span className="recent-row__main">
              <span className="recent-row__name">Markdown 语法速查</span>
              <span className="recent-row__path">常用语法的可编辑参考</span>
            </span>
          </button>
        </section>

        <div className="welcome__foot">
          <span>
            <kbd className="kbd">{shortcut} K</kbd> 命令面板
          </span>
          <span>
            <kbd className="kbd">{shortcut} O</kbd> 打开
          </span>
          <span>
            <kbd className="kbd">{shortcut} /</kbd> 切换模式
          </span>
          <span>
            <kbd className="kbd">{shortcut} ,</kbd> 设置
          </span>
          <span style={{ marginLeft: 'auto', opacity: 0.8 }}>
            {isDesktop ? `桌面版 v${APP_VERSION}` : `浏览器预览 · v${APP_VERSION}`}
          </span>
        </div>
      </div>
    </div>
  );
}
