import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { keepLocalVersion, reloadFromDisk } from '../app/actions';

export default function ConflictBanner() {
  const conflict = useAppStore((s) => s.conflict);
  if (!conflict) return null;
  const name = conflict.path.split(/[\\/]/).pop();

  return (
    <div className="banner" role="alert">
      <AlertTriangle size={14} className="banner__icon" />
      <span className="banner__text">
        <strong>{name}</strong> 已在外部被修改，而本地还有未保存的内容。
      </span>
      <div className="banner__actions">
        <button className="btn btn--sm btn--outline" onClick={() => void reloadFromDisk()}>
          载入磁盘版本
        </button>
        <button className="btn btn--sm btn--primary" onClick={() => void keepLocalVersion()}>
          保留本地并覆盖
        </button>
      </div>
    </div>
  );
}
