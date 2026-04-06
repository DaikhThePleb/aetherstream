import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { exitApplication, isTauriRuntime } from './services/tauriApi'
import { translate } from './i18n/translations'

const resolveFallbackLanguage = () => {
  const candidates = [
    typeof document !== 'undefined' ? document.documentElement?.lang : '',
    typeof navigator !== 'undefined' ? navigator.language : '',
  ]

  const raw = candidates.find((value) => String(value || '').trim()) || 'en'
  const normalized = String(raw).trim().toLowerCase()

  if (normalized.startsWith('hu')) return 'hu'
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('fr')) return 'fr'
  return 'en'
}

const fallbackLang = resolveFallbackLanguage()
const tf = (key, fallback = '') => translate(fallbackLang, key, fallback)

const resolveErrorDetails = (errorLike, fallbackCode) => {
  if (!errorLike) {
    return {
      code: fallbackCode,
      message: tf('frontend_runtime_error', 'Unknown frontend startup error.'),
    }
  }

  if (typeof errorLike === 'string') {
    return {
      code: fallbackCode,
      message: errorLike,
    }
  }

  const code = String(errorLike.code || errorLike.name || fallbackCode || 'frontend_runtime_error').trim()
  const message = String(errorLike.message || errorLike.reason || errorLike || '').trim() || 'Unknown frontend startup error.'

  return {
    code,
    message,
  }
}

const buildBootErrorConsoleText = (code, message) => {
  const safeCode = String(code || '').replace(/\r?\n+/g, ' ').trim() || 'APP_BOOT_UNKNOWN'
  const safeMessage = String(message || '').replace(/\r?\n+/g, ' ').trim() || 'Unknown startup error.'

  return [
    '[bootstrap] failed {',
    `  code: '${safeCode}',`,
    `  message: '${safeMessage}'`,
    '}',
  ].join('\n')
}

const applyCopyButtonVisualState = (button, state) => {
  if (!button) return

  let icon = '⧉'
  let label = tf('loader_copy_button', 'Copy error')

  if (state === 'copying') {
    icon = '…'
    label = tf('processing', 'Processing...')
  } else if (state === 'copied') {
    icon = '✓'
    label = tf('loader_copy_success', 'Copied')
  } else if (state === 'failed') {
    icon = '!'
    label = tf('loader_copy_failed', 'Copy failed')
  }

  button.textContent = icon
  button.title = label
  button.setAttribute('aria-label', label)
}

const copyTextToClipboard = async (text) => {
  const payload = String(text || '').trim()
  if (!payload) {
    throw new Error('clipboard_copy_failed')
  }

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload)
      return
    } catch {
      // fallback below
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    throw new Error('clipboard_copy_failed')
  }

  const helper = document.createElement('textarea')
  helper.value = payload
  helper.setAttribute('readonly', '')
  helper.style.position = 'absolute'
  helper.style.left = '-9999px'
  document.body.appendChild(helper)
  helper.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(helper)

  if (!copied) {
    throw new Error('clipboard_copy_failed')
  }
}

const ensureBootLoaderElements = () => {
  if (typeof document === 'undefined') return null

  let bootLoader = document.getElementById('boot-loader')
  if (!bootLoader) {
    bootLoader = document.createElement('div')
    bootLoader.id = 'boot-loader'
    bootLoader.setAttribute('aria-label', 'Loading')
    bootLoader.innerHTML = [
      '<div class="boot-stack">',
      '  <div class="boot-spinner" aria-hidden="true"></div>',
      '  <div id="boot-text" class="boot-text"></div>',
      '  <div id="boot-error" class="boot-error" hidden>',
      '    <div id="boot-error-notice" class="boot-error-notice"></div>',
      '    <div class="boot-error-console-wrap">',
      '      <pre id="boot-error-console" class="boot-error-console"></pre>',
      '      <button id="boot-copy-btn" class="boot-copy-btn" type="button" aria-label="Copy error" title="Copy error"></button>',
      '    </div>',
      '    <button id="boot-exit-btn" class="boot-exit-btn" type="button"></button>',
      '  </div>',
      '</div>',
    ].join('')

    const root = document.getElementById('root')
    if (root?.parentNode) {
      root.parentNode.insertBefore(bootLoader, root)
    } else if (document.body) {
      document.body.prepend(bootLoader)
    }
  }

  return {
    bootLoader,
    textElement: document.getElementById('boot-text'),
    errorPanel: document.getElementById('boot-error'),
    errorNoticeElement: document.getElementById('boot-error-notice'),
    errorConsoleElement: document.getElementById('boot-error-console'),
    copyButton: document.getElementById('boot-copy-btn'),
    exitButton: document.getElementById('boot-exit-btn'),
  }
}

