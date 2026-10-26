import { FilePlus2, FolderOpen, FolderTree } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { isDesktop } from '../services/backend';
import { newDocument, openFileDialog, openPath, openWorkspaceDialog } from '../app/actions';
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

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__brand">
          <Logo size={58} className="welcome__logo" />
          <h1 className="welcome__title">mdot</h1>
        </div>

        <p className="welcome__intro">
          本地优先的 Markdown 写作台。文字只留在你的电脑上，输入即渲染。
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

        {showRecent && recent.length > 0 && (
          <section className="welcome__recent">
            <div className="welcome__section-title">最近打开</div>
            {recent.map((item) => (
              <button
                key={item.path}
                className="recent-row"
                onClick={() => void openPath(item.path)}
                title={item.path}
              >
                <span className="recent-row__main">
                  <span className="recent-row__name">{item.name}</span>
                  <span className="recent-row__path">{item.path}</span>
                </span>
                <span className="recent-row__time">{timeAgo(item.ts)}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
