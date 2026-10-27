import { Github, X } from 'lucide-react';
import { DEFAULT_SETTINGS, useAppStore } from '../store/useAppStore';
import { backend, isDesktop } from '../services/backend';
import { APP_VERSION } from '../version';
import { THEMES } from '../theme';
import type { EditorMode, ThemePref } from '../types';

const AUTOSAVE_DELAYS = [
  { value: 800, label: '0.8 秒（即时）' },
  { value: 10000, label: '10 秒' },
  { value: 30000, label: '30 秒' },
  { value: 60000, label: '1 分钟' },
  { value: 120000, label: '2 分钟' },
  { value: 300000, label: '5 分钟' },
] as const;

const GITHUB_URL = 'https://github.com/cdwbb/mdot';

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row__main">
        <div className="setting-row__label">{label}</div>
        {desc && <div className="setting-row__desc">{desc}</div>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`switch ${on ? 'is-on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

export default function SettingsDialog() {
  const settings = useAppStore((s) => s.settings);
  const patch = useAppStore((s) => s.patchSettings);
  const close = () => useAppStore.getState().setSettingsOpen(false);

  const setTheme = (theme: ThemePref) => patch({ theme });

  const reset = () => {
    patch({ ...DEFAULT_SETTINGS, lastWorkspace: settings.lastWorkspace });
    useAppStore.getState().setMode(DEFAULT_SETTINGS.defaultMode);
    useAppStore.getState().toast('设置已恢复默认', 'success');
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="设置">
        <div className="dialog__head">
          <h2 className="dialog__title">设置</h2>
          <span className="dialog__subtitle">偏好会自动保存</span>
          <button className="icon-btn" onClick={close} aria-label="关闭设置">
            <X size={15} />
          </button>
        </div>

        <div className="dialog__body">
          <div className="setting-group">
            <div className="setting-group__title">外观</div>
            <Row label="主题" desc="六套纸张与夜色配色，跟随系统自动切换。">
              <div className="theme-preview" role="radiogroup" aria-label="主题">
                {THEMES.map((item) => (
                  <div className="theme-choice" key={item.value}>
                    <button
                      className={`theme-swatch theme-swatch--${item.value} ${
                        settings.theme === item.value ? 'is-active' : ''
                      }`}
                      onClick={() => setTheme(item.value)}
                      role="radio"
                      aria-checked={settings.theme === item.value}
                      title={item.label}
                    />
                    <span className="theme-choice__label">{item.label}</span>
                  </div>
                ))}
              </div>
            </Row>
            <Row label="正文字体" desc="正文与预览共用；代码块始终使用等宽字体。">
              <select
                className="field"
                value={settings.fontFamily}
                onChange={(event) =>
                  patch({ fontFamily: event.target.value as typeof settings.fontFamily })
                }
              >
                <option value="sans">系统无衬线（推荐）</option>
                <option value="serif">衬线（长文阅读）</option>
                <option value="mono">等宽</option>
              </select>
            </Row>
            <Row label="字号" desc={`${settings.fontSize.toFixed(1)} px`}>
              <input
                className="range"
                type="range"
                min={13}
                max={22}
                step={0.5}
                value={settings.fontSize}
                onChange={(event) => patch({ fontSize: Number(event.target.value) })}
                aria-label="正文字号"
              />
            </Row>
            <Row label="版心宽度" desc={`${settings.contentWidth} px · 约 ${Math.round(settings.contentWidth / 8.6)} 个汉字`}>
              <input
                className="range"
                type="range"
                min={560}
                max={980}
                step={20}
                value={settings.contentWidth}
                onChange={(event) => patch({ contentWidth: Number(event.target.value) })}
                aria-label="版心宽度"
              />
            </Row>
            <Row label="显示最近文件" desc="在侧栏和欢迎页列出最近打开的文档（最多 12 条）。关闭后这两处不再显示最近文件。">
              <Switch
                on={settings.showRecent}
                onChange={(value) => {
                  patch({ showRecent: value });
                  useAppStore
                    .getState()
                    .toast(value ? '已显示最近文件' : '已隐藏最近文件');
                }}
                label="显示最近文件"
              />
            </Row>
          </div>

          <div className="setting-group">
            <div className="setting-group__title">编辑</div>
            <Row label="默认模式" desc="没有可恢复的会话时，打开文档使用的编辑形态。">
              <div className="segmented">
                {(
                  [
                    ['seamless', '无缝'],
                    ['split', '双栏'],
                    ['dual', '双文档'],
                  ] as Array<[EditorMode, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`segmented__item ${settings.defaultMode === value ? 'is-active' : ''}`}
                    onClick={() => {
                      patch({ defaultMode: value });
                      useAppStore.getState().setMode(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="记住打开的文档" desc="下次启动恢复标签页、窗格与阅读位置。关闭后会清除已保存的会话，只保留设置和最近文件。">
              <Switch
                on={settings.rememberSession}
                onChange={(value) => {
                  patch({ rememberSession: value });
                  useAppStore
                    .getState()
                    .toast(value ? '已开启会话恢复' : '已关闭会话恢复，不再保存打开的文档');
                }}
                label="记住打开的文档"
              />
            </Row>
            <Row label="自动保存" desc="停止输入后按所选间隔写盘；关闭后需按 Ctrl/Cmd + S。">
              <Switch
                on={settings.autoSave}
                onChange={(value) => patch({ autoSave: value })}
                label="自动保存"
              />
            </Row>
            <Row
              label="自动保存间隔"
              desc="失焦或隐藏窗口时仍会立即保存，避免丢稿。"
            >
              <select
                className="field"
                value={settings.autoSaveDelay}
                disabled={!settings.autoSave}
                onChange={(event) =>
                  patch({ autoSaveDelay: Number(event.target.value) })
                }
                aria-label="自动保存间隔"
              >
                {AUTOSAVE_DELAYS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="双栏同步滚动" desc="按标题锚点对齐源码与预览；手动滚动时短暂让出控制权。">
              <Switch
                on={settings.syncScroll}
                onChange={(value) => patch({ syncScroll: value })}
                label="同步滚动"
              />
            </Row>
            <Row label="打字机模式" desc="让光标所在行保持垂直居中，源码与无缝编辑器均生效。">
              <Switch
                on={settings.typewriter}
                onChange={(value) => patch({ typewriter: value })}
                label="打字机模式"
              />
            </Row>
            <Row label="拼写检查" desc="使用系统字典标记疑似拼写错误；中文文档建议关闭。">
              <Switch
                on={settings.spellcheck}
                onChange={(value) => patch({ spellcheck: value })}
                label="拼写检查"
              />
            </Row>
          </div>

          <div className="setting-group">
            <div className="setting-group__title">关于</div>
            <Row label="mdot" desc={isDesktop ? '桌面版 · Tauri 2 + 系统 WebView' : '浏览器预览版 · 文件仅在本地处理'}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>v{APP_VERSION}</span>
              <button
                className="icon-btn"
                aria-label="在浏览器中打开 GitHub 项目主页"
                title="GitHub 项目主页"
                onClick={() => void backend.openExternal(GITHUB_URL)}
              >
                <Github size={14} />
              </button>
            </Row>
            <Row
              label="数据与隐私"
              desc="纯本地读写：没有账号、没有遥测。文件写入由 Rust 侧原子完成。"
            >
              <button className="btn btn--outline btn--sm" onClick={reset}>
                恢复默认
              </button>
            </Row>
          </div>
        </div>

        <div className="dialog__foot">
          <span className="dialog__note">
            快捷键：Ctrl/Cmd + K 命令面板 · Ctrl/Cmd + / 切换模式
          </span>
          <span className="spacer" />
          <button className="btn btn--primary" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
