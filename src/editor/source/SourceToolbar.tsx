import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import {
  Bold,
  Braces,
  ChevronDown,
  Code2,
  Eraser,
  FileCode2,
  Heading2,
  Highlighter,
  Image,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListPlus,
  Minus,
  MoreHorizontal,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  Search,
  Sigma,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  adjustHeading,
  clearFormatting,
  insertCodeFence,
  insertFrontMatter,
  insertHtmlBlock,
  insertImage,
  insertLink,
  insertMathBlock,
  insertRule,
  insertTable,
  makeLooseList,
  openFind,
  setHeading,
  setParagraph,
  toggleBulletList,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  wrapInline,
} from './commands';

interface Props {
  viewRef: RefObject<EditorView | null>;
  label?: string;
  trailing?: ReactNode;
}

type MenuKey = 'heading' | 'list' | 'insert' | 'more';

interface MenuState {
  key: MenuKey;
  left: number;
  top: number;
}

function MenuItem({
  icon: Icon,
  label,
  keys,
  onClick,
}: {
  icon?: typeof Bold;
  label: string;
  keys?: string;
  onClick: () => void;
}) {
  return (
    <button className="source-menu__item" role="menuitem" onClick={onClick}>
      {Icon && <Icon size={13} />}
      <span>{label}</span>
      {keys && <kbd>{keys}</kbd>}
    </button>
  );
}

