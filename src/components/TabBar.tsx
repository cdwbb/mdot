import { useEffect, useRef } from 'react';
import {
  ArrowLeftRight,
  Columns2,
  FilePlus2,
  FileText,
  LayoutGrid,
  PenLine,
  Rows3,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  closeTab,
  newDocument,
  renameTab,
} from '../app/actions';
import { switchMode } from '../editor/modeSwitch';
import type { EditorMode } from '../types';

const MODES: Array<{ mode: EditorMode; label: string; icon: typeof PenLine }> = [
  { mode: 'seamless', label: '无缝', icon: PenLine },
  { mode: 'split', label: '双栏', icon: Columns2 },
  { mode: 'dual', label: '双文档', icon: LayoutGrid },
];

export default function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const mode = useAppStore((s) => s.mode);
  const paneA = useAppStore((s) => s.paneA);
  const paneB = useAppStore((s) => s.paneB);
  const activePane = useAppStore((s) => s.activePane);
  const splitLayout = useAppStore((s) => s.splitLayout);
  const previewLeft = useAppStore((s) => s.settings.previewLeft);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  if (!tabs.length) return null;

  const selectTab = (id: string) => {
    const state = useAppStore.getState();
    if (state.mode === 'dual') state.setPaneTab(state.activePane, id);
    else state.activateTab(id);
  };

  return (
    <div className="tabbar">
      <div className="tabbar__tabs" role="tablist" aria-label="打开的文档">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const inA = mode === 'dual' && paneA.tabId === tab.id;
          const inB = mode === 'dual' && paneB.tabId === tab.id;
          return (
            <div
              key={tab.id}
              ref={active ? activeRef : undefined}
              className={`tab ${active ? 'is-active' : ''}`}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={tab.path || tab.name}
              onClick={() => selectTab(tab.id)}
              onDoubleClick={() => void renameTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectTab(tab.id);
                }
              }}
            >
              {mode === 'dual' && (inA || inB) && (
                <span className={`tab__pane ${activePane === 'a' && inA ? 'is-current' : ''}`}>
                  {inA && inB ? 'AB' : inA ? 'A' : 'B'}
                </span>
              )}
              <FileText size={13} className="tab__icon" />
              <span className="tab__name">{tab.name}</span>
              {tab.content !== tab.savedContent && (
                <span className="tab__dirty" title="未保存" aria-label="未保存" />
              )}
              <button
                className="tab__close"
                title="关闭标签页"
                aria-label={`关闭 ${tab.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button className="tabbar__new" title="新建文档 (Ctrl/Cmd + N)" onClick={newDocument}>
          <FilePlus2 size={14} />
        </button>
      </div>

      <div className="tabbar__actions">
        <div className="segmented tabbar__modes" role="tablist" aria-label="编辑模式">
          {MODES.map(({ mode: itemMode, label, icon: Icon }) => (
            <button
              key={itemMode}
              className={`segmented__item ${mode === itemMode ? 'is-active' : ''}`}
              onClick={() => switchMode(itemMode)}
              role="tab"
              aria-selected={mode === itemMode}
              title={
                itemMode === 'seamless'
                  ? '无缝模式：所见即所得'
                  : itemMode === 'split'
                    ? '双栏模式：源码 + 预览'
                    : '双文档：两个独立编辑窗格'
              }
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {mode === 'split' && (
          <>
            <span className="tabbar__sep" />
            <button
              className="icon-btn tabbar__tool"
              title={previewLeft ? '预览移到右侧' : '预览移到左侧'}
              onClick={() =>
                useAppStore.getState().patchSettings({ previewLeft: !previewLeft })
              }
            >
              <ArrowLeftRight size={14} />
            </button>
            <span className="tabbar__pane-label">
              {previewLeft ? '预览 · 源码' : '源码 · 预览'}
            </span>
          </>
        )}

        {mode === 'dual' && (
          <>
            <span className="tabbar__sep" />
            <button
              className="icon-btn tabbar__tool"
              title={splitLayout === 'columns' ? '改为上下布局' : '改为左右布局'}
              onClick={() =>
                useAppStore
                  .getState()
                  .setSplitLayout(splitLayout === 'columns' ? 'rows' : 'columns')
              }
            >
              {splitLayout === 'columns' ? <Rows3 size={14} /> : <Columns2 size={14} />}
            </button>
            <button
              className="icon-btn tabbar__tool"
              title="交换两侧窗格"
              onClick={() => useAppStore.getState().swapPanes()}
            >
              <span className="swap-glyph">⇄</span>
            </button>
            <span className="tabbar__pane-label">
              {activePane.toUpperCase()} 窗格
            </span>
          </>
        )}
      </div>
    </div>
  );
}
