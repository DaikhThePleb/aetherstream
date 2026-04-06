import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Save, X } from 'lucide-react'
import './aether-legacy.css'
import { createTranslator } from './i18n/translations'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { SetupOverlays, UpdateModal, UtilityOverlays } from './components/overlays/AppOverlays'
import { SectionRenderer } from './components/sections/Sections'
import { startTwitchBot, stopTwitchBot } from './services/twitchBot'
import {
  connectVts,
  disconnectVts,
  injectVtsMouth,
  setVtsAuthToken,
  subscribeVtsStatus,
} from './services/vtsClient'
import {
  clearTtsQueue,
  configureTtsQueue,
  enqueueTts,
  pauseTtsQueue,
  resumeTtsQueue,
  skipTtsQueue,
  subscribeTtsQueue,
} from './services/ttsQueue'
import {
  completeTwitchRedemption,
  createTwitchReward,
  deleteTwitchReward,
  ensureOverlayServer,
  exitApplication,
  exportPresetFile,
  fetchTwitchRewardRedemptions,
  fetchTwitchRewards,
  factoryReset,
  getAppVersion,
  getLatestGithubRelease,
  getConfig,
  fetchAzureVoices,
  validateAzureAndFetchVoices,
  overlayPushEvent,
  overlaySetEnabled,
  overlayUpdateConfig,
  listAudioOutputDevices,
  minimizeWindow,
  importPresetFile,
  onWindowCloseRequested,
  downloadAndRunInstaller,
  saveConfig,
  toggleMaximizeWindow,
  validateTwitchToken,
  twitchLogin,
  updateTwitchReward,
  isTauriRuntime,
} from './services/tauriApi'

const defaultAccent = {
  primary: '#00f2ff',
  secondary: '#a800ff',
}

const THEME_IDS = ['default', 'slate', 'ink', 'green', 'paper', 'warm', 'sage', 'glacier']
const THEME_CLASSES = THEME_IDS.filter((themeId) => themeId !== 'default')
  .map((themeId) => `theme-${themeId}`)

const DEFAULT_TEST_MESSAGES = {
  en: 'This is a TTS test message.',
  hu: 'Ez egy TTS teszt \u00fczenet.',
  de: 'Dies ist eine TTS-Testnachricht.',
  es: 'Mensaje de prueba de TTS.',
  fr: 'Message de test TTS.',
}

const DEFAULT_TWITCH_AVATAR = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png'
const TWITCH_CLIENT_ID = String(import.meta.env.VITE_TWITCH_CLIENT_ID || '').trim()
const GITHUB_REPO_OWNER = String(import.meta.env.VITE_GITHUB_REPO_OWNER || 'DaikhThePleb').trim()
const GITHUB_REPO_NAME = String(import.meta.env.VITE_GITHUB_REPO_NAME || 'aetherstream').trim()

const normalizeReleaseVersion = (value) => String(value || '').trim().replace(/^v/i, '')

const resolveBootErrorCode = (value, fallback) => {
  const code = String(value || '').trim()
  return code || fallback
}

const normalizeRuntimeBootErrorCode = (source, candidate, fallback) => {
  const code = resolveBootErrorCode(candidate, fallback)
  const normalized = code.toLowerCase()

  if (['referenceerror', 'typeerror', 'syntaxerror', 'rangeerror', 'error'].includes(normalized)) {
    return source === 'backend' ? 'backend_bootstrap_failed' : 'frontend_runtime_error'
  }

  return code
}

const normalizeBootError = (error) => {
  const fallback = {
    source: 'frontend',
    code: 'frontend_bootstrap_failed',
    message: '',
  }

  if (!error) return fallback

  if (typeof error === 'string') {
    return {
      ...fallback,
      message: error,
    }
  }

  if (typeof error !== 'object') {
    return {
      ...fallback,
      message: String(error),
    }
  }

  const source = String(error.source || '').toLowerCase() === 'backend' ? 'backend' : 'frontend'
  const fallbackCode = source === 'backend'
    ? 'backend_bootstrap_failed'
    : 'frontend_bootstrap_failed'
  const code = normalizeRuntimeBootErrorCode(
    source,
    error.code || error.error || error.name,
    fallbackCode,
  )
  const message = String(error.message || '').trim()

  return {
    source,
    code,
    message,
  }
}

const normalizeAppLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['en', 'hu', 'de', 'es', 'fr'].includes(normalized)) {
    return normalized
  }
  return 'en'
}

const consumeForcedBootErrorMode = () => {
  if (typeof window === 'undefined') return ''

  const normalizeMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'frontend' || normalized === 'backend') {
      return normalized
    }
    return ''
  }

  try {
    const cachedMode = normalizeMode(window.__aetherForcedBootErrorMode)
    const cachedRemaining = Number.parseInt(String(window.__aetherForcedBootErrorRemaining || 0), 10)

    if (cachedMode && Number.isFinite(cachedRemaining) && cachedRemaining > 0) {
      const nextRemaining = cachedRemaining - 1
      window.__aetherForcedBootErrorRemaining = nextRemaining
      if (nextRemaining <= 0) {
        window.__aetherForcedBootErrorMode = ''
      }

      return cachedMode
    }

    const rawMode = normalizeMode(window.localStorage.getItem('aether_force_boot_error'))
    if (rawMode) {
      window.localStorage.removeItem('aether_force_boot_error')

      // React StrictMode dev flow can trigger bootstrap twice on mount.
      // Keep the forced mode available for one extra consume in the same page load.
      window.__aetherForcedBootErrorMode = rawMode
      window.__aetherForcedBootErrorRemaining = 1

      return rawMode
    }
  } catch {
    // ignore storage access failures
  }

  return ''
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

const DEFAULT_HOTKEYS = {
  toggle_pause: 'Ctrl+Shift+P',
  skip: 'Ctrl+Shift+S',
  clear: 'Ctrl+Shift+C',
  test_tts: 'Ctrl+Shift+T',
}

const DEFAULT_OVERLAY_LAYOUT = {
  chat: { x: 6, y: 70, scale: 1 },
  status_tts: { x: 80, y: 6, scale: 1 },
  status_twitch: { x: 80, y: 12, scale: 1 },
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

const clampPercent = (value, fallback) => {
  const numericValue = Number.parseFloat(String(value))
  if (!Number.isFinite(numericValue)) return fallback
  return Math.max(0, Math.min(100, numericValue))
}

const clampScale = (value, fallback) => {
  const numericValue = Number.parseFloat(String(value))
  if (!Number.isFinite(numericValue)) return fallback
  return Math.max(0.5, Math.min(2, numericValue))
}

const roundNumber = (value, precision) => {
  const factor = Math.pow(10, precision)
  return Math.round(value * factor) / factor
}

const areClose = (left, right, epsilon) => Math.abs(left - right) <= epsilon

const overlayLayoutsEqual = (left, right) => {
  const normalizedLeft = normalizeOverlayLayout(left)
  const normalizedRight = normalizeOverlayLayout(right)

  return (
    areClose(normalizedLeft.chat.x, normalizedRight.chat.x, 0.01)
    && areClose(normalizedLeft.chat.y, normalizedRight.chat.y, 0.01)
    && areClose(normalizedLeft.chat.scale, normalizedRight.chat.scale, 0.01)
    && areClose(normalizedLeft.status_tts.x, normalizedRight.status_tts.x, 0.01)
    && areClose(normalizedLeft.status_tts.y, normalizedRight.status_tts.y, 0.01)
    && areClose(normalizedLeft.status_tts.scale, normalizedRight.status_tts.scale, 0.01)
    && areClose(normalizedLeft.status_twitch.x, normalizedRight.status_twitch.x, 0.01)
    && areClose(normalizedLeft.status_twitch.y, normalizedRight.status_twitch.y, 0.01)
    && areClose(normalizedLeft.status_twitch.scale, normalizedRight.status_twitch.scale, 0.01)
  )
}

const normalizeOverlayLayout = (layout) => {
  const rawLayout = layout && typeof layout === 'object' ? layout : {}
  const rawChat = rawLayout.chat && typeof rawLayout.chat === 'object' ? rawLayout.chat : {}
  const rawLegacyStatus = rawLayout.status && typeof rawLayout.status === 'object' ? rawLayout.status : {}
  const rawStatusTts = rawLayout.status_tts && typeof rawLayout.status_tts === 'object'
    ? rawLayout.status_tts
    : rawLegacyStatus
  const rawStatusTwitch = rawLayout.status_twitch && typeof rawLayout.status_twitch === 'object'
    ? rawLayout.status_twitch
    : rawLegacyStatus

  return {
    chat: {
      x: roundNumber(clampPercent(rawChat.x, DEFAULT_OVERLAY_LAYOUT.chat.x), 2),
      y: roundNumber(clampPercent(rawChat.y, DEFAULT_OVERLAY_LAYOUT.chat.y), 2),
      scale: roundNumber(clampScale(rawChat.scale, DEFAULT_OVERLAY_LAYOUT.chat.scale), 2),
    },
    status_tts: {
      x: roundNumber(clampPercent(rawStatusTts.x, DEFAULT_OVERLAY_LAYOUT.status_tts.x), 2),
      y: roundNumber(clampPercent(rawStatusTts.y, DEFAULT_OVERLAY_LAYOUT.status_tts.y), 2),
      scale: roundNumber(clampScale(rawStatusTts.scale, DEFAULT_OVERLAY_LAYOUT.status_tts.scale), 2),
    },
    status_twitch: {
      x: roundNumber(clampPercent(rawStatusTwitch.x, DEFAULT_OVERLAY_LAYOUT.status_twitch.x), 2),
      y: roundNumber(clampPercent(rawStatusTwitch.y, DEFAULT_OVERLAY_LAYOUT.status_twitch.y), 2),
      scale: roundNumber(clampScale(rawStatusTwitch.scale, DEFAULT_OVERLAY_LAYOUT.status_twitch.scale), 2),
    },
  }
}

const normalizeHotkeys = (hotkeys) => {
  const normalized = { ...DEFAULT_HOTKEYS }
  if (!hotkeys || typeof hotkeys !== 'object') {
    return normalized
  }

  Object.keys(DEFAULT_HOTKEYS).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(hotkeys, key)) {
      return
    }
    const value = hotkeys[key]
    normalized[key] = value === undefined || value === null
      ? ''
      : String(value).trim()
  })

  return normalized
}

const formatHotkeyKey = (key) => {
  if (!key) return ''
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1)
}

const getHotkeyStringFromEvent = (event) => {
  const key = event?.key
  if (!key || MODIFIER_KEYS.has(key)) return ''

  const parts = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(formatHotkeyKey(key))
  return parts.join('+')
}

const isEditableTarget = (target) => {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

const PRESET_EXCLUDED_KEYS = new Set([
  'reward_rules',
  'reward_rules_by_user',
  'twitch_oauth',
  'twitch_username',
  'twitch_user_id',
  'presets',
  'active_preset_id',
  'onboarding_complete',
])

const stripPresetPayload = (payload) => {
  const output = {}
  if (!payload || typeof payload !== 'object') return output

  Object.entries(payload).forEach(([key, value]) => {
    if (!key || PRESET_EXCLUDED_KEYS.has(key)) return
    output[key] = value
  })

  return output
}

const LOCALE_LABELS = {
  en: {
    'hu-HU': 'Hungarian (Hungary)',
    'en-US': 'English (United States)',
    'de-DE': 'German (Germany)',
    'es-ES': 'Spanish (Spain)',
    'fr-FR': 'French (France)',
  },
  hu: {
    'hu-HU': 'Magyar (Magyarorsz\u00e1g)',
    'en-US': 'Angol (Egyes\u00fclt \u00c1llamok)',
    'de-DE': 'N\u00e9met (N\u00e9metorsz\u00e1g)',
    'es-ES': 'Spanyol (Spanyolorsz\u00e1g)',
    'fr-FR': 'Francia (Franciaorsz\u00e1g)',
  },
  de: {
    'hu-HU': 'Ungarisch (Ungarn)',
    'en-US': 'Englisch (Vereinigte Staaten)',
    'de-DE': 'Deutsch (Deutschland)',
    'es-ES': 'Spanisch (Spanien)',
    'fr-FR': 'Franz\u00f6sisch (Frankreich)',
  },
  es: {
    'hu-HU': 'H\u00fangaro (Hungr\u00eda)',
    'en-US': 'Ingl\u00e9s (Estados Unidos)',
    'de-DE': 'Alem\u00e1n (Alemania)',
    'es-ES': 'Espa\u00f1ol (Espa\u00f1a)',
    'fr-FR': 'Franc\u00e9s (Francia)',
  },
  fr: {
    'hu-HU': 'Hongrois (Hongrie)',
    'en-US': 'Anglais (Etats-Unis)',
    'de-DE': 'Allemand (Allemagne)',
    'es-ES': 'Espagnol (Espagne)',
    'fr-FR': 'Fran\u00e7ais (France)',
  },
}

const capitalizeLabel = (label) => {
  const text = String(label || '').trim()
  if (!text) return ''
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

const VOICE_NAME_OVERRIDES = {
  'hu-HU-NoemiNeural': 'Noémi',
  'hu-HU-TamasNeural': 'Tamás',
}

const formatLocaleLabel = (locale, appLang) => {
  const normalizedLocale = String(locale || '').trim()
  if (!normalizedLocale) return ''

  const normalizedLang = String(appLang || 'en').toLowerCase()
  const localeMap = LOCALE_LABELS[normalizedLang] || LOCALE_LABELS.en
  if (localeMap?.[normalizedLocale]) {
    return capitalizeLabel(localeMap[normalizedLocale])
  }

  const [languageCode, regionCode] = normalizedLocale.split('-')
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      const languageName = new Intl.DisplayNames([normalizedLang], { type: 'language' })
        .of(languageCode)
      if (languageName) {
        if (regionCode) {
          const regionName = new Intl.DisplayNames([normalizedLang], { type: 'region' })
            .of(regionCode)
          if (regionName) {
            return capitalizeLabel(`${languageName} (${regionName})`)
          }
        }
        return capitalizeLabel(languageName)
      }
    }
  } catch {
    // no-op
  }

  return normalizedLocale
}

const formatVoiceLabel = (voice, t) => {
  if (!voice) return ''
  const overrideName = voice.ShortName ? VOICE_NAME_OVERRIDES[voice.ShortName] : ''
  const displayName = overrideName || voice.LocalName || voice.DisplayName || voice.ShortName || ''
  const genderValue = String(voice.Gender || '').toLowerCase()
  const genderLabel = genderValue === 'female'
    ? t('val_female')
    : genderValue === 'male'
      ? t('val_male')
      : voice.Gender || ''

  return genderLabel ? `${displayName} (${genderLabel})` : `${displayName}`
}

const stableStringify = (value) => {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const getDefaultTestMessage = (appLang, voiceName) => {
  const voiceLang = String(voiceName || '').split('-')[0]?.toLowerCase()
  if (voiceLang && DEFAULT_TEST_MESSAGES[voiceLang]) {
    return DEFAULT_TEST_MESSAGES[voiceLang]
  }

  const normalizedAppLang = String(appLang || '').toLowerCase()
  if (DEFAULT_TEST_MESSAGES[normalizedAppLang]) {
    return DEFAULT_TEST_MESSAGES[normalizedAppLang]
  }

  return DEFAULT_TEST_MESSAGES.en
}

const normalizeTheme = (themeValue) => {
  if (!themeValue || themeValue === 'default') return 'default'
  const normalized = String(themeValue).replace('theme-', '')
  return THEME_IDS.includes(normalized) ? normalized : 'default'
}

const normalizeRewardRulesByUser = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
)

const resolveRewardRulesForUser = (map, userId) => {
  if (!userId) return {}
  const entry = map?.[userId]
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {}
  return entry
}

const getInputValue = (id, fallback = '') => {
  const element = document.getElementById(id)
  if (!element) return fallback
  return element.value ?? fallback
}

const setInputValue = (id, value) => {
  const element = document.getElementById(id)
  if (!element || value === undefined || value === null) return
  element.value = String(value)
}