export default function SourceToolbar({ viewRef, label, trailing }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  const openMenu = (key: MenuKey, button: HTMLButtonElement) => {
    if (menu?.key === key) {
      setMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = 196;
    const pane = rootRef.current
      ?.closest('.dual-pane, .split__pane')
      ?.getBoundingClientRect();
    const maxLeft = (pane?.right ?? window.innerWidth) - width - 8;
    setMenu({
      key,
      left: Math.max(8, Math.min(rect.left, maxLeft)),
      top: rect.bottom + 5,
    });
  };

  const withView = (fn: (view: EditorView) => void) => {
    const view = viewRef.current;
    if (!view) return;
    setMenu(null);
    fn(view);
    view.focus();
  };

  const action = (fn: (view: EditorView) => void) => () => withView(fn);

  const menuButton = (key: MenuKey, title: string, children: ReactNode) => (
    <div className="source-toolbar__menu-wrap">
      <button
        className={`icon-btn ${menu?.key === key ? 'is-active' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={menu?.key === key}
        onClick={(event) => openMenu(key, event.currentTarget)}
      >
        {children}
        <ChevronDown size={8} className="source-toolbar__chevron" />
      </button>
      {menu?.key === key && (
        <div
          className="source-menu"
          style={{ left: menu.left, top: menu.top }}
        >
          {menuItems[key]}
        </div>
      )}
    </div>
  );

  const menuItems: Record<MenuKey, ReactNode> = {
    heading: (
      <>
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <MenuItem
            key={level}
            label={`标题 ${level}`}
            keys={`Ctrl+${level}`}
            onClick={action((view) => setHeading(view, level))}
          />
        ))}
        <div className="source-menu__sep" />
        <MenuItem label="提升标题级别" keys="Ctrl++" onClick={action((view) => adjustHeading(view, 1))} />
        <MenuItem label="降低标题级别" keys="Ctrl+-" onClick={action((view) => adjustHeading(view, -1))} />
        <ItemSeparator />
        <MenuItem icon={Pilcrow} label="段落" keys="Ctrl+Shift+0" onClick={action(setParagraph)} />
      </>
    ),
    list: (
      <>
        <MenuItem icon={List} label="无序列表" keys="Ctrl+H" onClick={action(toggleBulletList)} />
        <MenuItem icon={ListOrdered} label="有序列表" keys="Ctrl+G" onClick={action(toggleOrderedList)} />
        <MenuItem icon={ListChecks} label="任务列表" keys="Alt+Ctrl+X" onClick={action(toggleTaskList)} />
        <ItemSeparator />
        <MenuItem icon={ListPlus} label="宽松列表项" keys="Alt+Ctrl+L" onClick={action(makeLooseList)} />
      </>
    ),
    insert: (
      <>
        <MenuItem icon={Table2} label="表格" keys="Ctrl+Shift+T" onClick={action(insertTable)} />
        <MenuItem icon={FileCode2} label="代码围栏" keys="Ctrl+Shift+K" onClick={action(insertCodeFence)} />
        <MenuItem icon={Quote} label="引用块" keys="Ctrl+Shift+Q" onClick={action(toggleQuote)} />
        <MenuItem icon={Sigma} label="数学块" keys="Alt+Ctrl+N" onClick={action(insertMathBlock)} />
        <MenuItem icon={Braces} label="HTML 块" keys="Alt+Ctrl+H" onClick={action(insertHtmlBlock)} />
        <ItemSeparator />
        <MenuItem icon={Minus} label="水平分割线" keys="Ctrl+Shift+U" onClick={action(insertRule)} />
        <MenuItem icon={FileCode2} label="前置元数据" keys="Alt+Ctrl+Y" onClick={action(insertFrontMatter)} />
      </>
    ),
    more: (
      <>
        <MenuItem icon={Superscript} label="上标" onClick={action((view) => wrapInline(view, '<sup>', '</sup>'))} />
        <MenuItem icon={Subscript} label="下标" onClick={action((view) => wrapInline(view, '<sub>', '</sub>'))} />
        <ItemSeparator />
        <MenuItem icon={Eraser} label="清除格式" keys="Ctrl+Shift+R" onClick={action(clearFormatting)} />
      </>
    ),
  };

  return (
    <div className="format-bar source-toolbar" role="toolbar" aria-label="源码格式化" ref={rootRef}>
      {label && <span className="format-bar__label">{label}</span>}
      <button className="icon-btn" title="撤销 (Ctrl+Z)" onClick={action(undo)}>
        <Undo2 size={14} />
      </button>
      <button className="icon-btn" title="重做 (Ctrl+Shift+Z)" onClick={action(redo)}>
        <Redo2 size={14} />
      </button>
      <span className="sep-v" />
      <button className="icon-btn" title="粗体 (Ctrl+B)" onClick={action((view) => wrapInline(view, '**'))}>
        <Bold size={14} />
      </button>
      <button className="icon-btn" title="斜体 (Ctrl+I)" onClick={action((view) => wrapInline(view, '*'))}>
        <Italic size={14} />
      </button>
      <button className="icon-btn" title="下划线 (Ctrl+U)" onClick={action((view) => wrapInline(view, '<u>', '</u>'))}>
        <Underline size={14} />
      </button>
      <button className="icon-btn" title="删除线 (Ctrl+D)" onClick={action((view) => wrapInline(view, '~~'))}>
        <Strikethrough size={14} />
      </button>
      {menuButton('heading', '标题与段落', <Heading2 size={14} />)}
      {menuButton('list', '列表', <List size={14} />)}
      <button className="icon-btn" title="引用块 (Ctrl+Shift+Q)" onClick={action(toggleQuote)}>
        <Quote size={14} />
      </button>
      <button className="icon-btn" title="代码围栏 (Ctrl+Shift+K)" onClick={action(insertCodeFence)}>
        <FileCode2 size={14} />
      </button>
      <button className="icon-btn" title="表格 (Ctrl+Shift+T)" onClick={action(insertTable)}>
        <Table2 size={14} />
      </button>
      <span className="sep-v" />
      <button className="icon-btn" title="行内代码 (Ctrl+`)" onClick={action((view) => wrapInline(view, '`', '`', 'code'))}>
        <Code2 size={14} />
      </button>
      <button className="icon-btn" title="行内数学 (Ctrl+Shift+M)" onClick={action((view) => wrapInline(view, '$'))}>
        <Sigma size={14} />
      </button>
      <button className="icon-btn" title="高亮 (Ctrl+Shift+H)" onClick={action((view) => wrapInline(view, '<mark>', '</mark>'))}>
        <Highlighter size={14} />
      </button>
      <button className="icon-btn" title="超链接 (Ctrl+L)" onClick={action(insertLink)}>
        <Link2 size={14} />
      </button>
      <button className="icon-btn" title="图片 (Ctrl+Shift+I)" onClick={action(insertImage)}>
        <Image size={14} />
      </button>
      {menuButton('insert', '插入块', <Plus size={14} />)}
      {menuButton('more', '更多格式', <MoreHorizontal size={14} />)}
      <span className="format-bar__spacer" />
      <button className="icon-btn" title="查找 (Ctrl+F)" onClick={action(openFind)}>
        <Search size={14} />
      </button>
      {trailing}
    </div>
  );
}

function ItemSeparator() {
  return <div className="source-menu__sep" />;
}
