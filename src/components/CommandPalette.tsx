import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useCommands } from '../app/commands';
import { formatShortcut } from '../services/platform';

export default function CommandPalette() {
  const commands = useCommands();
  const close = () => useAppStore.getState().setPaletteOpen(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return commands;
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.group} ${command.hint ?? ''}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('.palette__item.is-active');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, filtered.length]);

  const run = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    close();
    window.setTimeout(() => {
      void command.run();
    }, 10);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (filtered.length ? (index + 1) % filtered.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (filtered.length ? (index - 1 + filtered.length) % filtered.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="palette__search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索命令、标题或最近文件…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            aria-label="搜索命令"
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="palette__list" ref={listRef} role="listbox">
          {filtered.map((command, index) => {
            const Icon = command.icon;
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {header && <div className="palette__group">{header}</div>}
                <button
                  className={`palette__item ${index === active ? 'is-active' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(index)}
                  role="option"
                  aria-selected={index === active}
                >
                  <Icon size={14} />
                  <span className="palette__label">{command.label}</span>
                  {command.hint && <span className="palette__hint">{command.hint}</span>}
                  {command.keys && <kbd className="kbd">{formatShortcut(command.keys)}</kbd>}
                </button>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="palette__empty">
              没有匹配的命令
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)' }}>
                试试「双栏」「导出」「设置」
              </div>
            </div>
          )}
        </div>

        <div className="palette__foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> 选择
          </span>
          <span>
            <CornerDownLeft size={10} /> 执行
          </span>
          <span>
            <kbd className="kbd">esc</kbd> 关闭
          </span>
          <span style={{ marginLeft: 'auto' }}>{filtered.length} 项</span>
        </div>
      </div>
    </div>
  );
}