const showBootLoaderError = (errorLike, fallbackCode = 'frontend_runtime_error') => {
  const bootElements = ensureBootLoaderElements()
  if (!bootElements) return

  const {
    bootLoader,
    textElement,
    errorPanel,
    errorNoticeElement,
    errorConsoleElement,
    copyButton,
    exitButton,
  } = bootElements

  window.__stopBootCaptionRotation?.()
  const { code, message } = resolveErrorDetails(errorLike, fallbackCode)
  const translatedMessage = tf(code, '')
  const resolvedMessage = translatedMessage && translatedMessage !== code
    ? translatedMessage
    : message
  const noticeText = tf('loader_error_notice', 'The application encountered a startup error.')
  const consoleText = buildBootErrorConsoleText(code, resolvedMessage)

  bootLoader.classList.remove('boot-hidden')
  bootLoader.classList.add('boot-error')

  if (textElement) textElement.textContent = ''
  if (errorPanel) errorPanel.hidden = false
  if (errorNoticeElement) errorNoticeElement.textContent = noticeText
  if (errorConsoleElement) errorConsoleElement.textContent = consoleText

  if (copyButton) {
    copyButton.disabled = false
    applyCopyButtonVisualState(copyButton, 'idle')
    copyButton.dataset.copyPayload = encodeURIComponent(consoleText)

    if (!copyButton.dataset.boundCopy) {
      copyButton.dataset.boundCopy = '1'
      copyButton.addEventListener('click', async () => {
        if (copyButton.disabled) return

        copyButton.disabled = true
        applyCopyButtonVisualState(copyButton, 'copying')

        try {
          const encodedPayload = copyButton.dataset.copyPayload || ''
          const payload = encodedPayload ? decodeURIComponent(encodedPayload) : ''
          await copyTextToClipboard(payload)
          applyCopyButtonVisualState(copyButton, 'copied')
        } catch {
          applyCopyButtonVisualState(copyButton, 'failed')
        } finally {
          window.setTimeout(() => {
            copyButton.disabled = false
            applyCopyButtonVisualState(copyButton, 'idle')
          }, 1700)
        }
      })
    }
  }

  if (exitButton) {
    exitButton.disabled = false
    exitButton.textContent = tf('loader_exit_button', 'Exit application')
    if (!exitButton.dataset.boundExit) {
      exitButton.dataset.boundExit = '1'
      exitButton.addEventListener('click', async () => {
        if (exitButton.disabled) return

        exitButton.disabled = true
        exitButton.textContent = tf('processing', 'Processing...')
        try {
          const result = await exitApplication()
          if (result?.success) return

          if (!isTauriRuntime()) {
            window.close()
            return
          }
        } finally {
          exitButton.disabled = false
          exitButton.textContent = tf('loader_exit_button', 'Exit application')
        }
      })
    }
  }
}

window.addEventListener('error', (event) => {
  showBootLoaderError(event?.error || event?.message, 'frontend_runtime_error')
})

window.addEventListener('unhandledrejection', (event) => {
  showBootLoaderError(event?.reason, 'frontend_unhandled_rejection')
})

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (error) {
  showBootLoaderError(error, 'frontend_render_failed')
}
