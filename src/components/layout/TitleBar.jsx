import { Minus, Square, X } from 'lucide-react'

function WindowControlButton({ children, close = false, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className={`control-btn ${close ? 'close-btn' : ''}`}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function TitleBar({ onMinimize, onMaximize, onClose, t }) {
  return (
    <div className="custom-title-bar">
      <div className="drag-region" data-tauri-drag-region />
      <div className="window-controls">
        <WindowControlButton onClick={onMinimize} ariaLabel={t('tooltip_min')}>
          <Minus size={10} />
        </WindowControlButton>
        <WindowControlButton onClick={onMaximize} ariaLabel={t('tooltip_max')}>
          <Square size={10} />
        </WindowControlButton>
        <WindowControlButton close onClick={onClose} ariaLabel={t('tooltip_close')}>
          <X size={10} />
        </WindowControlButton>
      </div>
    </div>
  )
}
