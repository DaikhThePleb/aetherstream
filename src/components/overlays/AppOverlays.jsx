import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Eye, EyeOff, Loader2, Power, RefreshCw, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { APP_LANGUAGE_OPTIONS, AZURE_REGIONS } from '../../i18n/translations'
import { openExternalUrl } from '../../services/tauriApi'

const pickRandomCaptionIndex = (size, previousIndex) => {
  if (size <= 1) return 0

  let nextIndex = Math.floor(Math.random() * size)
  if (nextIndex === previousIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (size - 1))) % size
  }

  return nextIndex
}

export function LoaderOverlay({
  show,
  t,
  statusText = '',
  captions = [],
  error = null,
  onExit,
  isExiting = false,
}) {
  const safeCaptions = useMemo(
    () => (Array.isArray(captions)
      ? captions.map((caption) => String(caption || '').trim()).filter(Boolean)
      : []),
    [captions],
  )
  const [activeCaption, setActiveCaption] = useState('')
  const [captionTick, setCaptionTick] = useState(0)

  useEffect(() => {
    if (!show || error) return undefined

    if (!safeCaptions.length) {
      // safe to set empty caption when there are no captions
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveCaption('')
      return undefined
    }

    let previousIndex = -1
    const rotateCaption = () => {
      const nextIndex = pickRandomCaptionIndex(safeCaptions.length, previousIndex)
      previousIndex = nextIndex
      setActiveCaption(safeCaptions[nextIndex])
      setCaptionTick((current) => current + 1)
    }

    rotateCaption()
    const intervalId = window.setInterval(rotateCaption, 2400)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [error, safeCaptions, show])

  if (!show) return null

  const title = error
    ? t?.('loader_error_title', 'Initialization failed')
    : t?.('loader_title', 'Loading AetherStream')
  const resolvedStatus = String(statusText || t?.('loader_status_default', 'Initializing modules...')).trim()
  const errorSource = String(error?.source || '').toLowerCase() === 'backend' ? 'backend' : 'frontend'
  const errorSourceLabel = errorSource === 'backend'
    ? t?.('loader_error_source_backend', 'Backend')
    : t?.('loader_error_source_frontend', 'Frontend')
  const errorCode = String(error?.code || 'APP_BOOT_UNKNOWN').trim()
  const rawErrorMessage = String(error?.message || '').trim()
  const translatedErrorMessage = errorCode ? t?.(errorCode, '') : ''
  const errorMessage = String(
    rawErrorMessage && rawErrorMessage !== errorCode
      ? rawErrorMessage
      : (translatedErrorMessage || rawErrorMessage || t?.('loader_error_description', 'The app could not finish loading.')),
  ).trim()

  return (
    <div id="app-loader" className="overlay-mask modal-active loader-screen" role="status" aria-live="polite">
      <div className={`modal-card loader-modal ${error ? 'loader-modal-error' : ''}`}>
        <div className="loader-header">
          <div className={`loader-logo-wrap ${error ? 'is-error' : ''}`}>
            {error ? (
              <AlertTriangle className="loader-logo loader-logo-error" />
            ) : (
              <img
                src="/assets/icon.ico"
                alt="AetherStream"
                className="loader-logo"
              />
            )}
          </div>
          <div className="loader-header-text">
            <p className="loader-kicker text-brand-gradient">AETHERSTREAM</p>
            <h2 className="loader-title">{title}</h2>
          </div>
        </div>

        {!error ? (
          <>
            <p className="loader-status-line">
              <Loader2 className="loader-inline-spinner" />
              <span>{resolvedStatus}</span>
            </p>

            <div className="loader-progress-track" aria-hidden="true">
              <span className="loader-progress-bar" />
            </div>

            <p key={captionTick} className="loader-caption-line">
              {activeCaption || t?.('loader_caption_default', 'Preparing control panel modules...')}
            </p>

            <div className="loader-skeleton-stack" aria-hidden="true">
              <div className="loader-skeleton-row row-long" />
              <div className="loader-skeleton-row row-mid" />
              <div className="loader-skeleton-row row-short" />
              <div className="loader-skeleton-row row-mid" />
            </div>
          </>
        ) : (
          <>
            <p className="loader-error-source">
              <span>{t?.('loader_error_source_label', 'Source')}:</span> {errorSourceLabel}
            </p>
            <div className="loader-error-code">{errorCode}</div>
            <p className="loader-error-message">{errorMessage}</p>
            <button
              type="button"
              className="btn-shine loader-exit-btn"
              onClick={onExit}
              disabled={isExiting}
            >
              {isExiting ? <Loader2 className="loader-exit-icon loader-icon-spin" /> : <Power className="loader-exit-icon" />}
              <span>{isExiting ? t?.('processing', 'Processing...') : t?.('loader_exit_button', 'Exit application')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function SetupOverlays({
  t,
  showLanguageSetup = false,
  showAzureSetup = false,
  setupKey = '',
  setupRegion = 'westeurope',
  setupError = '',
  isSubmitting = false,
  onSetupKeyChange,
  onSetupRegionChange,
  onSubmitSetup,
}) {
  const [showSetupKey, setShowSetupKey] = useState(false)

  useEffect(() => {
    if (showAzureSetup) return
    // intentionally reset visibility when azure setup is hidden
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSetupKey(false)
  }, [showAzureSetup])

  return (
    <>
      <div id="language-setup" className={`overlay-mask ${showLanguageSetup ? 'modal-active' : 'hidden-overlay'}`}>
        <div className="max-w-md w-full p-10 card border-2 shadow-2xl text-center backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <img src="/assets/logo.png" alt="Logo" className="w-16 h-16 object-contain opacity-80" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{t('app_lang')}</h2>
          <p className="text-gray-400 mb-8 text-sm">{t('lang_help')}</p>
          <div className="text-left mb-8">
            <select id="initial_lang_select" defaultValue="en">
              {APP_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full py-4 uppercase tracking-wider shadow-lg shadow-sky-500/20">
            {t('validate_btn')}
          </button>
        </div>
      </div>

      <div id="first-setup" className={`overlay-mask ${showAzureSetup ? 'modal-active' : 'hidden-overlay'}`}>
        <div className="max-w-md w-full p-8 card border-2 shadow-2xl text-center backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-white mb-2">{t('setup_title')}</h2>
          <p className="mb-6 text-sm opacity-70">{t('setup_desc')}</p>
          <div className="text-left space-y-4">
            <div>
              <label className="label-text">{t('azure_key')}</label>
              <div className="relative">
                <input
                  type={showSetupKey ? 'text' : 'password'}
                  id="setup_key"
                  placeholder={t('key_ph')}
                  value={setupKey}
                  onChange={(event) => onSetupKeyChange?.(event.currentTarget.value)}
                  className="input-icon-space"
                />
                <button
                  type="button"
                  onClick={() => setShowSetupKey((previous) => !previous)}
                  className="input-aux-btn absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors"
                  title={t('btn_show')}
                >
                  {showSetupKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label-text">{t('region')}</label>
              <select
                id="setup_region"
                value={setupRegion}
                onChange={(event) => onSetupRegionChange?.(event.currentTarget.value)}
              >
                {AZURE_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>{region.label}</option>
                ))}
              </select>
            </div>
          </div>
          {!!setupError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs py-3 px-4 rounded-lg text-left mt-4">
              <span className="font-bold">{t('error')}:</span> {setupError}
            </div>
          )}
          <button
            id="setup_btn"
            onClick={onSubmitSetup}
            disabled={isSubmitting}
            className="btn-primary w-full py-4 rounded-xl mt-6 text-white uppercase tracking-wider shadow-lg shadow-sky-500/20 disabled:opacity-70"
          >
            {isSubmitting ? t('processing') : t('validate_btn')}
          </button>
        </div>
      </div>

    </>
  )
}

export function UtilityOverlays({
  showTtsOverlay,
  securityModal,
  onCancelSecurity,
  onConfirmSecurity,
  t,
}) {
  const showSecurity = Boolean(securityModal?.open)
  const isCountdownActive = Number(securityModal?.countdown || 0) > 0
  const confirmBaseLabel = String(
    securityModal?.confirmLabel
      || (securityModal?.action === 'reset'
        ? t('btn_delete')
        : t('btn_show')),
  ).toLocaleUpperCase()

  const cancelLabel = String(t('btn_cancel')).toLocaleUpperCase()

  const confirmLabel = isCountdownActive
    ? `${confirmBaseLabel} (${securityModal.countdown})`
    : confirmBaseLabel

  return (
    <>
      <div id="tts-overlay" className={`overlay-mask ${showTtsOverlay ? 'modal-active' : 'hidden-overlay'}`}>
        <div className="modal-card p-8 rounded-2xl text-center shadow-2xl">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-sky-400 mx-auto mb-4" />
          <h3 className="font-bold">{t('processing')}</h3>
        </div>
      </div>

      <div id="security-overlay" className={`overlay-mask ${showSecurity ? 'modal-active' : 'hidden-overlay'}`}>
        <div className="modal-card p-8 rounded-2xl text-center shadow-2xl max-w-md w-full">
          <div className="mx-auto bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
          </div>
          <h3 className="font-bold text-xl mb-2">{t('warning_title')}</h3>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">{securityModal?.text || ''}</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onCancelSecurity}
              className="btn-shine py-3 rounded-lg font-bold uppercase tracking-wider bg-[#333] hover:bg-[#444] text-white transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              id="btn-confirm-action"
              type="button"
              onClick={onConfirmSecurity}
              disabled={isCountdownActive}
              className="btn-shine py-3 rounded-lg font-bold uppercase tracking-wider bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function UpdateModal({
  open,
  loading,
  hasUpdate,
  currentVersion,
  latestVersion,
  changelog,
  error,
  onClose,
  onConfirmUpdate,
  onRefresh,
  t,
}) {
  if (!open) return null

  const safeCurrentVersion = String(currentVersion || '').trim() || '0.0.0'
  const safeLatestVersion = String(latestVersion || '').trim() || '-'
  const normalizedChangelog = String(changelog || '').trim()
  const resolvedChangelog = normalizedChangelog || t('update_modal_empty_changelog', 'No changelog was provided for this release.')
  const hasError = Boolean(String(error || '').trim())
  const summaryText = hasError
    ? t('update_modal_error_state', 'Update check failed.')
    : hasUpdate
      ? t('update_modal_available', 'A new update is available.')
      : t('update_modal_uptodate', 'You are already on the latest version.')
  const summaryColor = hasError
    ? '#f87171'
    : hasUpdate
      ? '#4ade80'
      : 'var(--text-main)'

  const handleOpenMarkdownLink = async (event, href) => {
    event.preventDefault()

    const safeHref = String(href || '').trim()
    if (!/^https?:\/\//i.test(safeHref)) {
      return
    }

    const result = await openExternalUrl(safeHref)
    if (!result?.success) {
      window.open(safeHref, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="fixed inset-0 overlay-mask modal-active p-4">
      <div className="modal-card w-full max-w-2xl p-8 rounded-2xl shadow-2xl text-left flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
          <h3 className="font-bold text-xl text-white">{t('update_modal_title', 'Update check')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="editor-close-btn cursor-pointer hover:text-red-500 transition-colors"
            aria-label={t('tooltip_close')}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p className="text-sm opacity-80">{t('processing')}</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold mb-2" style={{ color: summaryColor }}>
                  {summaryText}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="label-text text-[10px] opacity-70 mb-1 uppercase font-bold">
                      {t('update_modal_current_version', 'Current version')}
                    </div>
                    <div className="font-mono text-sm">{safeCurrentVersion}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="label-text text-[10px] opacity-70 mb-1 uppercase font-bold">
                      {t('update_modal_latest_version', 'Latest release')}
                    </div>
                    <div className="font-mono text-sm">{safeLatestVersion}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="label-text text-[10px] opacity-70 mb-2 uppercase font-bold">
                  {t('update_modal_changelog', 'Changelog')}
                </div>
                <div className="update-modal-markdown text-xs opacity-90">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href || '#'}
                          onClick={(event) => {
                            void handleOpenMarkdownLink(event, href)
                          }}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {resolvedChangelog}
                  </ReactMarkdown>
                </div>
              </div>

              {!!error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-xs py-3 px-4 rounded-lg">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="btn-shine py-3 rounded-xl font-bold bg-[#333] hover:bg-[#444] text-white transition-colors uppercase tracking-wider"
          >
            {hasUpdate
              ? t('update_modal_btn_later', 'Later')
              : t('update_modal_btn_close', 'Close')}
          </button>
          <button
            type="button"
            onClick={hasUpdate ? onConfirmUpdate : onRefresh}
            disabled={loading}
            className="btn-primary py-3 rounded-xl font-bold text-white shadow-lg shadow-sky-500/20 uppercase tracking-wider disabled:opacity-70 inline-flex items-center justify-center gap-2"
          >
            {hasUpdate ? <Download className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            <span>
              {hasUpdate
                ? t('update_modal_btn_update', 'Update now')
                : t('auto_update_action', 'Check for updates')}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
