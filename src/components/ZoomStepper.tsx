import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { ZoomKey } from '../types';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, setZoom, stepZoom, usePaneZoom } from '../editor/zoom';

/** Compact zoom readout for one pane header. */
export default function ZoomStepper({ pane }: { pane: ZoomKey }) {
  const { zoom } = usePaneZoom(pane);

  const act = (run: () => void) => {
    // Touching a pane's own control makes it the focused one for the status bar.
    useAppStore.getState().setZoomTarget(pane);
    run();
  };

  return (
    <div className="zoom-stepper">
      <button
        type="button"
        className="zoom-stepper__btn"
        title="缩小本窗格 10%"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => act(() => stepZoom(pane, -ZOOM_STEP))}
      >
        <Minus size={11} />
      </button>
      <button
        type="button"
        className="zoom-stepper__value"
        title="本窗格恢复 100%（Ctrl + 滚轮缩放指针所在的窗格）"
        onClick={() => act(() => setZoom(pane, ZOOM_DEFAULT))}
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="zoom-stepper__btn"
        title="放大本窗格 10%"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => act(() => stepZoom(pane, ZOOM_STEP))}
      >
        <Plus size={11} />
      </button>
    </div>
  );
}
