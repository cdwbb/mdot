import { useAppStore } from '../store/useAppStore';
import { isDesktop } from '../services/backend';
import { newDocument, openFileDialog, openPath, openWorkspaceDialog } from '../app/actions';
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

        <div className="welcome__links">
          <button className="welcome-link" onClick={newDocument}>
            新建文档
          </button>
          <span className="welcome__dot" aria-hidden="true">
            ·
          </span>
          <button className="welcome-link" onClick={() => void openFileDialog()}>
            打开文件
          </button>
          {isDesktop && (
            <>
              <span className="welcome__dot" aria-hidden="true">
                ·
              </span>
              <button
                className="welcome-link"
                onClick={() => void openWorkspaceDialog()}
              >
                打开文件夹
              </button>
            </>
          )}
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

        <div className="welcome__meta">
          {isDesktop ? `桌面版 v${APP_VERSION}` : `浏览器预览 · v${APP_VERSION}`}
        </div>
      </div>
    </div>
  );
}
