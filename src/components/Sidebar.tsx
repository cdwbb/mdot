import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  ListTree,
  PanelLeftClose,
  RefreshCw,
  FilePlus2,
} from 'lucide-react';
import { selectDirty, useAppStore } from '../store/useAppStore';
import { newDocument, openPath, openWorkspaceDialog, refreshTree } from '../app/actions';
import { emitGoto } from '../editor/bus';
import Logo from './Logo';
import type { FileNode } from '../types';

function TreeNode({
  node,
  depth,
  activePath,
  dirty,
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const padding = 6 + depth * 12;

  if (node.isDir) {
    return (
      <>
        <button
          className="tree-item is-dir"
          style={{ paddingLeft: padding }}
          onClick={() => setOpen((value) => !value)}
          title={node.path}
        >
          <span className={`tree-item__chevron ${open ? 'is-open' : ''}`}>
            <ChevronRight size={11} />
          </span>
          <span className="tree-item__icon">
            {open ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <span className="tree-item__name">{node.name}</span>
          {node.children?.length ? <span className="tree-item__badge">{node.children.length}</span> : null}
        </button>
        {open && (
          <div className="tree-children">
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                dirty={dirty}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  const active = activePath === node.path;
  return (
    <button
      className={`tree-item ${active ? 'is-active' : ''}`}
      style={{ paddingLeft: padding + 14 }}
      onClick={() => void openPath(node.path)}
      title={node.path}
    >
      <span className="tree-item__icon">
        <FileText size={13} />
      </span>
      <span className="tree-item__name">{node.name}</span>
      {active && dirty && <span className="dirty-dot" style={{ width: 5, height: 5 }} />}
    </button>
  );
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.isDir ? countFiles(node.children ?? []) : 1),
    0,
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export default function Sidebar() {
  const view = useAppStore((s) => s.sidebarView);
  const workspace = useAppStore((s) => s.workspace);
  const tree = useAppStore((s) => s.tree);
  const treeLoading = useAppStore((s) => s.treeLoading);
  const recent = useAppStore((s) => s.recent);
  const showRecent = useAppStore((s) => s.settings.showRecent);
  const outline = useAppStore((s) => s.outline);
  const activeHeading = useAppStore((s) => s.activeHeading);
  const docPath = useAppStore((s) => s.doc.path);
  const dirty = useAppStore(selectDirty);
  const setView = useAppStore((s) => s.setSidebarView);
  const setOpen = useAppStore((s) => s.setSidebarOpen);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const fileCount = useMemo(() => countFiles(tree), [tree]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeHeading]);

  return (
    <aside className="sidebar" aria-label="侧栏">
      <div className="sidebar__head">
        <div className="sidebar__tabs" role="tablist">
          <button
            className={`sidebar__tab ${view === 'files' ? 'is-active' : ''}`}
            onClick={() => setView('files')}
            role="tab"
            aria-selected={view === 'files'}
          >
            <FolderTree size={12} />
            文件
          </button>
          <button
            className={`sidebar__tab ${view === 'outline' ? 'is-active' : ''}`}
            onClick={() => setView('outline')}
            role="tab"
            aria-selected={view === 'outline'}
          >
            <ListTree size={12} />
            大纲
          </button>
        </div>
        <div className="sidebar__head-actions">
          {view === 'files' ? (
            <>
              <button className="icon-btn" title="打开文件夹" onClick={() => void openWorkspaceDialog()}>
                <FolderOpen size={13} />
              </button>
              {workspace && (
                <button
                  className="icon-btn"
                  title="刷新文件树"
                  onClick={() => void refreshTree()}
                  disabled={treeLoading}
                >
                  <RefreshCw size={13} className={treeLoading ? 'spin' : ''} />
                </button>
              )}
            </>
          ) : (
            <button className="icon-btn" title="新建文档" onClick={newDocument}>
              <FilePlus2 size={13} />
            </button>
          )}
          <button className="icon-btn" title="隐藏侧栏" onClick={() => setOpen(false)}>
            <PanelLeftClose size={13} />
          </button>
        </div>
      </div>

      {view === 'files' ? (
        <>
          <div className="sidebar__meta">
            <span>{workspace ? '工作区' : '本地'}</span>
            <span className="sidebar__meta-name">{workspace?.name ?? '未打开文件夹'}</span>
          </div>
          <div className="sidebar__body">
            {workspace ? (
              tree.length ? (
                <div className="tree" role="tree">
                  {tree.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      activePath={docPath}
                      dirty={dirty}
                    />
                  ))}
                </div>
              ) : (
                <div className="sidebar__empty">
                  {treeLoading ? '正在读取…' : '这个文件夹里还没有 Markdown 文件'}
                </div>
              )
            ) : (
              <>
                <div className="sidebar__empty">
                  <strong>还没有打开工作区</strong>
                  选择一个文件夹，就能在这里浏览其中的 Markdown 文件。
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn--outline btn--sm" onClick={() => void openWorkspaceDialog()}>
                      <FolderOpen size={12} />
                      打开文件夹
                    </button>
                  </div>
                </div>
                {showRecent && recent.length > 0 && (
                  <>
                    <div className="sidebar__meta" style={{ paddingTop: 10 }}>
                      <span>最近</span>
                    </div>
                    {recent.map((item) => (
                      <button
                        key={item.path}
                        className="recent-row"
                        onClick={() => void openPath(item.path)}
                        title={item.path}
                      >
                        <FileText size={13} style={{ color: 'var(--text-faint)', flex: '0 0 auto' }} />
                        <span className="recent-row__main">
                          <span className="recent-row__name">{item.name}</span>
                          <span className="recent-row__time">{timeAgo(item.ts)}</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          <div className="sidebar__foot">
            <Logo size={14} />
            <span>{workspace ? `${fileCount} 个 Markdown 文件` : 'mdot · 本地优先'}</span>
          </div>
        </>
      ) : (
        <>
          <div className="sidebar__meta">
            <span>大纲</span>
            <span className="sidebar__meta-name">
              {outline.length ? `${outline.length} 个标题` : '当前文档'}
            </span>
          </div>
          <div className="sidebar__body">
            {outline.length ? (
              <div className="outline" role="tree">
                {outline.map((item) => {
                  const active = activeHeading === item.id;
                  return (
                    <button
                      key={item.id}
                      ref={active ? activeItemRef : undefined}
                      className={`outline__item ${active ? 'is-active' : ''}`}
                      style={{ paddingLeft: 10 + (item.level - 1) * 12 }}
                      onClick={() => emitGoto({ anchor: item.id, line: item.line })}
                      title={item.text}
                    >
                      <span className="outline__level">H{item.level}</span>
                      <span className="outline__text">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="sidebar__empty">
                <strong>还没有标题</strong>
                用 <code>#</code> 创建标题后，这里会显示可跳转的大纲。
              </div>
            )}
          </div>
          <div className="sidebar__foot">
            <ListTree size={12} />
            <span>点击标题快速跳转</span>
          </div>
        </>
      )}
    </aside>
  );
}
