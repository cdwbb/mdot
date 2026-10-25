import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FolderOpen, Save, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { openFileDialog, saveTab } from '../../app/actions';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';
import type { PaneKey, PaneState, TabState } from '../../types';
import { PaneSeamlessEditor } from './PaneSeamlessEditor';
import { PaneSourceEditor } from './PaneSourceEditor';

function tabFor(tabs: TabState[], pane: PaneState): TabState | null {
  return tabs.find((tab) => tab.id === pane.tabId) || null;
}

function PaneHeader({
  paneKey,
  pane,
  tab,
  active,
}: {
  paneKey: PaneKey;
  pane: PaneState;
  tab: TabState | null;
  active: boolean;
}) {
  const tabs = useAppStore((s) => s.tabs);
  const setPaneTab = useAppStore((s) => s.setPaneTab);
  const setPaneView = useAppStore((s) => s.setPaneView);
  const setActivePane = useAppStore((s) => s.setActivePane);

  return (
    <div
      className={`dual-pane__head ${active ? 'is-active' : ''}`}
      onPointerDown={() => setActivePane(paneKey)}
    >
      <span className={`dual-pane__badge ${active ? 'is-active' : ''}`}>
        {paneKey.toUpperCase()}
      </span>
      <div className="dual-pane__doc">
        <select
          className="dual-pane__select"
          value={pane.tabId || ''}
          onChange={(event) => {
            if (!event.target.value) return;
            setActivePane(paneKey);
            setPaneTab(paneKey, event.target.value);
          }}
          aria-label={`${paneKey.toUpperCase()} 窗格文档`}
        >
          {!pane.tabId && <option value="">选择文档…</option>}
          {tabs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.content !== item.savedContent ? ' •' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="dual-pane__view segmented" role="tablist" aria-label="窗格显示模式">
        <button
          className={`segmented__item ${pane.view === 'seamless' ? 'is-active' : ''}`}
          onClick={() => setPaneView(paneKey, 'seamless')}
          role="tab"
          aria-selected={pane.view === 'seamless'}
          title="无缝显示"
        >
          无缝
        </button>
        <button
          className={`segmented__item ${pane.view === 'source' ? 'is-active' : ''}`}
          onClick={() => setPaneView(paneKey, 'source')}
          role="tab"
          aria-selected={pane.view === 'source'}
          title="源码显示"
        >
          源码
        </button>
      </div>
      <button
        className="icon-btn dual-pane__tool"
        title="在此窗格打开文件"
        onClick={() => void openFileDialog(paneKey)}
      >
        <FolderOpen size={14} />
      </button>
      <button
        className="icon-btn dual-pane__tool"
        title="保存此窗格"
        disabled={!tab}
        onClick={() => {
          if (tab) void saveTab(tab.id);
        }}
      >
        <Save size={14} />
      </button>
    </div>
  );
}

function DualPane({
  paneKey,
  pane,
  tab,
  active,
  dark,
}: {
  paneKey: PaneKey;
  pane: PaneState;
  tab: TabState | null;
  active: boolean;
  dark: boolean;
}) {
  const updateTabContent = useAppStore((s) => s.updateTabContent);
  const setActivePane = useAppStore((s) => s.setActivePane);

  return (
    <section
      className={`dual-pane ${active ? 'is-active' : ''}`}
      onPointerDown={() => setActivePane(paneKey)}
    >
      <PaneHeader paneKey={paneKey} pane={pane} tab={tab} active={active} />
      <div className="dual-pane__body">
        {!tab ? (
          <div className="dual-pane__empty">
            <Sparkles size={18} />
            <strong>这个窗格还没有文档</strong>
            <span>在标签栏点选文档，或从上方选择/打开文件。</span>
          </div>
        ) : pane.view === 'seamless' ? (
          <PaneSeamlessEditor
            key={`${tab.id}-seamless`}
            tabId={tab.id}
            slot={paneKey === 'a' ? 'paneA' : 'paneB'}
            content={tab.content}
            docPath={tab.path}
            active={active}
            onChange={(markdown) => updateTabContent(tab.id, markdown)}
            onFocus={() => setActivePane(paneKey)}
          />
        ) : (
          <PaneSourceEditor
            key={`${tab.id}-source`}
            tabId={tab.id}
            slot={paneKey === 'a' ? 'paneA' : 'paneB'}
            content={tab.content}
            dark={dark}
            active={active}
            onChange={(markdown) => updateTabContent(tab.id, markdown)}
            onFocus={() => setActivePane(paneKey)}
          />
        )}
      </div>
    </section>
  );
}

export default function DualWorkspace() {
  const tabs = useAppStore((s) => s.tabs);
  const paneA = useAppStore((s) => s.paneA);
  const paneB = useAppStore((s) => s.paneB);
  const activePane = useAppStore((s) => s.activePane);
  const splitLayout = useAppStore((s) => s.splitLayout);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const theme = useResolvedTheme();
  const stageRef = useRef<HTMLDivElement>(null);

  const tabA = tabFor(tabs, paneA);
  const tabB = tabFor(tabs, paneB);

  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const move = (pointer: globalThis.PointerEvent) => {
      const ratio =
        splitLayout === 'columns'
          ? ((pointer.clientX - rect.left) / rect.width) * 100
          : ((pointer.clientY - rect.top) / rect.height) * 100;
      setSplitRatio(ratio);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <div
      ref={stageRef}
      className={`dual-stage is-${splitLayout}`}
      style={
        splitLayout === 'columns'
          ? { gridTemplateColumns: `minmax(0, ${splitRatio}%) 6px minmax(0, 1fr)` }
          : { gridTemplateRows: `minmax(0, ${splitRatio}%) 6px minmax(0, 1fr)` }
      }
    >
      <DualPane
        paneKey="a"
        pane={paneA}
        tab={tabA}
        active={activePane === 'a'}
        dark={theme === 'dark'}
      />
      <div
        className={`dual-splitter is-${splitLayout}`}
        onPointerDown={startResize}
        title="拖动调整比例"
      >
        <span />
      </div>
      <DualPane
        paneKey="b"
        pane={paneB}
        tab={tabB}
        active={activePane === 'b'}
        dark={theme === 'dark'}
      />
    </div>
  );
}