const syncRangeVisual = (id, value, min, max, badgeId, suffix = '') => {
  const input = document.getElementById(id)
  if (!input) return

  const safeValue = Number.parseFloat(String(value))
  if (Number.isFinite(safeValue)) {
    input.value = String(safeValue)
    const percent = ((safeValue - min) / (max - min)) * 100
    input.style.setProperty('--percent', `${Math.max(0, Math.min(100, percent))}%`)
  }

  if (!badgeId) return
  const badge = document.getElementById(badgeId)
  if (!badge) return

  const textValue = Number.isFinite(safeValue) ? String(safeValue) : String(input.value || '')
  badge.innerText = `${textValue}${suffix}`
}

const showMessageBox = (boxId, textId, message) => {
  const box = document.getElementById(boxId)
  if (!box) return

  if (textId) {
    const text = document.getElementById(textId)
    if (text) text.innerText = message
  }

  box.classList.remove('hidden')
}

const hideMessageBox = (boxId) => {
  const box = document.getElementById(boxId)
  if (!box) return
  box.classList.add('hidden')
}

const parseListFromTextarea = (rawText) => {
  const tokens = String(rawText || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .split(/[\s,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const seen = new Set()
  return tokens.filter((token) => {
    const normalized = token.toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

const LINK_PATTERN = /(https?:\/\/|www\.)\S+/i

const stripTwitchEmoteRanges = (text, emotes) => {
  if (!text || !emotes || typeof emotes !== 'object') return text

  const ranges = []

  Object.values(emotes).forEach((positionList) => {
    if (!Array.isArray(positionList)) return

    positionList.forEach((position) => {
      const [start, end] = String(position).split('-').map((value) => Number.parseInt(value, 10))
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        ranges.push({ start, end })
      }
    })
  })

  if (!ranges.length) return text

  const sortedRanges = [...ranges].sort((left, right) => right.start - left.start)
  let result = String(text)

  sortedRanges.forEach(({ start, end }) => {
    if (start < 0 || end >= result.length || start > end) return
    result = `${result.slice(0, start)} ${result.slice(end + 1)}`
  })

  return result.replace(/\s+/g, ' ').trim()
}

const trimRepeatedCharacters = (text, maxRepeat) => {
  const safeMax = Number.isFinite(maxRepeat)
    ? Math.max(1, Math.min(30, maxRepeat))
    : 4

  return String(text || '').replace(
    new RegExp(`(.)\\1{${safeMax},}`, 'g'),
    (_match, captured) => String(captured).repeat(safeMax),
  )
}

const containsBlockedWord = (text, blockedWords) => {
  if (!Array.isArray(blockedWords) || blockedWords.length === 0) {
    return false
  }

  const normalizedText = String(text || '').toLowerCase()
  if (!normalizedText) return false

  return blockedWords.some((rawWord) => {
    const normalizedWord = String(rawWord || '').trim().toLowerCase()
    if (!normalizedWord) return false
    return normalizedText.includes(normalizedWord)
  })
}

const canSpeakByPermissionLevel = (permissionLevel, badges) => {
  const normalizedPermission = String(permissionLevel || 'everyone').toLowerCase()
  const safeBadges = badges && typeof badges === 'object' ? badges : {}

  switch (normalizedPermission) {
    case 'mods':
      return Boolean(safeBadges.broadcaster || safeBadges.moderator || safeBadges.vip)
    case 'subs':
      return Boolean(safeBadges.subscriber || safeBadges.broadcaster || safeBadges.moderator)
    case 'followers':
      return true
    case 'everyone':
    default:
      return true
  }
}

const hasLocaleStyleSupport = (voices, locale) => {
  if (!Array.isArray(voices) || voices.length === 0) return true

  const normalizedLocale = String(locale || '').trim().toLowerCase()
  const matchingVoices = normalizedLocale
    ? voices.filter((voice) => String(voice?.Locale || '').toLowerCase().startsWith(normalizedLocale))
    : voices

  if (!matchingVoices.length) return false

  return matchingVoices.some((voice) => Array.isArray(voice?.StyleList) && voice.StyleList.length > 0)
}

function App() {
  const [activeSection, setActiveSection] = useState('azure')
  const [theme, setTheme] = useState('default')
  const [accent, setAccent] = useState(defaultAccent)
  const [config, setConfig] = useState({})
  const [azureVoices, setAzureVoices] = useState([])
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [isPaused, setIsPaused] = useState(false)
  const [saveState, setSaveState] = useState({ busy: false, label: 'SAVE SETTINGS' })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [toasts, setToasts] = useState([])
  const [sensitiveVisibility, setSensitiveVisibility] = useState({ azure: false, twitch: false })
  const [showLoader, setShowLoader] = useState(true)
  const [bootLanguage, setBootLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLanguage = window.localStorage.getItem('aether_app_lang')
        if (savedLanguage) {
          return normalizeAppLanguage(savedLanguage)
        }
      } catch {
        // ignore storage access failures
      }
    }

    if (typeof navigator === 'undefined') return 'en'
    return normalizeAppLanguage(navigator.language)
  })
  const [bootError, setBootError] = useState(null)
  const [isBootDataReady, setIsBootDataReady] = useState(false)
  const [isVoiceSelectorsReady, setIsVoiceSelectorsReady] = useState(false)
  const [isExitingFromBootError, setIsExitingFromBootError] = useState(false)
  const [bootCopyState, setBootCopyState] = useState('idle')
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false)
  const [showTtsOverlay, setShowTtsOverlay] = useState(false)
  const [isValidatingAzure, setIsValidatingAzure] = useState(false)
  const [isConfigReady, setIsConfigReady] = useState(false)
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [setupKey, setSetupKey] = useState('')
  const [setupRegion, setSetupRegion] = useState('westeurope')
  const [setupError, setSetupError] = useState('')
  const [isSetupSaving, setIsSetupSaving] = useState(false)
  const [isOverlayServerReady, setIsOverlayServerReady] = useState(false)
  const [securityModal, setSecurityModal] = useState({
    open: false,
    action: null,
    target: null,
    countdown: 0,
    text: '',
    confirmLabel: '',
  })
  const [updateModal, setUpdateModal] = useState({
    open: false,
    loading: false,
    hasUpdate: false,
    currentVersion: '',
    latestVersion: '',
    releaseUrl: '',
    installerUrl: '',
    installerName: '',
    changelog: '',
    error: '',
  })
  const [audioDevices, setAudioDevices] = useState([])
  const [audioDeviceError, setAudioDeviceError] = useState('')
  const [audioOutputSupported, setAudioOutputSupported] = useState(true)
  const [isRefreshingAudioDevices, setIsRefreshingAudioDevices] = useState(false)
  const [twitchConnection, setTwitchConnection] = useState({ state: 'offline', username: '' })
  const [logs, setLogs] = useState([])
  const [ttsState, setTtsState] = useState({ status: 'IDLE', count: 0 })
  const [rewardRules, setRewardRules] = useState({})
  const [userVoiceRules, setUserVoiceRules] = useState({})
  const [vtsConnection, setVtsConnection] = useState({
    state: 'offline',
    port: 8001,
    authenticated: false,
    error: '',
  })
  const lastSavedSnapshotRef = useRef('')
  const isBootstrappedRef = useRef(false)
  const inputsSyncedRef = useRef(false)
  const lipSyncTimerRef = useRef(null)
  const lipSyncActiveRef = useRef(false)
  const lastSpeakerRef = useRef(null)
  const logsRef = useRef([])
  const logFlushTimerRef = useRef(null)
  const activeSectionRef = useRef(activeSection)
  const toastTimersRef = useRef(new Map())
  const toastIdRef = useRef(0)
  const saveFeedbackTimerRef = useRef(null)
  const bootCopyTimerRef = useRef(null)
  const sectionSwitchAnimationTimerRef = useRef(null)
  const hasAutoUpdateCheckRef = useRef(false)
  const hasInitializedAudioDevicesRef = useRef(false)
  const audioDevicesRefreshLockRef = useRef(false)
  const audioDevicesRefreshTimerRef = useRef(null)
  const userAvatarCacheRef = useRef(new Map())
  const badgeCatalogRef = useRef({ global: null, channels: new Map() })
  const initialSnapshotSyncedRef = useRef(false)
  const allowWindowCloseRef = useRef(false)
  const processedRedemptionIdsRef = useRef(new Set())
  const skipNextVoiceRefreshRef = useRef(false)
  const runtimeConfigRef = useRef(config)
  const rewardRulesRef = useRef(rewardRules)
  const userVoiceRulesRef = useRef(userVoiceRules)
  const appLanguage = config.app_lang || 'en'
  const performanceMode = config.performance_mode !== false
  const animationsEnabled = !performanceMode
  const t = useMemo(() => createTranslator(appLanguage), [appLanguage])
  const bootT = useMemo(() => createTranslator(bootLanguage), [bootLanguage])
  const rewardRulesByUser = useMemo(
    () => normalizeRewardRulesByUser(config.reward_rules_by_user),
    [config.reward_rules_by_user],
  )
  const hotkeys = useMemo(() => normalizeHotkeys(config.hotkeys), [config.hotkeys])
  const loaderCaptions = useMemo(() => ([
    bootT('loader_caption_1', 'Syncing Twitch identity and reward mapping...'),
    bootT('loader_caption_2', 'Building voice routing matrix for TTS rules...'),
    bootT('loader_caption_3', 'Loading Azure voice catalog and locale filters...'),
    bootT('loader_caption_4', 'Preparing live log pipeline and badge resolver...'),
    bootT('loader_caption_5', 'Warming up queue controls and playback state...'),
    bootT('loader_caption_6', 'Applying overlay status labels for OBS output...'),
    bootT('loader_caption_7', 'Hardening moderation filters and anti-link checks...'),
  ]), [bootT])
  const loaderErrorCode = useMemo(
    () => String(bootError?.code || 'APP_BOOT_UNKNOWN').trim(),
    [bootError],
  )
  const loaderErrorMessage = useMemo(() => {
    const rawMessage = String(bootError?.message || '').trim()
    const translatedMessage = loaderErrorCode ? bootT(loaderErrorCode, '') : ''
    const hasUsableTranslation = Boolean(translatedMessage && translatedMessage !== loaderErrorCode)
    return String(
      hasUsableTranslation
        ? translatedMessage
        : (rawMessage || translatedMessage || bootT('loader_error_description', 'The app could not finish loading.')),
    ).trim()
  }, [bootError, loaderErrorCode, bootT])
  const loaderErrorNoticeText = useMemo(
    () => String(bootT('loader_error_notice', 'The application encountered a startup error.')).trim(),
    [bootT],
  )
  const loaderErrorConsoleText = useMemo(() => {
    const safeCode = String(loaderErrorCode || '').replace(/\r?\n+/g, ' ').trim() || 'APP_BOOT_UNKNOWN'
    const safeMessage = String(loaderErrorMessage || '').replace(/\r?\n+/g, ' ').trim() || 'Unknown startup error.'
    return [
      '[bootstrap] failed {',
      `  code: '${safeCode}',`,
      `  message: '${safeMessage}'`,
      '}',
    ].join('\n')
  }, [loaderErrorCode, loaderErrorMessage])
  const loaderErrorClipboardText = useMemo(() => {
    return loaderErrorConsoleText
  }, [loaderErrorConsoleText])

  const handleExitFromBootError = useCallback(async () => {
    if (isExitingFromBootError) return
    setIsExitingFromBootError(true)

    // Reuse the same close-request guard used by the titlebar close flow.
    allowWindowCloseRef.current = true

    const result = await exitApplication()
    if (result?.success) {
      return
    }

    allowWindowCloseRef.current = false

    if (!isTauriRuntime()) {
      window.close()
      setIsExitingFromBootError(false)
      return
    }

    setBootError((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        message: bootT('loader_exit_failed', 'Unable to close the application automatically. Please force-close it.'),
      }
    })
    setIsExitingFromBootError(false)
  }, [isExitingFromBootError, bootT])

  const handleCopyBootError = useCallback(async () => {
    if (!bootError || bootCopyState === 'copying') return

    setBootCopyState('copying')
    const payload = String(loaderErrorClipboardText || '').trim()

    let copied = false

    if (payload && typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload)
        copied = true
      } catch {
        copied = false
      }
    }

    if (!copied && payload && typeof document !== 'undefined' && document.body) {
      try {
        const helper = document.createElement('textarea')
        helper.value = payload
        helper.setAttribute('readonly', '')
        helper.style.position = 'absolute'
        helper.style.left = '-9999px'
        document.body.appendChild(helper)
        helper.select()
        copied = document.execCommand('copy')
        document.body.removeChild(helper)
      } catch {
        copied = false
      }
    }

    setBootCopyState(copied ? 'copied' : 'failed')

    if (bootCopyTimerRef.current) {
      window.clearTimeout(bootCopyTimerRef.current)
      bootCopyTimerRef.current = null
    }

    bootCopyTimerRef.current = window.setTimeout(() => {
      bootCopyTimerRef.current = null
      setBootCopyState('idle')
    }, 1700)
  }, [bootCopyState, bootError, loaderErrorClipboardText])

  useEffect(() => {
    if (bootError || !showLoader) return
    if (!Array.isArray(loaderCaptions) || loaderCaptions.length === 0) return

    window.__setBootCaptionList?.(loaderCaptions)
  }, [bootError, loaderCaptions, showLoader])

  useEffect(() => {
    if (!showLoader && !bootError) return

    const bootElements = ensureBootLoaderElements()
    if (!bootElements) return

    const {
      bootLoader,
      errorPanel,
      errorNoticeElement,
      errorConsoleElement,
      copyButton,
      exitButton,
    } = bootElements

    const hasError = Boolean(bootError)
    bootLoader.classList.toggle('boot-error', hasError)

    if (hasError) {
      window.__stopBootCaptionRotation?.()
    }

    if (errorPanel) {
      errorPanel.hidden = !hasError
    }
    if (errorNoticeElement) {
      errorNoticeElement.textContent = loaderErrorNoticeText
    }
    if (errorConsoleElement) {
      errorConsoleElement.textContent = loaderErrorConsoleText
    }

    if (copyButton) {
      let copyIcon = '⧉'
      let copyLabel = bootT('loader_copy_button', 'Copy error')

      if (bootCopyState === 'copying') {
        copyIcon = '…'
        copyLabel = bootT('processing', 'Processing...')
      } else if (bootCopyState === 'copied') {
        copyIcon = '✓'
        copyLabel = bootT('loader_copy_success', 'Copied')
      } else if (bootCopyState === 'failed') {
        copyIcon = '!'
        copyLabel = bootT('loader_copy_failed', 'Copy failed')
      }

      copyButton.disabled = !hasError || bootCopyState === 'copying'
      copyButton.textContent = copyIcon
      copyButton.title = copyLabel
      copyButton.setAttribute('aria-label', copyLabel)
    }

    if (exitButton) {
      exitButton.disabled = !hasError || isExitingFromBootError
      exitButton.textContent = isExitingFromBootError
        ? bootT('processing', 'Processing...')
        : bootT('loader_exit_button', 'Exit application')
    }
  }, [
    bootT,
    bootCopyState,
    bootError,
    isExitingFromBootError,
    loaderErrorConsoleText,
    loaderErrorNoticeText,
    showLoader,
  ])

  useEffect(() => {
    if (bootCopyTimerRef.current) {
      window.clearTimeout(bootCopyTimerRef.current)
      bootCopyTimerRef.current = null
    }
    setBootCopyState('idle')
  }, [bootError])

  useEffect(() => () => {
    if (audioDevicesRefreshTimerRef.current) {
      window.clearTimeout(audioDevicesRefreshTimerRef.current)
      audioDevicesRefreshTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !isConfigReady) return
    try {
      window.localStorage.setItem('aether_app_lang', normalizeAppLanguage(appLanguage))
    } catch {
      // ignore storage access failures
    }
  }, [appLanguage, isConfigReady])

  useEffect(() => {
    if (!showLoader && !bootError) return undefined

    const copyButton = ensureBootLoaderElements()?.copyButton
    if (!copyButton) return undefined

    const handleClick = () => {
      void handleCopyBootError()
    }

    copyButton.addEventListener('click', handleClick)

    return () => {
      copyButton.removeEventListener('click', handleClick)
    }
  }, [bootError, handleCopyBootError, showLoader])

  useEffect(() => {
    if (!showLoader && !bootError) return undefined

    const exitButton = ensureBootLoaderElements()?.exitButton
    if (!exitButton) return undefined

    const handleClick = () => {
      void handleExitFromBootError()
    }

    exitButton.addEventListener('click', handleClick)

    return () => {
      exitButton.removeEventListener('click', handleClick)
    }
  }, [bootError, handleExitFromBootError, showLoader])

  useEffect(() => {
    runtimeConfigRef.current = config
  }, [config])

  useEffect(() => {
    rewardRulesRef.current = rewardRules
  }, [rewardRules])

  useEffect(() => {
    userVoiceRulesRef.current = userVoiceRules
  }, [userVoiceRules])

  const dismissToast = useCallback((toastId) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== toastId))
    const timer = toastTimersRef.current.get(toastId)
    if (timer) {
      window.clearTimeout(timer)
      toastTimersRef.current.delete(toastId)
    }
  }, [])

  const pushToast = useCallback((message, tone = 'success') => {
    const text = String(message || '').trim()
    if (!text) return

    const nextId = `toast-${Date.now()}-${toastIdRef.current += 1}`
    setToasts((previous) => ([...previous, { id: nextId, message: text, tone }]))

    const timer = window.setTimeout(() => {
      dismissToast(nextId)
    }, 5000)
    toastTimersRef.current.set(nextId, timer)
  }, [dismissToast])

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    toastTimersRef.current.clear()
  }, [])

  useEffect(() => {
    userAvatarCacheRef.current.clear()
    badgeCatalogRef.current = { global: null, channels: new Map() }
  }, [config.twitch_oauth])

  const normalizeTwitchToken = useCallback((token) => String(token || '')
    .trim()
    .replace(/^oauth:/i, '')
    .replace(/^bearer\s+/i, ''), [])

  const buildBadgeSetsFromHelix = (payload) => {
    const data = Array.isArray(payload?.data) ? payload.data : []
    const badgeSets = {}

    data.forEach((set) => {
      const setId = String(set?.set_id || '').trim()
      if (!setId) return

      const versions = {}
      const versionList = Array.isArray(set?.versions) ? set.versions : []
      versionList.forEach((version) => {
        const versionId = String(version?.id || '').trim()
        if (!versionId) return
        versions[versionId] = {
          image_url_1x: version?.image_url_1x || '',
          image_url_2x: version?.image_url_2x || '',
          image_url_4x: version?.image_url_4x || '',
          title: version?.title || setId,
        }
      })

      badgeSets[setId] = { versions }
    })

    return badgeSets
  }

  const fetchBadgeCatalog = useCallback(async (roomId) => {
    const badgeCache = badgeCatalogRef.current
    const token = normalizeTwitchToken(config.twitch_oauth)
    const fetchHelix = async (url) => {
      if (!token || !TWITCH_CLIENT_ID) return null
      try {
        const response = await fetch(url, {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) return null
        const payload = await response.json()
        return buildBadgeSetsFromHelix(payload)
      } catch {
        return null
      }
    }

    if (!badgeCache.global) {
      let resolved = false
      const helixGlobal = await fetchHelix('https://api.twitch.tv/helix/chat/badges/global')
      if (helixGlobal) {
        badgeCache.global = helixGlobal
        resolved = true
      }

      if (!resolved) {
        try {
          const response = await fetch('https://badges.twitch.tv/v1/badges/global/display', { cache: 'no-store' })
          if (response.ok) {
            const payload = await response.json()
            badgeCache.global = payload?.badge_sets || {}
          }
        } catch {
          badgeCache.global = badgeCache.global || {}
        }
      }
    }

    if (roomId && !badgeCache.channels.has(roomId)) {
      let resolved = false
      const helixChannel = await fetchHelix(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${roomId}`)
      if (helixChannel) {
        badgeCache.channels.set(roomId, helixChannel)
        resolved = true
      }

      if (!resolved) {
        try {
          const response = await fetch(`https://badges.twitch.tv/v1/badges/channels/${roomId}/display`, { cache: 'no-store' })
          if (response.ok) {
            const payload = await response.json()
            badgeCache.channels.set(roomId, payload?.badge_sets || {})
          } else {
            badgeCache.channels.set(roomId, {})
          }
        } catch {
          badgeCache.channels.set(roomId, {})
        }
      }
    }

    return {
      global: badgeCache.global || {},
      channel: roomId ? badgeCache.channels.get(roomId) || {} : {},
    }
  }, [config.twitch_oauth, normalizeTwitchToken])

  const buildBadgeImages = useCallback((badgeSet, catalogs) => {
    if (!badgeSet || typeof badgeSet !== 'object') return []

    const combined = { ...catalogs.global, ...catalogs.channel }
    return Object.entries(badgeSet)
      .map(([badgeId, version]) => {
        const badgeInfo = combined?.[badgeId]
        const badgeVersion = badgeInfo?.versions?.[String(version)]
        const url = badgeVersion?.image_url_1x || badgeVersion?.image_url_2x || badgeVersion?.image_url_4x
        if (!url) return null
        return { url, title: badgeVersion?.title || badgeId }
      })
      .filter(Boolean)
  }, [])

  const resolveBadgeImages = useCallback(async (badgeSet, roomId) => {
    if (!badgeSet || Object.keys(badgeSet).length === 0) return []
    const catalogs = await fetchBadgeCatalog(roomId)
    return buildBadgeImages(badgeSet, catalogs)
  }, [buildBadgeImages, fetchBadgeCatalog])

  const resolveUserAvatar = useCallback(async (username) => {
    const login = String(username || '').trim().toLowerCase()
    if (!login) return ''

    const cached = userAvatarCacheRef.current.get(login)
    if (cached !== undefined) return cached

    const token = normalizeTwitchToken(config.twitch_oauth)
    if (!token || !TWITCH_CLIENT_ID) {
      userAvatarCacheRef.current.set(login, '')
      return ''
    }

    try {
      const response = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
        {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            Authorization: `Bearer ${token}`,
          },
        },
      )
      if (!response.ok) {
        userAvatarCacheRef.current.set(login, '')
        return ''
      }
      const payload = await response.json()
      const avatarUrl = payload?.data?.[0]?.profile_image_url || ''
      userAvatarCacheRef.current.set(login, avatarUrl)
      return avatarUrl
    } catch {
      userAvatarCacheRef.current.set(login, '')
      return ''
    }
  }, [config.twitch_oauth, normalizeTwitchToken])

  const resolveUserAssets = useCallback(async (entry) => {
    const [avatar, badgeImages] = await Promise.all([
      resolveUserAvatar(entry?.username),
      resolveBadgeImages(entry?.badgeSet, entry?.roomId),
    ])

    return {
      avatar: avatar || DEFAULT_TWITCH_AVATAR,
      badgeImages,
    }
  }, [resolveBadgeImages, resolveUserAvatar])

  const buildProcessedChatPayload = useCallback((entry) => {
    const currentConfig = runtimeConfigRef.current || {}
    const currentRewardRules = rewardRulesRef.current || {}
    const currentUserVoiceRules = userVoiceRulesRef.current || {}
    const user = String(entry?.user || '').trim() || 'unknown'
    const normalizedUser = user.toLowerCase()
    const rewardRule = entry?.rewardId ? currentRewardRules?.[entry.rewardId] : null
    const userRule = currentUserVoiceRules?.[normalizedUser] || null
    const hasFixedRewardText = Boolean(rewardRule?.useFixText && String(rewardRule.customText || '').trim())

    const blockedUsers = Array.isArray(currentConfig.blacklist)
      ? currentConfig.blacklist.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : []

    if (blockedUsers.includes(normalizedUser)) {
      return null
    }

    let processedText = hasFixedRewardText
      ? String(rewardRule.customText).trim()
      : String(entry?.text ?? '')
    if (!processedText.trim()) {
      return null
    }

    if (!currentConfig.read_emotes) {
      processedText = stripTwitchEmoteRanges(processedText, entry?.emotes)
    }

    if (currentConfig.filter_links && LINK_PATTERN.test(processedText)) {
      return null
    }

    if (containsBlockedWord(processedText, currentConfig.word_blacklist)) {
      return null
    }

    if (currentConfig.trim_repetition) {
      const maxRepetition = Number.parseInt(String(currentConfig.max_repetition ?? 4), 10)
      processedText = trimRepeatedCharacters(processedText, maxRepetition)
    }

    processedText = processedText.replace(/\s+/g, ' ').trim()
    if (!processedText) {
      return null
    }

    if (!canSpeakByPermissionLevel(currentConfig.permissionLevel, entry?.badges)) {
      return null
    }

    const appliesRewardRule = Boolean(rewardRule)
    const appliesUserRule = !appliesRewardRule && Boolean(userRule)
    const effectiveRule = appliesRewardRule
      ? rewardRule
      : appliesUserRule
        ? userRule
        : {}

    const liveVoice = getInputValue('voice_name', currentConfig.voice_name || 'en-US-JennyNeural')
    const liveSpeed = getInputValue('main_speed', currentConfig.global_speed || '1.0')
    const livePitch = getInputValue('main_pitch', currentConfig.global_pitch || '1.0')
    const liveStyle = getInputValue('main_style', currentConfig.global_style || 'general')

    const ruleVoice = effectiveRule.voice || effectiveRule.voice_name
    const ruleSpeed = effectiveRule.speed || effectiveRule.rate
    const rulePitch = effectiveRule.pitch
    const ruleStyle = effectiveRule.style

    const ttsOptions = {
      voice: ruleVoice || liveVoice,
      rate: ruleSpeed || liveSpeed || '1.0',
      pitch: rulePitch || livePitch || '1.0',
      style: ruleStyle || liveStyle || 'general',
    }

    const nameStyle = String(currentConfig.nameStyle || 'always').toLowerCase()
    let ttsText = processedText

    if (nameStyle === 'always') {
      ttsText = `${user} mondja: ${processedText}`
      lastSpeakerRef.current = user
    } else if (nameStyle === 'new_speaker') {
      if (lastSpeakerRef.current !== user) {
        ttsText = `${user} mondja: ${processedText}`
        lastSpeakerRef.current = user
      }
    } else if (nameStyle === 'never') {
      lastSpeakerRef.current = user
    } else {
      ttsText = `${user} mondja: ${processedText}`
      lastSpeakerRef.current = user
    }

    return {
      user,
      displayText: processedText,
      ttsText,
      ttsOptions,
      appliesRewardRule,
      appliesUserRule,
      hasFixedRewardText,
    }
  }, [])

  const flushLogs = useCallback(() => {
    if (logFlushTimerRef.current) {
      window.clearTimeout(logFlushTimerRef.current)
      logFlushTimerRef.current = null
    }

    setLogs([...logsRef.current])
  }, [])

  const scheduleLogFlush = useCallback(() => {
    if (logFlushTimerRef.current) return

    logFlushTimerRef.current = window.setTimeout(() => {
      logFlushTimerRef.current = null
      setLogs([...logsRef.current])
    }, 200)
  }, [])

  const applyLogPatch = useCallback((entryId, patch) => {
    if (!entryId) return
    logsRef.current = logsRef.current.map((entry) => (
      entry.id === entryId ? { ...entry, ...patch } : entry
    ))
    if (activeSectionRef.current === 'logs') {
      scheduleLogFlush()
    }
  }, [scheduleLogFlush])

  useEffect(() => {
    const bootElements = ensureBootLoaderElements()
    const bootLoader = bootElements?.bootLoader
    if (!bootLoader) return

    if (showLoader) {
      bootLoader.classList.remove('boot-hidden')
      return undefined
    }

    window.__stopBootCaptionRotation?.()
    bootLoader.classList.add('boot-hidden')
    const timer = window.setTimeout(() => {
      bootLoader.remove()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [showLoader])

  useEffect(() => {
    return () => {
      if (logFlushTimerRef.current) {
        window.clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => () => {
    if (saveFeedbackTimerRef.current) {
      window.clearTimeout(saveFeedbackTimerRef.current)
      saveFeedbackTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    if (bootCopyTimerRef.current) {
      window.clearTimeout(bootCopyTimerRef.current)
      bootCopyTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    if (sectionSwitchAnimationTimerRef.current) {
      window.clearTimeout(sectionSwitchAnimationTimerRef.current)
      sectionSwitchAnimationTimerRef.current = null
    }
    document.body.classList.remove('section-switching')
  }, [])

  useEffect(() => {
    activeSectionRef.current = activeSection
    if (activeSection === 'logs') {
      flushLogs()
    }
  }, [activeSection, flushLogs])

  useEffect(() => {
    document.body.classList.add('section-switching')

    if (sectionSwitchAnimationTimerRef.current) {
      window.clearTimeout(sectionSwitchAnimationTimerRef.current)
      sectionSwitchAnimationTimerRef.current = null
    }

    sectionSwitchAnimationTimerRef.current = window.setTimeout(() => {
      document.body.classList.remove('section-switching')
      sectionSwitchAnimationTimerRef.current = null
    }, 900)

    return () => {
      if (sectionSwitchAnimationTimerRef.current) {
        window.clearTimeout(sectionSwitchAnimationTimerRef.current)
        sectionSwitchAnimationTimerRef.current = null
      }
      document.body.classList.remove('section-switching')
    }
  }, [activeSection])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      setShowLoader(true)
      setBootError(null)
      setIsBootDataReady(false)
      setIsVoiceSelectorsReady(false)
      setIsExitingFromBootError(false)
      setBootCopyState('idle')

      if (bootCopyTimerRef.current) {
        window.clearTimeout(bootCopyTimerRef.current)
        bootCopyTimerRef.current = null
      }

      try {
        const forcedMode = consumeForcedBootErrorMode()
        if (forcedMode) {
          const forcedCode = forcedMode === 'backend'
            ? 'loader_test_forced_error_backend'
            : 'loader_test_forced_error_frontend'

          throw {
            source: forcedMode,
            code: forcedCode,
            message: forcedCode,
          }
        }

        const [loadedConfig, loadedVersion] = await Promise.all([getConfig(), getAppVersion()])
        if (cancelled) return

        if (!loadedConfig || typeof loadedConfig !== 'object') {
          throw {
            source: 'frontend',
            code: 'frontend_invalid_config_payload',
            message: 'Configuration payload is missing or invalid.',
          }
        }

        const resolvedBootLanguage = normalizeAppLanguage(loadedConfig.app_lang)
        setBootLanguage(resolvedBootLanguage)
        try {
          window.localStorage.setItem('aether_app_lang', resolvedBootLanguage)
        } catch {
          // ignore storage access failures
        }

        const azureKey = String(loadedConfig.azure_key || '').trim()
        const azureRegion = String(loadedConfig.azure_region || '').trim()
        const needsSetup = !azureKey || !azureRegion

        if (!needsSetup) {
          const voiceResult = await validateAzureAndFetchVoices(azureKey, azureRegion)
          if (cancelled) return

          if (!voiceResult?.success) {
            throw {
              source: 'backend',
              code: resolveBootErrorCode(voiceResult?.error, 'backend_voice_catalog_failed'),
              message: String(voiceResult?.error || '').trim(),
            }
          }

          const voices = Array.isArray(voiceResult.voices) ? voiceResult.voices : []
          if (!voices.length) {
            throw {
              source: 'backend',
              code: 'azure_voice_list_empty',
              message: 'Azure voice list is empty.',
            }
          }

          skipNextVoiceRefreshRef.current = true
          setAzureVoices(voices)
        } else {
          setAzureVoices([])
        }

        const normalizedTheme = normalizeTheme(loadedConfig.theme)
        const nextAccent = {
          primary: loadedConfig.accent_primary || defaultAccent.primary,
          secondary: loadedConfig.accent_secondary || defaultAccent.secondary,
        }
        const nextHotkeys = normalizeHotkeys(loadedConfig.hotkeys)
        const nextPresets = Array.isArray(loadedConfig.presets) ? loadedConfig.presets : []
        const nextOverlayLayout = normalizeOverlayLayout(loadedConfig.overlay_layout)
        const nextOverlayResolution = String(loadedConfig.overlay_resolution || '1080p')
        const nextOverlayShowStatus = loadedConfig.overlay_show_status ?? true
        const nextOverlayShowTtsStatus = loadedConfig.overlay_show_tts_status ?? nextOverlayShowStatus
        const nextOverlayShowTwitchStatus = loadedConfig.overlay_show_twitch_status ?? nextOverlayShowStatus
        const twitchUserId = String(loadedConfig.twitch_user_id || '')
        let nextRewardRulesByUser = {
          ...normalizeRewardRulesByUser(loadedConfig.reward_rules_by_user),
        }
        let nextRewardRules = loadedConfig.reward_rules || {}

        if (twitchUserId) {
          const accountRules = resolveRewardRulesForUser(nextRewardRulesByUser, twitchUserId)
          if (Object.keys(accountRules).length) {
            nextRewardRules = accountRules
          } else if (Object.keys(nextRewardRules || {}).length) {
            nextRewardRulesByUser = {
              ...nextRewardRulesByUser,
              [twitchUserId]: nextRewardRules,
            }
          }
        }

        if (cancelled) return

        setConfig({
          ...loadedConfig,
          reward_rules: nextRewardRules,
          reward_rules_by_user: nextRewardRulesByUser,
          twitch_user_id: twitchUserId,
          presets: nextPresets,
          active_preset_id: loadedConfig.active_preset_id || '',
          hotkeys: nextHotkeys,
          overlay_layout: nextOverlayLayout,
          overlay_resolution: nextOverlayResolution,
          overlay_show_chat: false,
          overlay_show_tts_status: Boolean(nextOverlayShowTtsStatus),
          overlay_show_twitch_status: Boolean(nextOverlayShowTwitchStatus),
          overlay_show_status: Boolean(nextOverlayShowTtsStatus || nextOverlayShowTwitchStatus),
          onboarding_complete: Boolean(loadedConfig.onboarding_complete),
        })
        setRewardRules(nextRewardRules)
        setUserVoiceRules(loadedConfig.user_voices || {})
        setTheme(normalizedTheme)
        setAccent(nextAccent)
        setAppVersion(loadedVersion || '0.1.0')
        setSetupRegion(loadedConfig.azure_region || 'westeurope')
        setSetupKey('')
        setIsSetupOpen(needsSetup)
        setIsConfigReady(true)
        setIsBootDataReady(true)

        lastSavedSnapshotRef.current = stableStringify({
          ...loadedConfig,
          azure_key: loadedConfig.azure_key || '',
          azure_region: loadedConfig.azure_region || 'westeurope',
          voice_name: loadedConfig.voice_name || 'en-US-JennyNeural',
          global_speed: loadedConfig.global_speed || '1.0',
          global_pitch: loadedConfig.global_pitch || '1.0',
          global_style: loadedConfig.global_style || 'general',
          volume: Number.parseInt(String(loadedConfig.volume ?? 50), 10) || 50,
          audio_device: loadedConfig.audio_device || 'default',
          twitch_oauth: loadedConfig.twitch_oauth || '',
          app_lang: loadedConfig.app_lang || 'en',
          language_filter: loadedConfig.language_filter || 'en-US',
          read_emotes: Boolean(loadedConfig.read_emotes),
          filter_links: Boolean(loadedConfig.filter_links),
          trim_repetition: Boolean(loadedConfig.trim_repetition),
          max_repetition: Number.parseInt(String(loadedConfig.max_repetition ?? 4), 10) || 4,
          permissionLevel: String(loadedConfig.permissionLevel || 'everyone'),
          nameStyle: String(loadedConfig.nameStyle || 'always'),
          word_blacklist: Array.isArray(loadedConfig.word_blacklist) ? loadedConfig.word_blacklist : [],
          blacklist: Array.isArray(loadedConfig.blacklist) ? loadedConfig.blacklist : [],
          obs_server_enabled: Boolean(loadedConfig.obs_server_enabled),
          overlay_show_chat: false,
          overlay_show_tts_status: Boolean(nextOverlayShowTtsStatus),
          overlay_show_twitch_status: Boolean(nextOverlayShowTwitchStatus),
          overlay_show_status: Boolean(nextOverlayShowTtsStatus || nextOverlayShowTwitchStatus),
          overlay_resolution: nextOverlayResolution,
          overlay_layout: nextOverlayLayout,
          overlay_scale: Number.parseInt(String(loadedConfig.overlay_scale ?? 100), 10) || 100,
          vts_enabled: Boolean(loadedConfig.vts_enabled),
          vts_port: Number.parseInt(String(loadedConfig.vts_port ?? 8001), 10) || 8001,
          vts_auth_token: loadedConfig.vts_auth_token || '',
          reward_rules: nextRewardRules,
          reward_rules_by_user: nextRewardRulesByUser,
          user_voices: loadedConfig.user_voices || {},
          theme: normalizedTheme,
          accent_primary: nextAccent.primary,
          accent_secondary: nextAccent.secondary,
          performance_mode: loadedConfig.performance_mode ?? true,
          presets: nextPresets,
          active_preset_id: loadedConfig.active_preset_id || '',
          hotkeys: nextHotkeys,
          onboarding_complete: Boolean(loadedConfig.onboarding_complete),
          twitch_user_id: twitchUserId,
        })
        setHasUnsavedChanges(false)
        isBootstrappedRef.current = true
      } catch (error) {
        if (cancelled) return
        console.error('[bootstrap] failed', error)

        const normalizedError = normalizeBootError(error)
        setBootError({
          ...normalizedError,
          message: normalizedError.message
            || (normalizedError.source === 'backend'
              ? 'Backend initialization failed.'
              : 'Frontend initialization failed.'),
        })
        setIsBootDataReady(false)
        setIsConfigReady(false)
        setShowLoader(true)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.body.classList.remove(...THEME_CLASSES)
    if (theme !== 'default') {
      document.body.classList.add(`theme-${theme}`)
    }

    return () => {
      document.body.classList.remove(...THEME_CLASSES)
    }
  }, [theme])

  useEffect(() => {
    document.body.classList.toggle('performance-mode', performanceMode)
  }, [performanceMode])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-primary', accent.primary)
    document.documentElement.style.setProperty('--accent-secondary', accent.secondary)
  }, [accent])

  useEffect(() => {
    document.documentElement.lang = appLanguage
  }, [appLanguage])

  useEffect(() => {
    const nextLanguage = normalizeAppLanguage(config.app_lang || '')
    if (!nextLanguage) return

    if (nextLanguage !== bootLanguage) {
      setBootLanguage(nextLanguage)
    }

    try {
      window.localStorage.setItem('aether_app_lang', nextLanguage)
    } catch {
      // ignore storage access failures
    }
  }, [bootLanguage, config.app_lang])

  useEffect(() => {
    if (!isConfigReady) return
    const needsSetup = !String(config.azure_key || '').trim()
      || !String(config.azure_region || '').trim()
    setIsSetupOpen(needsSetup)
  }, [config.azure_key, config.azure_region, isConfigReady])

  useEffect(() => {
    if (!showLoader) return
    if (bootError) return
    if (!isBootDataReady) return

    if (isSetupOpen || isVoiceSelectorsReady) {
      setShowLoader(false)
    }
  }, [bootError, isBootDataReady, isSetupOpen, isVoiceSelectorsReady, showLoader])

  useEffect(() => {
    setSaveState((previous) => {
      if (previous.busy) return previous
      if (previous.label === t('save_btn')) return previous
      return {
        ...previous,
        label: t('save_btn'),
      }
    })
  }, [t])

  useEffect(() => {
    if (!securityModal.open || securityModal.countdown <= 0) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setSecurityModal((previous) => ({
        ...previous,
        countdown: Math.max(0, Number(previous.countdown || 0) - 1),
      }))
    }, 1000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [securityModal.open, securityModal.countdown])

  useEffect(() => {
    let cancelled = false

    const ensureServer = async () => {
      const result = await ensureOverlayServer()
      if (cancelled) return
      if (result?.success === false) return
      setIsOverlayServerReady(true)
    }

    ensureServer()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isOverlayServerReady || !isConfigReady) return
    void overlaySetEnabled(Boolean(config.obs_server_enabled))
  }, [config.obs_server_enabled, isConfigReady, isOverlayServerReady])


  const overlayStatusLabels = useMemo(() => ({
    tts_label: t('overlay_status_tts', 'TTS'),
    twitch_label: t('overlay_status_twitch', 'TWITCH'),
    status_playing: t('status_playing', 'PLAYING'),
    status_paused: t('status_paused', 'PAUSED'),
    status_idle: t('status_idle', 'IDLE'),
    status_online: t('status_online', 'ONLINE'),
    status_connecting: t('status_connecting', 'CONNECTING...'),
    status_offline: String(t('offline', 'OFFLINE')).replace(/^•\s*/, ''),
  }), [t])

  useEffect(() => {
    if (!isOverlayServerReady || !isConfigReady) return

    const showTtsStatus = Boolean(config.overlay_show_tts_status ?? config.overlay_show_status ?? true)
    const showTwitchStatus = Boolean(config.overlay_show_twitch_status ?? config.overlay_show_status ?? true)

    void overlayUpdateConfig({
      accent_primary: accent.primary,
      accent_secondary: accent.secondary,
      overlay_show_chat: false,
      overlay_show_status: Boolean(showTtsStatus || showTwitchStatus),
      overlay_show_tts_status: showTtsStatus,
      overlay_show_twitch_status: showTwitchStatus,
      overlay_resolution: String(config.overlay_resolution || '1080p'),
      overlay_layout: normalizeOverlayLayout(config.overlay_layout),
      tts_status: ttsState?.status || 'IDLE',
      twitch_state: twitchConnection?.state || 'offline',
      twitch_username: twitchConnection?.username || '',
      status_labels: overlayStatusLabels,
    })
  }, [
    accent.primary,
    accent.secondary,
    config.overlay_show_status,
    config.overlay_show_tts_status,
    config.overlay_show_twitch_status,
    config.overlay_resolution,
    config.overlay_layout,
    isConfigReady,
    isOverlayServerReady,
    ttsState?.status,
    twitchConnection?.state,
    twitchConnection?.username,
    overlayStatusLabels,
  ])

  useEffect(() => {
    if (!isConfigReady) return
    if (hasLocaleStyleSupport(azureVoices, config.language_filter)) return
    if (String(config.global_style || 'general') === 'general') return

    setConfig((previous) => {
      if (String(previous.global_style || 'general') === 'general') {
        return previous
      }
      return {
        ...previous,
        global_style: 'general',
      }
    })
  }, [azureVoices, config.global_style, config.language_filter, isConfigReady])

  useEffect(() => {
    if (!isConfigReady) return undefined

    if (skipNextVoiceRefreshRef.current) {
      skipNextVoiceRefreshRef.current = false
      return undefined
    }

    let cancelled = false

    const loadVoices = async () => {
      if (!config.azure_key || !config.azure_region) {
        if (!cancelled) {
          setAzureVoices([])
        }
        return
      }

      const voices = await fetchAzureVoices()
      if (!cancelled && Array.isArray(voices)) {
        setAzureVoices(voices)
      }
    }

    void loadVoices()

    return () => {
      cancelled = true
    }
  }, [config.azure_key, config.azure_region, isConfigReady])

  useEffect(() => {
    if (!isConfigReady) {
      setIsVoiceSelectorsReady(false)
      return
    }

    const languageFilter = document.getElementById('language_filter')
    const voiceSelect = document.getElementById('voice_name')
    if (!languageFilter || !voiceSelect || !Array.isArray(azureVoices) || azureVoices.length === 0) {
      setIsVoiceSelectorsReady(false)
      return
    }

    const locales = [...new Set(azureVoices.map((voice) => voice.Locale))].sort()
    const previousLocale = languageFilter.value || config.language_filter || ''

    languageFilter.innerHTML = ''
    locales.forEach((locale) => {
      const option = document.createElement('option')
      option.value = locale
      option.text = formatLocaleLabel(locale, appLanguage)
      languageFilter.add(option)
    })

    const preferredLocale = locales.includes(previousLocale)
      ? previousLocale
      : (locales.includes('en-US') ? 'en-US' : locales[0])
    languageFilter.value = preferredLocale

    const renderVoicesForLocale = () => {
      const selectedLocale = languageFilter.value || locales[0]
      const filteredVoices = azureVoices.filter((voice) => voice.Locale === selectedLocale)

      voiceSelect.innerHTML = ''
      filteredVoices.forEach((voice) => {
        const option = document.createElement('option')
        option.value = voice.ShortName
        option.text = formatVoiceLabel(voice, t)
        voiceSelect.add(option)
      })

      if (config.voice_name && filteredVoices.some((voice) => voice.ShortName === config.voice_name)) {
        voiceSelect.value = config.voice_name
      } else if (filteredVoices.length > 0) {
        voiceSelect.value = filteredVoices[0].ShortName
      }

      const selectedVoice = voiceSelect.value || config.voice_name || ''
      setConfig((previous) => {
        if (previous.language_filter === selectedLocale && previous.voice_name === selectedVoice) {
          return previous
        }

        return {
          ...previous,
          language_filter: selectedLocale,
          voice_name: selectedVoice,
        }
      })

      setIsVoiceSelectorsReady(Boolean(selectedLocale && selectedVoice))
    }

    renderVoicesForLocale()
    languageFilter.onchange = renderVoicesForLocale
    voiceSelect.onchange = () => {
      const nextVoice = voiceSelect.value || ''
      setConfig((previous) => {
        if (previous.voice_name === nextVoice) {
          return previous
        }

        return {
          ...previous,
          voice_name: nextVoice,
        }
      })
      setIsVoiceSelectorsReady(Boolean(nextVoice))
    }

    return () => {
      languageFilter.onchange = null
      voiceSelect.onchange = null
    }
  }, [azureVoices, activeSection, appLanguage, config.voice_name, config.language_filter, isConfigReady, t])

  useEffect(() => {
    setInputValue('azure_key', config.azure_key || '')
    setInputValue('azure_region', config.azure_region || 'westeurope')
    setInputValue('voice_name', config.voice_name || 'en-US-JennyNeural')
    setInputValue('main_style', config.global_style || 'general')
    setInputValue('main_speed', config.global_speed || '1.0')
    setInputValue('main_pitch', config.global_pitch || '1.0')
    setInputValue('volume', config.volume ?? 50)
    setInputValue('audio_output', config.audio_device || 'default')
    setInputValue('twitch_oauth', config.twitch_oauth || '')
    setInputValue('vts-port', config.vts_port || 8001)

    syncRangeVisual('main_speed', config.global_speed || '1.0', 0.5, 2.0, 'disp_main_speed', 'x')
    syncRangeVisual('main_pitch', config.global_pitch || '1.0', 0.5, 2.0, 'disp_main_pitch')
    syncRangeVisual('volume', config.volume ?? 50, 0, 100, 'vol_val')

    const volVal = document.getElementById('vol_val')
    if (volVal && config.volume !== undefined) {
      volVal.innerText = String(config.volume)
    }

    const twitchUser = document.getElementById('twitch-user-display')
    if (twitchUser) {
      twitchUser.innerText = config.twitch_username || ''
    }
    if (isConfigReady) {
      inputsSyncedRef.current = true
    }
  }, [activeSection, config, isConfigReady])

  useEffect(() => {
    configureTtsQueue({
      voice_name: config.voice_name || 'en-US-JennyNeural',
      volume: config.volume ?? 50,
      audio_device: config.audio_device || 'default',
      global_speed: config.global_speed || '1.0',
      global_pitch: config.global_pitch || '1.0',
      global_style: config.global_style || 'general',
    })
  }, [
    config.voice_name,
    config.volume,
    config.audio_device,
    config.global_speed,
    config.global_pitch,
    config.global_style,
  ])

  useEffect(() => {
    const unsubscribe = subscribeTtsQueue((state) => {
      setTtsState(state)
      setIsPaused(state.status === 'PAUSED')
    })

    return () => {
      unsubscribe()
      clearTtsQueue()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeVtsStatus((nextStatus) => {
      setVtsConnection(nextStatus)
    })

    return () => {
      unsubscribe()
      disconnectVts()
    }
  }, [])

  useEffect(() => {
    setVtsAuthToken(config.vts_auth_token || '')
  }, [config.vts_auth_token])

  useEffect(() => {
    const vtsEnabled = Boolean(config.vts_enabled)
    const desiredPort = Number.parseInt(String(config.vts_port ?? 8001), 10) || 8001
    const isConnected = vtsConnection.state === 'connected'
    const isConnecting = vtsConnection.state === 'connecting' || vtsConnection.state === 'authorizing'

    if (!vtsEnabled) {
      if (vtsConnection.state !== 'offline') {
        disconnectVts()
      }
      return
    }

    if (isConnected && vtsConnection.port !== desiredPort) {
      disconnectVts()
      return
    }

    if (!isConnected && isConnecting) {
      return
    }
  }, [
    config.vts_enabled,
    config.vts_port,
    config.vts_auth_token,
    vtsConnection.state,
    vtsConnection.port,
  ])

  const stopLipSync = useCallback(() => {
    if (lipSyncTimerRef.current) {
      window.clearInterval(lipSyncTimerRef.current)
      lipSyncTimerRef.current = null
    }

    if (lipSyncActiveRef.current) {
      lipSyncActiveRef.current = false
      injectVtsMouth(0)
    }
  }, [])

  const startLipSync = useCallback(() => {
    if (lipSyncTimerRef.current) {
      window.clearInterval(lipSyncTimerRef.current)
      lipSyncTimerRef.current = null
    }

    lipSyncActiveRef.current = true
    lipSyncTimerRef.current = window.setInterval(() => {
      const pulseValue = 0.1 + Math.random() * 0.5
      injectVtsMouth(pulseValue)
    }, 180)
  }, [])

  useEffect(() => {
    const shouldAnimateMouth = Boolean(config.vts_enabled)
      && vtsConnection.state === 'connected'
      && ttsState.status === 'PLAYING'

    if (!shouldAnimateMouth) {
      stopLipSync()
      return
    }

    startLipSync()

    return () => {
      stopLipSync()
    }
  }, [config.vts_enabled, vtsConnection.state, ttsState.status, startLipSync, stopLipSync])

  const handleIncomingTwitchEntry = useCallback((entry) => {
    const processed = buildProcessedChatPayload(entry)
    if (!processed) return false

    const sourceText = typeof entry?.text === 'string'
      ? entry.text
      : String(processed.displayText || '')
    const renderedText = String(processed.displayText || sourceText).trim() || sourceText
    const isRewardEvent = Boolean(entry?.rewardId || processed.appliesRewardRule)

    const normalizedEntry = {
      ...entry,
      user: processed.user,
      text: renderedText,
      sourceText,
      displayText: renderedText,
      rewardId: entry?.rewardId || null,
      usedRewardRule: isRewardEvent,
      usedUserVoiceRule: Boolean(processed.appliesUserRule),
      avatar: DEFAULT_TWITCH_AVATAR,
      badgeImages: [],
      badgeSet: entry?.badgeSet || {},
      roomId: entry?.roomId || '',
    }

    logsRef.current = [normalizedEntry, ...logsRef.current].slice(0, 250)
    if (activeSectionRef.current === 'logs') {
      scheduleLogFlush()
    }

    void (async () => {
      const assets = await resolveUserAssets(normalizedEntry)
      if (assets) {
        applyLogPatch(normalizedEntry.id, assets)
      }

      void overlayPushEvent({
        user: processed.user,
        text: renderedText,
        rewardId: entry?.rewardId || null,
        time: entry?.time || '',
        avatar: assets?.avatar || DEFAULT_TWITCH_AVATAR,
        badges: assets?.badgeImages || [],
        emotes: entry?.emotes || null,
      })
    })()

    void enqueueTts(processed.ttsText, processed.ttsOptions)
    return true
  }, [applyLogPatch, buildProcessedChatPayload, resolveUserAssets, scheduleLogFlush])

  useEffect(() => {
    let disposed = false
    const token = config.twitch_oauth || ''
    const username = config.twitch_username || ''

    if (!token || !username) {
      lastSpeakerRef.current = null
      window.setTimeout(() => {
        setTwitchConnection({ state: 'offline', username: '' })
      }, 0)
      void stopTwitchBot()
      return () => {}
    }

    const startBot = async () => {
      try {
        await startTwitchBot({
          username,
          token,
          onStatus: (status) => {
            if (disposed) return
            setTwitchConnection({
              state: status?.state || 'offline',
              username: status?.username || '',
            })
          },
          onLog: (entry) => {
            if (disposed) return
            handleIncomingTwitchEntry(entry)
          },
        })
      } catch (error) {
        console.error('[twitch-bot] start failed', error)
        if (!disposed) {
          setTwitchConnection({ state: 'offline', username: '' })
        }
      }
    }

    startBot()

    return () => {
      disposed = true
      lastSpeakerRef.current = null
      void stopTwitchBot()
    }
  }, [config.twitch_oauth, config.twitch_username, handleIncomingTwitchEntry])

  useEffect(() => {
    processedRedemptionIdsRef.current.clear()
  }, [config.twitch_oauth, config.twitch_username, config.twitch_user_id])

  useEffect(() => {
    let disposed = false
    let inFlight = false
    const token = String(config.twitch_oauth || '').trim()
    const username = String(config.twitch_username || '').trim()

    if (!token || !username) {
      return undefined
    }

    const pollRedemptions = async () => {
      if (disposed || inFlight) return
      inFlight = true

      try {
        const activeRules = rewardRulesRef.current || {}
        const rewardIds = Object.entries(activeRules)
          .filter(([rewardId, rule]) => (
            rewardId
            && !String(rewardId).startsWith('local-')
            && Boolean(rule?.useFixText)
            && String(rule?.customText || '').trim()
          ))
          .map(([rewardId]) => String(rewardId))

        if (!rewardIds.length) return

        const result = await fetchTwitchRewardRedemptions(rewardIds)
        if (disposed || !result?.success) return

        const redemptions = Array.isArray(result.redemptions) ? result.redemptions : []
        for (const redemption of redemptions) {
          if (disposed) return

          const redemptionId = String(redemption?.id || '').trim()
          const rewardId = String(redemption?.reward_id || redemption?.reward?.id || '').trim()

          if (!redemptionId || !rewardId) continue
          if (processedRedemptionIdsRef.current.has(redemptionId)) continue

          processedRedemptionIdsRef.current.add(redemptionId)
          while (processedRedemptionIdsRef.current.size > 2000) {
            const oldest = processedRedemptionIdsRef.current.values().next().value
            if (!oldest) break
            processedRedemptionIdsRef.current.delete(oldest)
          }

          const userName = String(redemption?.user_name || redemption?.user_login || 'unknown').trim() || 'unknown'
          const userLogin = String(redemption?.user_login || userName).trim().toLowerCase()
          const userInput = String(redemption?.user_input || '')
          const redeemedAt = String(redemption?.redeemed_at || '').trim()

          const accepted = handleIncomingTwitchEntry({
            id: `redemption-${redemptionId}`,
            user: userName,
            username: userLogin,
            text: userInput,
            time: redeemedAt ? new Date(redeemedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
            rewardId,
            roomId: String(config.twitch_user_id || ''),
            badges: {},
            badgeSet: {},
            emotes: null,
          })

          if (accepted) {
            void completeTwitchRedemption(rewardId, redemptionId)
          }
        }
      } finally {
        inFlight = false
      }
    }

    void pollRedemptions()
    const intervalId = window.setInterval(() => {
      void pollRedemptions()
    }, 4000)

    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [config.twitch_oauth, config.twitch_username, config.twitch_user_id, handleIncomingTwitchEntry])

  const buildConfigPayload = useCallback((baseConfig, overrides = {}, options = {}) => {
    const useInputs = Boolean(options.useInputs)
    const resolvedConfig = { ...baseConfig, ...overrides }
    const overlayShowTtsStatus = Boolean(
      resolvedConfig.overlay_show_tts_status
      ?? resolvedConfig.overlay_show_status
      ?? true,
    )
    const overlayShowTwitchStatus = Boolean(
      resolvedConfig.overlay_show_twitch_status
      ?? resolvedConfig.overlay_show_status
      ?? true,
    )
    const readInput = (id, fallback) => (useInputs ? getInputValue(id, fallback) : fallback)
    const readInputNonEmpty = (id, fallback) => {
      const rawValue = readInput(id, fallback)
      const normalized = String(rawValue ?? '').trim()
      if (normalized) return normalized
      return String(fallback ?? '').trim()
    }

    return {
      ...resolvedConfig,
      azure_key: readInput('azure_key', resolvedConfig.azure_key || ''),
      azure_region: readInputNonEmpty('azure_region', resolvedConfig.azure_region || 'westeurope'),
      voice_name: readInputNonEmpty('voice_name', resolvedConfig.voice_name || 'en-US-JennyNeural'),
      global_speed: readInputNonEmpty('main_speed', resolvedConfig.global_speed || '1.0'),
      global_pitch: readInputNonEmpty('main_pitch', resolvedConfig.global_pitch || '1.0'),
      global_style: readInputNonEmpty('main_style', resolvedConfig.global_style || 'general'),
      volume: Number.parseInt(readInput('volume', String(resolvedConfig.volume ?? 50)), 10) || 50,
      audio_device: readInputNonEmpty('audio_output', resolvedConfig.audio_device || 'default'),
      twitch_oauth: readInput('twitch_oauth', resolvedConfig.twitch_oauth || ''),
      twitch_user_id: String(resolvedConfig.twitch_user_id || ''),
      app_lang: readInputNonEmpty('app_lang_select', resolvedConfig.app_lang || 'en'),
      language_filter: readInputNonEmpty('language_filter', resolvedConfig.language_filter || 'en-US'),
      read_emotes: Boolean(resolvedConfig.read_emotes),
      filter_links: Boolean(resolvedConfig.filter_links),
      trim_repetition: Boolean(resolvedConfig.trim_repetition),
      max_repetition: Number.parseInt(String(resolvedConfig.max_repetition ?? 4), 10) || 4,
      permissionLevel: String(resolvedConfig.permissionLevel || 'everyone'),
      nameStyle: String(resolvedConfig.nameStyle || 'always'),
      word_blacklist: Array.isArray(resolvedConfig.word_blacklist) ? resolvedConfig.word_blacklist : [],
      blacklist: Array.isArray(resolvedConfig.blacklist) ? resolvedConfig.blacklist : [],
      obs_server_enabled: Boolean(resolvedConfig.obs_server_enabled),
      overlay_show_chat: false,
      overlay_show_status: Boolean(overlayShowTtsStatus || overlayShowTwitchStatus),
      overlay_show_tts_status: overlayShowTtsStatus,
      overlay_show_twitch_status: overlayShowTwitchStatus,
      overlay_resolution: String(resolvedConfig.overlay_resolution || '1080p'),
      overlay_layout: normalizeOverlayLayout(resolvedConfig.overlay_layout),
      overlay_scale: Number.parseInt(String(resolvedConfig.overlay_scale ?? 100), 10) || 100,
      vts_enabled: Boolean(resolvedConfig.vts_enabled),
      vts_port:
        Number.parseInt(readInput('vts-port', String(resolvedConfig.vts_port ?? 8001)), 10)
        || Number.parseInt(String(resolvedConfig.vts_port ?? 8001), 10)
        || 8001,
      vts_auth_token: resolvedConfig.vts_auth_token || '',
      reward_rules: overrides.reward_rules ?? rewardRules,
      reward_rules_by_user: overrides.reward_rules_by_user
        ?? normalizeRewardRulesByUser(resolvedConfig.reward_rules_by_user),
      user_voices: overrides.user_voices ?? userVoiceRules,
      theme: overrides.theme ?? theme,
      accent_primary: overrides.accent_primary ?? accent.primary,
      accent_secondary: overrides.accent_secondary ?? accent.secondary,
      performance_mode: resolvedConfig.performance_mode ?? true,
      presets: overrides.presets ?? (Array.isArray(resolvedConfig.presets) ? resolvedConfig.presets : []),
      active_preset_id: overrides.active_preset_id ?? String(resolvedConfig.active_preset_id || ''),
      hotkeys: overrides.hotkeys ?? normalizeHotkeys(resolvedConfig.hotkeys),
      onboarding_complete: Boolean(resolvedConfig.onboarding_complete),
    }
  }, [accent.primary, accent.secondary, rewardRules, theme, userVoiceRules])

  const collectConfigPayload = useCallback(
    () => buildConfigPayload(config, {}, { useInputs: true }),
    [buildConfigPayload, config],
  )

  const getSnapshotFromConfig = useCallback(
    (baseConfig, overrides = {}) => stableStringify(buildConfigPayload(baseConfig, overrides)),
    [buildConfigPayload],
  )

  const syncSavedSnapshot = useCallback((snapshot) => {
    lastSavedSnapshotRef.current = snapshot
    setHasUnsavedChanges(false)
  }, [])

  const applyRefreshedConfig = useCallback((refreshed, options = {}) => {
    const normalizedTheme = normalizeTheme(refreshed.theme)
    const nextAccent = {
      primary: refreshed.accent_primary || defaultAccent.primary,
      secondary: refreshed.accent_secondary || defaultAccent.secondary,
    }
    const nextOverlayLayout = normalizeOverlayLayout(refreshed.overlay_layout)
    const nextOverlayShowTtsStatus = refreshed.overlay_show_tts_status
      ?? refreshed.overlay_show_status
      ?? true
    const nextOverlayShowTwitchStatus = refreshed.overlay_show_twitch_status
      ?? refreshed.overlay_show_status
      ?? true
    const refreshedRewardRulesByUser = normalizeRewardRulesByUser(refreshed.reward_rules_by_user)
    const refreshedUserId = String(options.userId || refreshed.twitch_user_id || '')
    const resolvedRewardRules = refreshedUserId
      ? resolveRewardRulesForUser(refreshedRewardRulesByUser, refreshedUserId)
      : refreshed.reward_rules || {}
    const nextPresets = Array.isArray(refreshed.presets) ? refreshed.presets : []
    const nextHotkeys = normalizeHotkeys(refreshed.hotkeys)
    const nextActivePresetId = String(refreshed.active_preset_id || '')

    setConfig({
      ...refreshed,
      reward_rules: resolvedRewardRules,
      reward_rules_by_user: refreshedRewardRulesByUser,
      twitch_user_id: refreshedUserId,
      presets: nextPresets,
      active_preset_id: nextActivePresetId,
      hotkeys: nextHotkeys,
      onboarding_complete: Boolean(refreshed.onboarding_complete),
      overlay_layout: nextOverlayLayout,
      overlay_show_tts_status: Boolean(nextOverlayShowTtsStatus),
      overlay_show_twitch_status: Boolean(nextOverlayShowTwitchStatus),
      overlay_show_status: Boolean(nextOverlayShowTtsStatus || nextOverlayShowTwitchStatus),
    })
    setRewardRules(resolvedRewardRules)
    setUserVoiceRules(refreshed.user_voices || {})
    setTheme(normalizedTheme)
    setAccent(nextAccent)

    if (!options.skipSnapshot) {
      syncSavedSnapshot(getSnapshotFromConfig(refreshed, {
        reward_rules: resolvedRewardRules,
        reward_rules_by_user: refreshedRewardRulesByUser,
        user_voices: refreshed.user_voices || {},
        theme: normalizedTheme,
        accent_primary: nextAccent.primary,
        accent_secondary: nextAccent.secondary,
        presets: nextPresets,
        active_preset_id: nextActivePresetId,
        hotkeys: nextHotkeys,
        onboarding_complete: Boolean(refreshed.onboarding_complete),
        twitch_user_id: refreshedUserId,
        overlay_layout: nextOverlayLayout,
        overlay_show_tts_status: Boolean(nextOverlayShowTtsStatus),
        overlay_show_twitch_status: Boolean(nextOverlayShowTwitchStatus),
        overlay_show_status: Boolean(nextOverlayShowTtsStatus || nextOverlayShowTwitchStatus),
      }))
    }
  }, [getSnapshotFromConfig, syncSavedSnapshot])

  useEffect(() => {
    const token = String(config.twitch_oauth || '').trim()
    const userId = String(config.twitch_user_id || '').trim()
    if (!token || userId) return undefined

    let cancelled = false

    const refreshIdentity = async () => {
      const result = await validateTwitchToken(token)
      if (cancelled || !result?.success) return

      const resolvedUserId = String(result.user_id || '').trim()
      if (!resolvedUserId) return

      const nextRewardRulesByUser = {
        ...rewardRulesByUser,
        [resolvedUserId]: rewardRules,
      }

      const saveResult = await saveConfig({
        ...collectConfigPayload(),
        twitch_username: result.username || config.twitch_username || '',
        twitch_user_id: resolvedUserId,
        reward_rules: rewardRules,
        reward_rules_by_user: nextRewardRulesByUser,
      })

      if (!saveResult?.success || cancelled) return
      const refreshed = await getConfig()
      if (cancelled) return
      applyRefreshedConfig(refreshed)
    }

    refreshIdentity()

    return () => {
      cancelled = true
    }
  }, [
    config.twitch_oauth,
    config.twitch_user_id,
    config.twitch_username,
    rewardRules,
    rewardRulesByUser,
    collectConfigPayload,
    applyRefreshedConfig,
  ])

  const buildPresetPayload = useCallback(() => (
    stripPresetPayload(collectConfigPayload())
  ), [collectConfigPayload])

  const buildPresetFilename = useCallback((name) => {
    const safe = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `aether-preset-${safe || 'preset'}.json`
  }, [])

  const downloadPresetFile = useCallback((filename, payload) => {
    if (typeof document === 'undefined') return
    const jsonText = JSON.stringify(payload, null, 2)
    const blob = new Blob([jsonText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [])

  const handleExportPreset = useCallback(async () => {
    const payload = {
      version: 1,
      preset: {
        config: buildPresetPayload(),
        createdAt: new Date().toISOString(),
      },
    }
    const filename = buildPresetFilename('settings')

    if (!isTauriRuntime()) {
      downloadPresetFile(filename, payload)
      pushToast(t('toast_preset_exported', 'Preset file exported successfully.'))
      return
    }

    const result = await exportPresetFile(filename, JSON.stringify(payload, null, 2))
    if (result?.canceled) return

    if (result?.success) {
      pushToast(t('toast_preset_exported', 'Preset file exported successfully.'))
    } else {
      pushToast(t('toast_preset_export_failed', 'Could not export the preset file. Please try again.'), 'error')
    }
  }, [
    buildPresetFilename,
    buildPresetPayload,
    downloadPresetFile,
    pushToast,
    t,
  ])

  const handleImportPreset = useCallback(async () => {
    if (!isTauriRuntime()) {
      pushToast(t('toast_preset_invalid_file', 'The selected preset file is invalid or unsupported.'), 'error')
      return
    }

    const result = await importPresetFile()
    if (result?.canceled) return

    const contents = result?.contents
    if (!result?.success || !contents) {
      pushToast(t('toast_preset_invalid_file', 'The selected preset file is invalid or unsupported.'), 'error')
      return
    }

    let data
    try {
      data = JSON.parse(String(contents || ''))
    } catch {
      pushToast(t('toast_preset_invalid_file', 'The selected preset file is invalid or unsupported.'), 'error')
      return
    }

    const entries = Array.isArray(data)
      ? data
      : Array.isArray(data?.presets)
        ? data.presets
        : data?.preset
          ? [data.preset]
          : [data]

    const candidate = entries.find((entry) => entry && typeof entry === 'object')
    if (!candidate) {
      pushToast(t('toast_preset_invalid_file', 'The selected preset file is invalid or unsupported.'), 'error')
      return
    }

    const presetConfig = candidate?.config && typeof candidate.config === 'object'
      ? candidate.config
      : candidate

    const nextConfig = buildConfigPayload(config, stripPresetPayload(presetConfig))
    const saveResult = await saveConfig(nextConfig)
    if (!saveResult?.success) {
      pushToast(t('toast_preset_import_failed', 'Could not import the preset file. Please try again.'), 'error')
      return
    }

    const refreshed = await getConfig()
    applyRefreshedConfig(refreshed)
    pushToast(t('toast_preset_imported', 'Preset imported successfully.'))
  }, [
    applyRefreshedConfig,
    buildConfigPayload,
    config,
    pushToast,
    t,
  ])

  const handleClearCache = useCallback(() => {
    userAvatarCacheRef.current.clear()
    badgeCatalogRef.current = { global: null, channels: new Map() }
    pushToast(t('toast_cache_cleared', 'Cache cleared successfully.'))
  }, [pushToast, t])

  const handleHotkeyChange = useCallback((key, value) => {
    if (!key) return
    const nextValue = value === undefined || value === null
      ? ''
      : String(value).trim()

    setConfig((previous) => {
      const nextHotkeys = normalizeHotkeys(previous.hotkeys)
      if (Object.prototype.hasOwnProperty.call(nextHotkeys, key)) {
        nextHotkeys[key] = nextValue
      }
      return {
        ...previous,
        hotkeys: nextHotkeys,
      }
    })
  }, [])

  const handleResetHotkeys = useCallback(() => {
    setConfig((previous) => ({
      ...previous,
      hotkeys: { ...DEFAULT_HOTKEYS },
    }))
  }, [])

  useEffect(() => {
    if (!isBootstrappedRef.current || !inputsSyncedRef.current || initialSnapshotSyncedRef.current) {
      return
    }

    const snapshot = stableStringify(buildConfigPayload(config, {}, { useInputs: true }))
    initialSnapshotSyncedRef.current = true
    syncSavedSnapshot(snapshot)
  }, [buildConfigPayload, config, syncSavedSnapshot])

  const updateDirtyState = useCallback(() => {
    if (!isBootstrappedRef.current || !inputsSyncedRef.current || !initialSnapshotSyncedRef.current) return
    const snapshot = stableStringify(buildConfigPayload(config, {}, { useInputs: true }))
    const isDirty = snapshot !== lastSavedSnapshotRef.current
    setHasUnsavedChanges((previous) => (previous === isDirty ? previous : isDirty))
  }, [buildConfigPayload, config])

  useEffect(() => {
    updateDirtyState()
  }, [updateDirtyState])

  useEffect(() => {
    if (!isBootstrappedRef.current) return undefined

    const inputIds = [
      'azure_key',
      'azure_region',
      'voice_name',
      'language_filter',
      'twitch_oauth',
    ]
    const handler = () => updateDirtyState()
    const elements = inputIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)

    elements.forEach((element) => {
      element.addEventListener('input', handler)
      element.addEventListener('change', handler)
    })

    return () => {
      elements.forEach((element) => {
        element.removeEventListener('input', handler)
        element.removeEventListener('change', handler)
      })
    }
  }, [activeSection, updateDirtyState])

  const persistRuleMaps = async (nextRewardRules, nextUserRules, nextRewardRulesByUser) => {
    const result = await saveConfig({
      ...collectConfigPayload(),
      reward_rules: nextRewardRules,
      reward_rules_by_user: nextRewardRulesByUser,
      user_voices: nextUserRules,
    })

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'save_rules_failed',
      }
    }

    const refreshed = await getConfig()
    applyRefreshedConfig(refreshed)

    return { success: true }
  }

  const handleFetchRewards = async () => {
    if (!String(config.twitch_oauth || '').trim()) {
      return {
        success: true,
        rewards: [],
      }
    }

    const response = await fetchTwitchRewards()
    if (response?.success && Array.isArray(response.rewards)) {
      const managedRemoteIds = Object.keys(rewardRules || {})
        .filter((rewardId) => rewardId && !String(rewardId).startsWith('local-'))
      const managedIdSet = new Set(managedRemoteIds)

      const filteredRewards = managedIdSet.size
        ? response.rewards.filter((reward) => managedIdSet.has(String(reward?.id || '')))
        : []

      return {
        success: true,
        rewards: filteredRewards,
      }
    }

    return {
      success: false,
      error: response?.error || 'rewards_fetch_failed',
      rewards: [],
    }
  }

  const handleUpsertRewardRule = async (draft, existingRewardId = null) => {
    const safeCost = Number.parseInt(String(draft?.cost ?? 100), 10) || 100
    const rewardName = (draft?.rewardName || draft?.title || 'Aether TTS').trim() || 'Aether TTS'
    const prompt = (draft?.prompt || 'AetherStream TTS').trim() || 'AetherStream TTS'
    const hasCustomText = Boolean(draft?.useFixText && String(draft?.customText || '').trim())
    const requiresUserInput = !hasCustomText

    const hasTwitchToken = Boolean((config.twitch_oauth || '').trim())
    let rewardId = existingRewardId || draft?.rewardId || ''

    if (hasTwitchToken) {
      if (rewardId && !String(rewardId).startsWith('local-')) {
        const updateResult = await updateTwitchReward({
          rewardId,
          title: rewardName,
          rewardName,
          cost: safeCost,
          prompt,
          is_user_input_required: requiresUserInput,
        })

        if (!updateResult?.success) {
          return {
            success: false,
            error: updateResult?.error || 'reward_update_failed',
          }
        }
      } else {
        const createResult = await createTwitchReward({
          title: rewardName,
          rewardName,
          cost: safeCost,
          prompt,
          is_user_input_required: requiresUserInput,
        })

        if (!createResult?.success) {
          return {
            success: false,
            error: createResult?.error || 'reward_create_failed',
          }
        }

        rewardId = createResult?.reward?.id || rewardId
      }
    }

    if (!rewardId) {
      rewardId = `local-${Date.now()}`
    }

    const selectedVoiceId = String(draft?.voice || config.voice_name || 'en-US-JennyNeural').trim() || 'en-US-JennyNeural'
    const matchedSelectedVoice = Array.isArray(azureVoices)
      ? azureVoices.find((voice) => voice.ShortName === selectedVoiceId)
      : null
    const selectedVoiceLabel = matchedSelectedVoice
      ? formatVoiceLabel(matchedSelectedVoice, t)
      : selectedVoiceId

    const nextRule = {
      rewardId,
      rewardName,
      title: rewardName,
      cost: safeCost,
      prompt,
      langFilter: draft?.langFilter || 'en-US',
      voice: selectedVoiceId,
      voice_label: selectedVoiceLabel,
      style: draft?.style || 'general',
      speed: draft?.speed || '1.0',
      pitch: draft?.pitch || '1.0',
      useFixText: Boolean(draft?.useFixText),
      customText: draft?.customText || '',
    }

    const nextRewardRules = { ...rewardRules }
    if (existingRewardId && existingRewardId !== rewardId) {
      delete nextRewardRules[existingRewardId]
    }
    nextRewardRules[rewardId] = nextRule

    const activeUserId = String(config.twitch_user_id || '').trim()
    const nextRewardRulesByUser = activeUserId
      ? { ...rewardRulesByUser, [activeUserId]: nextRewardRules }
      : rewardRulesByUser

    setRewardRules(nextRewardRules)
    setConfig((previous) => ({
      ...previous,
      reward_rules: nextRewardRules,
      reward_rules_by_user: nextRewardRulesByUser,
    }))

    const persistResult = await persistRuleMaps(
      nextRewardRules,
      userVoiceRules,
      nextRewardRulesByUser,
    )
    if (!persistResult.success) {
      return persistResult
    }

    return {
      success: true,
      rewardId,
      rule: nextRule,
    }
  }

  const handleDeleteRewardRule = async (rewardId) => {
    if (!rewardId) {
      return { success: false, error: 'reward_id_missing' }
    }

    const hasTwitchToken = Boolean((config.twitch_oauth || '').trim())
    if (hasTwitchToken && !String(rewardId).startsWith('local-')) {
      const deleteResult = await deleteTwitchReward(rewardId)
      if (!deleteResult?.success) {
        return {
          success: false,
          error: deleteResult?.error || 'reward_delete_failed',
        }
      }
    }

    const nextRewardRules = { ...rewardRules }
    delete nextRewardRules[rewardId]

    const activeUserId = String(config.twitch_user_id || '').trim()
    const nextRewardRulesByUser = activeUserId
      ? { ...rewardRulesByUser, [activeUserId]: nextRewardRules }
      : rewardRulesByUser

    setRewardRules(nextRewardRules)
    setConfig((previous) => ({
      ...previous,
      reward_rules: nextRewardRules,
      reward_rules_by_user: nextRewardRulesByUser,
    }))

    const persistResult = await persistRuleMaps(
      nextRewardRules,
      userVoiceRules,
      nextRewardRulesByUser,
    )
    if (!persistResult.success) {
      return persistResult
    }

    return { success: true }
  }

  const handleUpsertUserRule = async (username, draft, previousUsername = null) => {
    const normalizedUsername = String(username || '').trim().toLowerCase()
    if (!normalizedUsername) {
      return { success: false, error: 'username_required' }
    }

    const normalizedPrevious = previousUsername
      ? String(previousUsername || '').trim().toLowerCase()
      : ''

    const selectedVoiceId = String(draft?.voice || config.voice_name || 'en-US-JennyNeural').trim() || 'en-US-JennyNeural'
    const matchedSelectedVoice = Array.isArray(azureVoices)
      ? azureVoices.find((voice) => voice.ShortName === selectedVoiceId)
      : null
    const selectedVoiceLabel = matchedSelectedVoice
      ? formatVoiceLabel(matchedSelectedVoice, t)
      : selectedVoiceId

    const nextUserRules = { ...userVoiceRules }
    if (normalizedPrevious && normalizedPrevious !== normalizedUsername) {
      delete nextUserRules[normalizedPrevious]
    }
    nextUserRules[normalizedUsername] = {
      lang: draft?.lang || 'en-US',
      voice: selectedVoiceId,
      voice_label: selectedVoiceLabel,
      style: draft?.style || 'general',
      speed: draft?.speed || '1.0',
      pitch: draft?.pitch || '1.0',
    }

    setUserVoiceRules(nextUserRules)
    setConfig((previous) => ({ ...previous, user_voices: nextUserRules }))

    const persistResult = await persistRuleMaps(rewardRules, nextUserRules, rewardRulesByUser)
    if (!persistResult.success) {
      return persistResult
    }

    return { success: true }
  }

  const handleDeleteUserRule = async (username) => {
    const normalizedUsername = String(username || '').trim().toLowerCase()
    if (!normalizedUsername) {
      return { success: false, error: 'username_required' }
    }

    const nextUserRules = { ...userVoiceRules }
    delete nextUserRules[normalizedUsername]

    setUserVoiceRules(nextUserRules)
    setConfig((previous) => ({ ...previous, user_voices: nextUserRules }))

    const persistResult = await persistRuleMaps(rewardRules, nextUserRules, rewardRulesByUser)
    if (!persistResult.success) {
      return persistResult
    }

    return { success: true }
  }

  const handleRefreshAudioDevices = useCallback(async (options = {}) => {
    const showSuccessToast = Boolean(options?.showSuccessToast)

    if (audioDevicesRefreshLockRef.current) return

    const refreshStartedAt = Date.now()
    audioDevicesRefreshLockRef.current = true
    setIsRefreshingAudioDevices(true)
    setAudioDeviceError('')

    try {
      const devices = await listAudioOutputDevices()

      if (!Array.isArray(devices)) {
        setAudioOutputSupported(false)
        setAudioDevices([])
        setAudioDeviceError(t('audio_devices_unavailable'))
        return
      }

      setAudioOutputSupported(true)

      const outputs = devices
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .map((label) => ({
          deviceId: label,
          label,
        }))

      setAudioDevices(outputs)

      if (showSuccessToast) {
        pushToast(t('audio_refresh_success', 'Device list refreshed successfully.'), 'success')
      }

      if (config.audio_device && config.audio_device !== 'default') {
        const normalizedTarget = String(config.audio_device || '').trim().toLowerCase()
        const exists = outputs.some((device) => device.deviceId.toLowerCase() === normalizedTarget)
        if (!exists) {
          setConfig((previous) => ({
            ...previous,
            audio_device: 'default',
          }))
        }
      }
    } catch (error) {
      setAudioDeviceError(error?.message || t('audio_devices_refresh_failed'))
      setAudioDevices([])
    } finally {
      const elapsedMs = Date.now() - refreshStartedAt
      const minVisibleMs = 450
      const remainingMs = Math.max(0, minVisibleMs - elapsedMs)

      const finishRefreshVisualState = () => {
        if (audioDevicesRefreshTimerRef.current) {
          window.clearTimeout(audioDevicesRefreshTimerRef.current)
          audioDevicesRefreshTimerRef.current = null
        }

        audioDevicesRefreshLockRef.current = false
        setIsRefreshingAudioDevices(false)
      }

      if (remainingMs === 0) {
        finishRefreshVisualState()
      } else {
        if (audioDevicesRefreshTimerRef.current) {
          window.clearTimeout(audioDevicesRefreshTimerRef.current)
        }

        audioDevicesRefreshTimerRef.current = window.setTimeout(() => {
          finishRefreshVisualState()
        }, remainingMs)
      }
    }
  }, [config.audio_device, pushToast, t])

  const handleSelectAudioDevice = useCallback((nextDeviceId) => {
    setConfig((previous) => ({
      ...previous,
      audio_device: nextDeviceId || 'default',
    }))
  }, [])

  const handleLiveTtsChange = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return

    setConfig((previous) => {
      let hasChanges = false
      const next = { ...previous }

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) return
        if (next[key] !== value) {
          next[key] = value
          hasChanges = true
        }
      })

      return hasChanges ? next : previous
    })
  }, [])

  const handleModerationToggle = (key, enabled) => {
    setConfig((previous) => ({
      ...previous,
      [key]: Boolean(enabled),
    }))
  }

  const handleModerationSelectChange = (key, value) => {
    setConfig((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const handleMaxRepetitionChange = (nextValue) => {
    const numericValue = Number.parseInt(String(nextValue), 10)
    const safeValue = Number.isFinite(numericValue)
      ? Math.max(1, Math.min(30, numericValue))
      : 4

    setConfig((previous) => ({
      ...previous,
      max_repetition: safeValue,
    }))
  }

  const handleWordBlacklistChange = (rawText) => {
    setConfig((previous) => ({
      ...previous,
      word_blacklist: parseListFromTextarea(rawText),
    }))
  }

  const handleUserBlacklistChange = (rawText) => {
    setConfig((previous) => ({
      ...previous,
      blacklist: parseListFromTextarea(rawText),
    }))
  }

  const handleToggleObsServer = (enabled) => {
    setConfig((previous) => ({
      ...previous,
      obs_server_enabled: Boolean(enabled),
    }))
  }

  const handleOverlayStatusToggle = (target, enabled) => {
    const isEnabled = Boolean(enabled)

    setConfig((previous) => {
      const nextConfig = { ...previous }

      if (target === 'tts') {
        nextConfig.overlay_show_tts_status = isEnabled
      } else if (target === 'twitch') {
        nextConfig.overlay_show_twitch_status = isEnabled
      } else {
        nextConfig.overlay_show_tts_status = isEnabled
        nextConfig.overlay_show_twitch_status = isEnabled
      }

      const showTtsStatus = Boolean(nextConfig.overlay_show_tts_status ?? previous.overlay_show_status ?? true)
      const showTwitchStatus = Boolean(nextConfig.overlay_show_twitch_status ?? previous.overlay_show_status ?? true)
      nextConfig.overlay_show_status = Boolean(showTtsStatus || showTwitchStatus)

      return nextConfig
    })
  }

  const handleOverlayResolutionChange = (resolution) => {
    setConfig((previous) => ({
      ...previous,
      overlay_resolution: String(resolution || '1080p'),
    }))
  }

  const handleOverlayLayoutChange = (nextLayout) => {
    setConfig((previous) => {
      const normalizedLayout = normalizeOverlayLayout(nextLayout)
      const currentLayout = normalizeOverlayLayout(previous.overlay_layout)
      if (overlayLayoutsEqual(normalizedLayout, currentLayout)) {
        return previous
      }

      return {
        ...previous,
        overlay_layout: normalizedLayout,
      }
    })
  }

  const handleToggleVtsEnabled = (enabled) => {
    const isEnabled = Boolean(enabled)

    setConfig((previous) => ({
      ...previous,
      vts_enabled: isEnabled,
    }))

    if (!isEnabled) {
      disconnectVts()
    }
  }

  const handleVtsPortChange = (nextPort) => {
    const numericPort = Number.parseInt(String(nextPort), 10)
    const safePort = Number.isFinite(numericPort) && numericPort > 0
      ? numericPort
      : 8001

    setConfig((previous) => ({
      ...previous,
      vts_port: safePort,
    }))
  }

  const handleToggleVtsConnection = () => {
    const port = Number.parseInt(getInputValue('vts-port', String(config.vts_port ?? 8001)), 10) || 8001
    const isBusy = vtsConnection.state === 'connecting' || vtsConnection.state === 'authorizing'
    const isConnected = vtsConnection.state === 'connected'

    if (isBusy || isConnected) {
      disconnectVts()
      return
    }

    connectVts({
      port,
      token: config.vts_auth_token || '',
      onToken: (token) => {
        if (!token) return

        setConfig((previous) => ({
          ...previous,
          vts_auth_token: token,
        }))

        void saveConfig({ vts_auth_token: token })
      },
    })
  }

  const handleCopyOverlayUrl = async (url) => {
    const text = String(url || '').trim()
    if (!text) {
      return { success: false, error: 'overlay_url_missing' }
    }

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return { success: true }
      } catch {
        // fallback below
      }
    }

    try {
      const helper = document.createElement('textarea')
      helper.value = text
      helper.setAttribute('readonly', '')
      helper.style.position = 'absolute'
      helper.style.left = '-9999px'
      document.body.appendChild(helper)
      helper.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(helper)

      return copied
        ? { success: true }
        : { success: false, error: 'clipboard_copy_failed' }
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'clipboard_copy_failed',
      }
    }
  }

  const closeSecurityModal = () => {
    setSecurityModal({
      open: false,
      action: null,
      target: null,
      countdown: 0,
      text: '',
      confirmLabel: '',
    })
  }

  const performFactoryReset = async () => {
    const result = await factoryReset()
    if (result?.success) {
      disconnectVts()
      void stopTwitchBot()
      clearTtsQueue()
      setTwitchConnection({ state: 'offline', username: '' })
      logsRef.current = []
      setLogs([])
      setRewardRules({})
      setUserVoiceRules({})
      const refreshed = await getConfig()
      applyRefreshedConfig(refreshed)
    }
  }

  const confirmSecurityAction = async () => {
    if (securityModal.action === 'reveal') {
      setSensitiveVisibility((previous) => ({
        ...previous,
        [securityModal.target]: true,
      }))
      closeSecurityModal()
      return
    }

    if (securityModal.action === 'reset') {
      closeSecurityModal()
      await performFactoryReset()
      return
    }

    if (securityModal.action === 'clear_cache') {
      closeSecurityModal()
      handleClearCache()
      return
    }

    if (securityModal.action === 'animations') {
      setConfig((previous) => ({
        ...previous,
        performance_mode: false,
      }))
      closeSecurityModal()
      return
    }

    if (securityModal.action === 'close_app') {
      closeSecurityModal()
      allowWindowCloseRef.current = true
      const result = await exitApplication()
      if (!result?.success) {
        allowWindowCloseRef.current = false
        pushToast(t('toast_app_close_failed', 'The app could not be closed automatically. Please close it manually.'), 'error')
      }
      return
    }

    closeSecurityModal()
  }

  const handleToggleSensitiveField = (target) => {
    const isVisible = Boolean(sensitiveVisibility?.[target])
    if (isVisible) {
      setSensitiveVisibility((previous) => ({
        ...previous,
        [target]: false,
      }))
      return
    }

    setSecurityModal({
      open: true,
      action: 'reveal',
      target,
      countdown: 5,
      text: target === 'azure' ? t('warning_azure_text') : t('warning_token_text'),
      confirmLabel: '',
    })
  }

  const handleRequestFactoryReset = () => {
    setSecurityModal({
      open: true,
      action: 'reset',
      target: null,
      countdown: 10,
      text: t('warning_reset_text'),
      confirmLabel: '',
    })
  }

  const handleRequestClearCache = useCallback(() => {
    setSecurityModal((previous) => {
      if (previous?.open && previous?.action === 'clear_cache') {
        return previous
      }

      return {
        open: true,
        action: 'clear_cache',
        target: null,
        countdown: 0,
        text: t('warning_cache_clear_text', 'Clear avatar and badge cache now?'),
        confirmLabel: t('cache_clear_action'),
      }
    })
  }, [t])

  const handleRequestCloseApp = useCallback(() => {
    setSecurityModal((previous) => {
      if (previous?.open && previous?.action === 'close_app') {
        return previous
      }

      return {
        open: true,
        action: 'close_app',
        target: null,
        countdown: 0,
        text: t('warning_close_text', 'Are you sure you want to close the application?'),
        confirmLabel: t('tooltip_close'),
      }
    })
  }, [t])

  useEffect(() => {
    if (!isTauriRuntime()) return undefined

    let disposed = false
    let unlisten = null

    const attach = async () => {
      const cleanup = await onWindowCloseRequested((event) => {
        if (allowWindowCloseRef.current) {
          allowWindowCloseRef.current = false
          return
        }

        event?.preventDefault?.()
        handleRequestCloseApp()
      })

      if (disposed) {
        if (typeof cleanup === 'function') cleanup()
        return
      }

      unlisten = cleanup
    }

    void attach()

    return () => {
      disposed = true
      if (typeof unlisten === 'function') {
        unlisten()
      }
    }
  }, [handleRequestCloseApp])

  const validateAzureConfig = useCallback(async (azureKey, azureRegion, { showStatus = true } = {}) => {
    hideMessageBox('azure-status-box')

    if (!azureKey || !azureRegion) {
      if (showStatus) {
        pushToast(t('err_missing_data'), 'error')
      }
      return { success: false, error: 'err_missing_data' }
    }

    setIsValidatingAzure(true)

    try {
      const result = await validateAzureAndFetchVoices(azureKey, azureRegion)

      if (!result?.success) {
        const errorKey = result?.error || 'err_azure_invalid'
        if (showStatus) {
          pushToast(t(errorKey), 'error')
        }
        setAzureVoices([])
        return { success: false, error: errorKey }
      }

      const voices = Array.isArray(result.voices) ? result.voices : []
      setAzureVoices(voices)

      const preferredVoice = voices.find((voice) => voice.ShortName === config.voice_name)?.ShortName
        || voices[0]?.ShortName
        || config.voice_name
        || ''

      const saveResult = await saveConfig({
        azure_key: azureKey,
        azure_region: azureRegion,
        voice_name: preferredVoice,
      })

      if (!saveResult?.success) {
        const errorKey = saveResult?.error || 'err_azure_invalid'
        if (showStatus) {
          pushToast(t(errorKey), 'error')
        }
        return { success: false, error: errorKey }
      }

      const refreshed = await getConfig()
      applyRefreshedConfig(refreshed)

      if (showStatus) {
        pushToast(t('toast_azure_validated', 'Azure connection was validated successfully.'))
      }

      return { success: true, voices }
    } finally {
      setIsValidatingAzure(false)
    }
  }, [applyRefreshedConfig, config.voice_name, pushToast, t])

  const handleValidateAzure = async () => {
    const azureKey = getInputValue('azure_key', config.azure_key || '').trim()
    const azureRegion = getInputValue('azure_region', config.azure_region || 'westeurope').trim()

    await validateAzureConfig(azureKey, azureRegion, { showStatus: true })
  }

  const handleSetupSubmit = async () => {
    if (isSetupSaving) return

    const azureKey = String(setupKey || '').trim()
    const azureRegion = String(setupRegion || 'westeurope').trim()

    if (!azureKey || !azureRegion) {
      setSetupError(t('err_missing_data'))
      return
    }

    setIsSetupSaving(true)
    setSetupError('')

    const result = await validateAzureConfig(azureKey, azureRegion, { showStatus: false })
    if (result?.success) {
      setIsSetupOpen(false)
      setSetupKey('')
      setSetupError('')
    } else {
      setSetupError(t(result?.error || 'err_azure_invalid'))
    }

    setIsSetupSaving(false)
  }

  const handleOnboardingDone = async () => {
    const result = await saveConfig({
      ...collectConfigPayload(),
      onboarding_complete: true,
    })

    if (!result?.success) {
      pushToast(t('toast_onboarding_save_failed', 'Could not complete onboarding. Please try again.'), 'error')
      return
    }

    const refreshed = await getConfig()
    applyRefreshedConfig(refreshed)
  }

  const handleSave = async () => {
    if (saveFeedbackTimerRef.current) {
      window.clearTimeout(saveFeedbackTimerRef.current)
      saveFeedbackTimerRef.current = null
    }
    setSaveFeedbackVisible(false)
    setSaveState({ busy: true, label: t('saving_btn') })
    hideMessageBox('twitch-error-box')

    const result = await saveConfig(collectConfigPayload())
    if (result?.success) {
      const refreshed = await getConfig()
      applyRefreshedConfig(refreshed)
      pushToast(t('toast_saved'))
      setSaveState({ busy: false, label: t('save_feedback_done', 'Saved') })
      setSaveFeedbackVisible(true)
      saveFeedbackTimerRef.current = window.setTimeout(() => {
        setSaveFeedbackVisible(false)
        setSaveState({ busy: false, label: t('save_btn') })
        saveFeedbackTimerRef.current = null
      }, 1400)
      return
    }

    if (result?.source === 'azure') {
      pushToast(t(result.error || 'err_azure_invalid'), 'error')
    } else if (result?.source === 'twitch') {
      showMessageBox('twitch-error-box', 'twitch-error-text', t(result.error || 'err_twitch_invalid'))
    }

    setSaveState({ busy: false, label: t('save_btn') })
  }

  const handleTestTts = useCallback(async (overrides = {}) => {
    const azureKey = getInputValue('azure_key', config.azure_key || '').trim()
    const azureRegion = getInputValue('azure_region', config.azure_region || 'westeurope').trim()
    const needsValidation = !azureKey
      || !azureRegion
      || azureKey !== (config.azure_key || '')
      || azureRegion !== (config.azure_region || '')

    if (needsValidation) {
      const validation = await validateAzureConfig(azureKey, azureRegion, { showStatus: true })
      if (!validation?.success) {
        return
      }
    }

    const rawVoice = overrides.voice
      || getInputValue('voice_name', config.voice_name || 'en-US-JennyNeural')
    const rawSpeed = overrides.speed
      || getInputValue('main_speed', config.global_speed || '1.0')
    const rawPitch = overrides.pitch
      || getInputValue('main_pitch', config.global_pitch || '1.0')
    const rawStyle = overrides.style
      || getInputValue('main_style', config.global_style || 'general')

    const liveTtsConfig = {
      voice_name: String(rawVoice || '').trim() || config.voice_name || 'en-US-JennyNeural',
      global_speed: String(rawSpeed || '').trim() || config.global_speed || '1.0',
      global_pitch: String(rawPitch || '').trim() || config.global_pitch || '1.0',
      global_style: String(rawStyle || '').trim() || config.global_style || 'general',
      volume: Math.max(
        0,
        Math.min(
          100,
          Number.parseInt(
            overrides.volume ?? getInputValue('volume', String(config.volume ?? 50)),
            10,
          ) || 50,
        ),
      ),
    }

    if (!Object.keys(overrides).length) {
      handleLiveTtsChange(liveTtsConfig)
    }

    setShowTtsOverlay(true)

    const defaultTestMessage = getDefaultTestMessage(appLanguage, liveTtsConfig.voice_name)
    const rawTestMessage = String(t('test_msg_text', defaultTestMessage)).trim()
    const testMessage = rawTestMessage || defaultTestMessage

    let result = null
    try {
      result = await enqueueTts(testMessage, {
        voice: liveTtsConfig.voice_name,
        rate: liveTtsConfig.global_speed,
        pitch: liveTtsConfig.global_pitch,
        style: liveTtsConfig.global_style,
      })
    } finally {
      setShowTtsOverlay(false)
    }

    if (!result?.success) {
      pushToast(t(result?.error || 'err_unknown'), 'error')
    }
  }, [
    appLanguage,
    config.azure_key,
    config.azure_region,
    config.global_pitch,
    config.global_speed,
    config.global_style,
    config.voice_name,
    config.volume,
    handleLiveTtsChange,
    pushToast,
    t,
    validateAzureConfig,
  ])

  const handlePreviewVoice = async (options = {}) => {
    await handleTestTts(options)
  }

  useEffect(() => {
    if (!hotkeys) return
    const handler = (event) => {
      if (isEditableTarget(event.target)) return
      const combo = getHotkeyStringFromEvent(event)
      if (!combo) return

      const normalizedCombo = combo.toLowerCase()
      const matches = (value) => String(value || '').toLowerCase() === normalizedCombo

      if (matches(hotkeys.toggle_pause)) {
        event.preventDefault()
        if (isPaused) {
          void resumeTtsQueue()
        } else {
          pauseTtsQueue()
        }
        return
      }

      if (matches(hotkeys.skip)) {
        event.preventDefault()
        skipTtsQueue()
        return
      }

      if (matches(hotkeys.clear)) {
        event.preventDefault()
        clearTtsQueue()
        return
      }

      if (matches(hotkeys.test_tts)) {
        event.preventDefault()
        void handleTestTts()
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [hotkeys, isPaused, handleTestTts])

  const handleConnectTwitch = async () => {
    hideMessageBox('twitch-error-box')
    if (!TWITCH_CLIENT_ID) {
      showMessageBox('twitch-error-box', 'twitch-error-text', t('err_twitch_client_id_missing'))
      setTwitchConnection({ state: 'offline', username: '' })
      return
    }
    setTwitchConnection({
      state: 'connecting',
      username: config.twitch_username || '',
    })

    const previousUserId = String(config.twitch_user_id || '').trim()
    const nextRewardRulesByUser = previousUserId
      ? { ...rewardRulesByUser, [previousUserId]: rewardRules }
      : rewardRulesByUser

    const result = await twitchLogin(TWITCH_CLIENT_ID)

    if (!result?.success || !result?.token) {
      showMessageBox(
        'twitch-error-box',
        'twitch-error-text',
        t(result?.error || 'err_twitch_invalid')
      )
      setTwitchConnection({ state: 'offline', username: '' })
      return
    }

    const token = result.token
    const username = result.username || ''
    const userId = String(result.user_id || '').trim()

    setInputValue('twitch_oauth', token)

    const nextRewardRules = userId
      ? resolveRewardRulesForUser(nextRewardRulesByUser, userId)
      : rewardRules

    const saveResult = await saveConfig({
      ...collectConfigPayload(),
      reward_rules: nextRewardRules,
      reward_rules_by_user: nextRewardRulesByUser,
      twitch_oauth: token,
      twitch_username: username,
      twitch_user_id: userId,
    })

    if (!saveResult?.success) {
      showMessageBox('twitch-error-box', 'twitch-error-text', t(saveResult?.error || 'err_twitch_invalid'))
      setTwitchConnection({ state: 'offline', username: '' })
      return
    }

    const refreshed = await getConfig()
    applyRefreshedConfig(refreshed)
    setTwitchConnection({
      state: 'connecting',
      username: refreshed.twitch_username || username,
    })
    const connectedUsername = String(refreshed.twitch_username || username).trim()
    if (connectedUsername) {
      pushToast(`${t('toast_twitch_connected_as', 'Successfully connected to Twitch as')} ${connectedUsername}.`)
    } else {
      pushToast(t('toast_twitch_connected', 'Successfully connected to Twitch.'))
    }
  }

  const handleDisconnectTwitch = async () => {
    hideMessageBox('twitch-error-box')
    setInputValue('twitch_oauth', '')
    setTwitchConnection({ state: 'offline', username: '' })
    void stopTwitchBot()

    const activeUserId = String(config.twitch_user_id || '').trim()
    const nextRewardRulesByUser = activeUserId
      ? { ...rewardRulesByUser, [activeUserId]: rewardRules }
      : rewardRulesByUser

    const saveResult = await saveConfig({
      ...collectConfigPayload(),
      reward_rules: rewardRules,
      reward_rules_by_user: nextRewardRulesByUser,
      twitch_oauth: '',
      twitch_username: '',
      twitch_user_id: '',
    })

    if (!saveResult?.success) {
      showMessageBox('twitch-error-box', 'twitch-error-text', t(saveResult?.error || 'err_twitch_invalid'))
      return
    }

    const refreshed = await getConfig()
    applyRefreshedConfig(refreshed)
  }

  const handleTogglePause = async () => {
    if (isPaused) {
      await resumeTtsQueue()
    } else {
      pauseTtsQueue()
    }
  }

  const handleSkip = async () => {
    skipTtsQueue()
  }

  const handleClear = async () => {
    clearTtsQueue()
  }

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme)
  }

  const handleAccentChange = (primary, secondary) => {
    setAccent({ primary, secondary })
  }

  const handleAnimationsToggle = (enabled) => {
    if (enabled) {
      if (!performanceMode) return
      if (securityModal?.open) return

      setSecurityModal({
        open: true,
        action: 'animations',
        target: null,
        countdown: 5,
        text: t('warning_animations_text'),
        confirmLabel: t('btn_enable'),
      })
      return
    }

    setConfig((previous) => ({
      ...previous,
      performance_mode: true,
    }))
  }

  const checkForUpdates = useCallback(async ({ openModal = false, silentError = false } = {}) => {
    const owner = GITHUB_REPO_OWNER
    const repo = GITHUB_REPO_NAME
    const currentVersion = normalizeReleaseVersion(appVersion || '0.0.0') || '0.0.0'

    if (!owner || !repo) {
      const repoError = t('update_repo_missing', 'A GitHub repository nincs beállítva a frissítésellenőrzéshez.')
      if (openModal) {
        setUpdateModal((previous) => ({
          ...previous,
          open: true,
          loading: false,
          hasUpdate: false,
          currentVersion,
          latestVersion: '',
          releaseUrl: '',
          installerUrl: '',
          installerName: '',
          changelog: '',
          error: repoError,
        }))
      }
      return { success: false, error: repoError }
    }

    setUpdateModal((previous) => ({
      ...previous,
      open: openModal || previous.open,
      loading: true,
      error: '',
    }))

    try {
      const releaseResult = await getLatestGithubRelease(owner, repo)
      if (!releaseResult?.success) {
        const rawErrorCode = String(releaseResult?.error || '').trim()
        throw new Error(rawErrorCode || 'update_check_failed')
      }

      const latestVersion = normalizeReleaseVersion(
        releaseResult?.latest_version
          || releaseResult?.tag
          || releaseResult?.latestVersion
          || '',
      )
      if (!latestVersion) {
        throw new Error('update_latest_version_missing')
      }

      const releaseUrl = String(
        releaseResult?.release_url
          || releaseResult?.html_url
          || `https://github.com/${owner}/${repo}/releases`,
      ).trim()
      const installerUrl = String(releaseResult?.installer_url || '').trim()
      const installerName = String(releaseResult?.installer_name || '').trim()
      const changelog = String(releaseResult?.changelog || '').trim()
      const hasUpdate = latestVersion !== currentVersion

      setUpdateModal((previous) => ({
        ...previous,
        open: hasUpdate || openModal,
        loading: false,
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl,
        installerUrl,
        installerName,
        changelog,
        error: '',
      }))

      return {
        success: true,
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl,
        installerUrl,
        installerName,
        changelog,
      }
    } catch (error) {
      const rawCode = String(error?.message || '').trim()
      const updateError = t(rawCode || 'update_check_failed', t('update_check_failed', 'Nem sikerült lekérdezni a frissítéseket.'))
      setUpdateModal((previous) => ({
        ...previous,
        open: openModal || previous.open,
        loading: false,
        hasUpdate: false,
        currentVersion,
        latestVersion: '',
        releaseUrl: '',
        installerUrl: '',
        installerName: '',
        changelog: '',
        error: updateError,
      }))

      if (!silentError && !openModal) {
        pushToast(updateError, 'error')
      }

      return { success: false, error: updateError }
    }
  }, [appVersion, pushToast, t])

  const handleRequestUpdateCheck = useCallback(async () => {
    await checkForUpdates({ openModal: true, silentError: false })
  }, [checkForUpdates])

  const handleCloseUpdateModal = useCallback(() => {
    setUpdateModal((previous) => ({
      ...previous,
      open: false,
      loading: false,
      error: '',
    }))
  }, [])

  const handleConfirmUpdate = useCallback(async () => {
    const installerUrl = String(updateModal.installerUrl || '').trim()
    const installerName = String(updateModal.installerName || '').trim()

    if (!installerUrl) {
      const noInstallerError = t('update_no_installer', 'No Windows installer asset was found in the latest release.')
      setUpdateModal((previous) => ({ ...previous, error: noInstallerError }))
      pushToast(noInstallerError, 'error')
      return
    }

    setUpdateModal((previous) => ({
      ...previous,
      loading: true,
      error: '',
    }))

    const result = await downloadAndRunInstaller(installerUrl, installerName)
    if (!result?.success) {
      const installError = t('update_install_failed', 'The installer download or launch failed.')
      setUpdateModal((previous) => ({
        ...previous,
        loading: false,
        error: installError,
      }))
      pushToast(installError, 'error')
      return
    }

    pushToast(t('update_install_started', 'The installer has started. The application will close for update.'), 'success')
  }, [downloadAndRunInstaller, pushToast, t, updateModal.installerName, updateModal.installerUrl])

  useEffect(() => {
    if (hasAutoUpdateCheckRef.current) return
    if (!isConfigReady) return
    if (showLoader) return
    if (isSetupOpen) return
    if (!config.onboarding_complete) return

    hasAutoUpdateCheckRef.current = true
    void checkForUpdates({ openModal: false, silentError: true })
  }, [checkForUpdates, config.onboarding_complete, isConfigReady, isSetupOpen, showLoader])

  const handleSectionChange = (nextSection) => {
    setActiveSection(nextSection)
    closeSecurityModal()
  }

  useEffect(() => {
    if (!isConfigReady || hasInitializedAudioDevicesRef.current) return

    hasInitializedAudioDevicesRef.current = true
    void handleRefreshAudioDevices()
  }, [handleRefreshAudioDevices, isConfigReady])

  const handleLanguageChange = (nextLang) => {
    const normalizedLang = normalizeAppLanguage(nextLang || 'en')

    try {
      window.localStorage.setItem('aether_app_lang', normalizedLang)
    } catch {
      // ignore storage access failures
    }

    setConfig((previous) => ({
      ...previous,
      app_lang: normalizedLang,
    }))
  }

  const contentClassName = useMemo(() => 'content-area flex-1 h-full overflow-y-auto relative content-visible', [])
  const overlayToken = String(config.overlay_token || '').trim()
  const overlayUrl = useMemo(() => {
    const baseUrl = 'http://127.0.0.1:8080'
    if (!overlayToken) return baseUrl
    return `${baseUrl}/?token=${encodeURIComponent(overlayToken)}`
  }, [overlayToken])
  const showAzureSetup = isConfigReady && isSetupOpen
  const showOnboarding = isConfigReady && !showAzureSetup && !config.onboarding_complete
  const showSaveIndicator = isConfigReady
    && isBootstrappedRef.current
    && inputsSyncedRef.current
    && (hasUnsavedChanges || saveFeedbackVisible)
    && !showAzureSetup
    && !showOnboarding
  const showSaveSuccess = saveState.label === t('save_feedback_done', 'Saved')

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f0f]">
      <SetupOverlays
        t={t}
        showAzureSetup={showAzureSetup}
        showOnboarding={showOnboarding}
        setupKey={setupKey}
        setupRegion={setupRegion}
        setupError={setupError}
        isSubmitting={isSetupSaving || isValidatingAzure}
        onSetupKeyChange={setSetupKey}
        onSetupRegionChange={setSetupRegion}
        onSubmitSetup={handleSetupSubmit}
        onOnboardingDone={handleOnboardingDone}
      />
      <UtilityOverlays
        showTtsOverlay={showTtsOverlay}
        securityModal={securityModal}
        onCancelSecurity={closeSecurityModal}
        onConfirmSecurity={confirmSecurityAction}
        t={t}
      />
      <UpdateModal
        open={updateModal.open}
        loading={updateModal.loading}
        hasUpdate={updateModal.hasUpdate}
        currentVersion={updateModal.currentVersion}
        latestVersion={updateModal.latestVersion}
        changelog={updateModal.changelog}
        error={updateModal.error}
        onClose={handleCloseUpdateModal}
        onConfirmUpdate={handleConfirmUpdate}
        onRefresh={handleRequestUpdateCheck}
        t={t}
      />

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.tone}`} role="status">
            <div className="toast-content">
              <span>{toast.message}</span>
              <button
                type="button"
                className="toast-close"
                aria-label={t('tooltip_close')}
                onClick={() => dismissToast(toast.id)}
              >
                <X className="toast-close-icon" />
              </button>
            </div>
            <div className="toast-progress" />
          </div>
        ))}
      </div>

      <TitleBar onMinimize={minimizeWindow} onMaximize={toggleMaximizeWindow} onClose={handleRequestCloseApp} t={t} />
      {!showAzureSetup && (
        <>
          <Sidebar
            activeSection={activeSection}
            onSelectSection={handleSectionChange}
            appVersion={appVersion}
            twitchConnection={twitchConnection}
            ttsState={ttsState}
            t={t}
          />

          <main className={contentClassName}>
            <div className="max-w-4xl mx-auto pb-10">
              <SectionRenderer
                activeSection={activeSection}
                t={t}
                appLang={appLanguage}
                onLanguageChange={handleLanguageChange}
                onValidateAzure={handleValidateAzure}
                onToggleSensitiveField={handleToggleSensitiveField}
                showAzureKey={sensitiveVisibility.azure}
                isValidatingAzure={isValidatingAzure}
                onThemeChange={handleThemeChange}
                onAccentChange={handleAccentChange}
                animationsEnabled={animationsEnabled}
                onAnimationsToggle={handleAnimationsToggle}
                onTestTts={handleTestTts}
                onPreviewVoice={handlePreviewVoice}
                onLiveTtsChange={handleLiveTtsChange}
                onConnectTwitch={handleConnectTwitch}
                onDisconnectTwitch={handleDisconnectTwitch}
                showTwitchToken={sensitiveVisibility.twitch}
                onTogglePause={handleTogglePause}
                onSkip={handleSkip}
                onClear={handleClear}
                isPaused={isPaused}
                hotkeys={hotkeys}
                onHotkeyChange={handleHotkeyChange}
                onClearHotkey={handleResetHotkeys}
                audioDevices={audioDevices}
                selectedAudioDevice={config.audio_device || 'default'}
                onSelectAudioDevice={handleSelectAudioDevice}
                onRefreshAudioDevices={handleRefreshAudioDevices}
                isRefreshingAudioDevices={isRefreshingAudioDevices}
                audioOutputSupported={audioOutputSupported}
                audioDeviceError={audioDeviceError}
                onRequestFactoryReset={handleRequestFactoryReset}
                twitchConnection={twitchConnection}
                logs={logs}
                ttsState={ttsState}
                rewardRules={rewardRules}
                userVoiceRules={userVoiceRules}
                azureVoices={azureVoices}
                onFetchRewards={handleFetchRewards}
                onUpsertRewardRule={handleUpsertRewardRule}
                onDeleteRewardRule={handleDeleteRewardRule}
                onUpsertUserRule={handleUpsertUserRule}
                onDeleteUserRule={handleDeleteUserRule}
                config={config}
                onExportPreset={handleExportPreset}
                onImportPreset={handleImportPreset}
                onRequestClearCache={handleRequestClearCache}
                onCheckForUpdates={handleRequestUpdateCheck}
                isCheckingForUpdates={updateModal.loading}
                onModerationToggle={handleModerationToggle}
                onModerationSelectChange={handleModerationSelectChange}
                onMaxRepetitionChange={handleMaxRepetitionChange}
                onWordBlacklistChange={handleWordBlacklistChange}
                onUserBlacklistChange={handleUserBlacklistChange}
                overlayUrl={overlayUrl}
                vtsConnection={vtsConnection}
                onToggleObsServer={handleToggleObsServer}
                onOverlayStatusToggle={handleOverlayStatusToggle}
                onOverlayResolutionChange={handleOverlayResolutionChange}
                onOverlayLayoutChange={handleOverlayLayoutChange}
                onToggleVtsEnabled={handleToggleVtsEnabled}
                onVtsPortChange={handleVtsPortChange}
                onToggleVtsConnection={handleToggleVtsConnection}
                onCopyOverlayUrl={handleCopyOverlayUrl}
                onToast={pushToast}
              />

            </div>
          </main>
        </>
      )}

      <button
        id="floating-save"
        type="button"
        onClick={handleSave}
        disabled={!hasUnsavedChanges || saveState.busy}
        className={`floating-save ${showSaveIndicator ? 'is-visible' : ''} ${saveState.busy ? 'is-busy' : ''} ${showSaveSuccess ? 'is-success' : ''} ${hasUnsavedChanges ? 'is-dirty' : ''}`}
        aria-label={saveState.label}
        title={saveState.label}
      >
        {saveState.busy ? (
          <Loader2 className="save-icon" />
        ) : showSaveSuccess ? (
          <Check className="save-icon" />
        ) : (
          <Save className="save-icon" />
        )}
      </button>
    </div>
  )
}

export default App
