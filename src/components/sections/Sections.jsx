import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot,
  Copy,
  Eye,
  Gem,
  Heart,
  Mic,
  Star,
  Music,
  Pencil,
  Play,
  RefreshCw,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Github,
  Globe,
  Twitch,
  User,
  Users,
  X,
} from 'lucide-react'
import { SiDiscord } from 'react-icons/si'
import {
  APP_LANGUAGE_OPTIONS,
  AZURE_REGIONS,
  AZURE_STYLE_IDS,
} from '../../i18n/translations'
import LICENSE_TEXT from '../../../LICENSE?raw'
import { openExternalUrl } from '../../services/tauriApi'

function SectionTitle({ children, danger = false }) {
  return (
    <h2 className={`section-title-main ${danger ? 'text-red-500' : ''}`}>{children}</h2>
  )
}

// (refs created inside component)

function LinkCard({ href, title, description, icon: IconComponent, disabled = false }) {
  const content = (
    <div className={`link-card flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${disabled ? 'opacity-50' : ''}`} style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
          <IconComponent className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          <span>{title}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <ExternalLink className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
    </div>
  )

  if (disabled || !href) {
    return <div>{content}</div>
  }
  
  const handleClick = async (event) => {
    event.preventDefault()
    await openExternalUrl(href)
  }

  const handleKeyDown = async (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      await openExternalUrl(href)
    }
  }

  return (
    <a href={href} onClick={handleClick} onKeyDown={handleKeyDown} role="link" tabIndex={0} className="block cursor-pointer" rel="noreferrer">
      {content}
    </a>
  )
}

function VtsChannelIcon({ channelKey }) {
  if (channelKey === 'mouth_smile') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12c0 4.2 3.1 7 7 7s7-2.8 7-7" />
        <path d="M6.5 10h11" />
      </svg>
    )
  }

  if (channelKey === 'jaw_open') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 8c0-2.8 2.2-5 5-5s5 2.2 5 5" />
        <path d="M6 13v2.5c0 3 2.4 5.5 5.5 5.5h1c3.1 0 5.5-2.5 5.5-5.5V13" />
        <path d="M6 13h12" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12.5" rx="5" ry="7" />
    </svg>
  )
}

const HOTKEY_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

const formatHotkeyKey = (key) => {
  if (!key) return ''
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1)
}

const getHotkeyStringFromEvent = (event) => {
  const key = event?.key
  if (!key || HOTKEY_MODIFIERS.has(key)) return ''

  const parts = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(formatHotkeyKey(key))
  return parts.join('+')
}

function HotkeyInput({ value, onChange, t }) {
  const [isRecording, setIsRecording] = useState(false)
  const displayValue = isRecording
    ? t('hotkey_listening')
    : (value || t('hotkey_unassigned'))

  return (
    <input
      type="text"
      value={displayValue}
      onFocus={() => setIsRecording(true)}
      onBlur={() => setIsRecording(false)}
      onKeyDown={(event) => {
        event.preventDefault()

        if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete') {
          onChange?.('')
          setIsRecording(false)
          return
        }

        const combo = getHotkeyStringFromEvent(event)
        if (!combo) return
        onChange?.(combo)
        setIsRecording(false)
      }}
      readOnly
      className={`hotkey-input ${isRecording ? 'recording' : ''}`}
    />
  )
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
    'hu-HU': 'Magyar (Magyarország)',
    'en-US': 'Angol (Egyesült Államok)',
    'de-DE': 'Német (Németország)',
    'es-ES': 'Spanyol (Spanyolország)',
    'fr-FR': 'Francia (Franciaország)',
  },
  de: {
    'hu-HU': 'Ungarisch (Ungarn)',
    'en-US': 'Englisch (Vereinigte Staaten)',
    'de-DE': 'Deutsch (Deutschland)',
    'es-ES': 'Spanisch (Spanien)',
    'fr-FR': 'Französisch (Frankreich)',
  },
  es: {
    'hu-HU': 'Húngaro (Hungría)',
    'en-US': 'Inglés (Estados Unidos)',
    'de-DE': 'Alemán (Alemania)',
    'es-ES': 'Español (España)',
    'fr-FR': 'Francés (Francia)',
  },
  fr: {
    'hu-HU': 'Hongrois (Hongrie)',
    'en-US': 'Anglais (Etats-Unis)',
    'de-DE': 'Allemand (Allemagne)',
    'es-ES': 'Espagnol (Espagne)',
    'fr-FR': 'Français (France)',
  },
}

const LANGUAGE_OPTIONS = ['hu-HU', 'en-US', 'de-DE', 'es-ES', 'fr-FR']

const capitalizeLabel = (label) => {
  const text = String(label || '').trim()
  if (!text) return ''
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

const VOICE_NAME_OVERRIDES = {
  'hu-HU-NoemiNeural': 'Noémi',
  'hu-HU-TamasNeural': 'Tamás',
}

const hasStyleSupport = (voices, locale) => {
  if (!Array.isArray(voices) || voices.length === 0) return true

  const normalizedLocale = String(locale || '').toLowerCase()
  const matchingVoices = normalizedLocale
    ? voices.filter((voice) => String(voice.Locale || '').toLowerCase().startsWith(normalizedLocale))
    : voices

  if (!matchingVoices.length) return false

  return matchingVoices.some((voice) => Array.isArray(voice.StyleList) && voice.StyleList.length > 0)
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

const getLocaleOptionsFromVoices = (voices, fallbackOptions = LANGUAGE_OPTIONS, currentValue = '') => {
  const options = []
  const seen = new Set()

  const addLocale = (locale) => {
    const normalized = String(locale || '').trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    options.push(normalized)
  }

  if (Array.isArray(voices)) {
    voices.forEach((voice) => addLocale(voice?.Locale))
  }

  if (!options.length && Array.isArray(fallbackOptions)) {
    fallbackOptions.forEach((locale) => addLocale(locale))
  }

  addLocale(currentValue)

  return options.sort((left, right) => left.localeCompare(right))
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

const stripVoiceLocaleSuffix = (label) => (
  String(label || '')
    .replace(/\s*•\s*[A-Za-z]{2,3}-[A-Za-z]{2,4}\s*$/, '')
    .trim()
)

const getLocaleFromVoiceShortName = (voiceId) => {
  const parts = String(voiceId || '').trim().split('-')
  if (parts.length < 2 || !parts[0] || !parts[1]) return ''
  return `${parts[0]}-${parts[1]}`
}

const createRewardDraft = (defaultVoice, defaultLocale = 'en-US') => ({
  rewardId: '',
  rewardName: 'Aether TTS',
  cost: 100,
  prompt: 'AetherStream TTS',
  langFilter: defaultLocale || 'en-US',
  voice: defaultVoice || 'en-US-JennyNeural',
  style: 'general',
  speed: '1.0',
  pitch: '1.0',
  useFixText: false,
  customText: '',
})

const createUserDraft = (defaultVoice, defaultLocale = 'en-US') => ({
  username: '',
  lang: defaultLocale || 'en-US',
  voice: defaultVoice || 'en-US-JennyNeural',
  style: 'general',
  speed: '1.0',
  pitch: '1.0',
})

const formatVoiceSummary = (rule = {}, azureVoices, t) => {
  const voiceId = String(rule.voice || '').trim()
  const savedVoiceLabel = stripVoiceLocaleSuffix(rule.voice_label)
  const speed = String(rule.speed || '1.0')
  const pitch = String(rule.pitch || '1.0')
  const styleKey = String(rule.style || 'general')

  const styleLabel = t(`style_${styleKey}`, styleKey)
  const matched = Array.isArray(azureVoices)
    ? azureVoices.find((voice) => voice.ShortName === voiceId)
    : null

  if (!voiceId) {
    return `${t('no_voice_selected')} • ${speed}x (${t('lbl_speed')}) • ${pitch} (${t('lbl_pitch')}) • ${styleLabel}`
  }

  if (savedVoiceLabel) {
    const currentVoiceLabel = matched ? (formatVoiceLabel(matched, t) || voiceId) : savedVoiceLabel
    return `${currentVoiceLabel} • ${speed}x (${t('lbl_speed')}) • ${pitch} (${t('lbl_pitch')}) • ${styleLabel}`
  }

  if (!matched) {
    return `${voiceId} • ${speed}x (${t('lbl_speed')}) • ${pitch} (${t('lbl_pitch')}) • ${styleLabel}`
  }

  const voiceLabel = formatVoiceLabel(matched, t) || voiceId

  return `${voiceLabel} • ${speed}x (${t('lbl_speed')}) • ${pitch} (${t('lbl_pitch')}) • ${styleLabel}`
}

const buildEmoteParts = (text, emotes) => {
  const safeText = String(text ?? '')
  if (!safeText) return []

  if (!emotes || typeof emotes !== 'object') {
    return [{ type: 'text', value: safeText }]
  }

  const ranges = []
  Object.entries(emotes).forEach(([id, positions]) => {
    if (!Array.isArray(positions)) return
    positions.forEach((range, index) => {
      const [start, end] = String(range).split('-').map(Number)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return
      ranges.push({
        id,
        start,
        end,
        key: `${id}-${index}`,
      })
    })
  })

  if (!ranges.length) {
    return [{ type: 'text', value: safeText }]
  }

  ranges.sort((left, right) => left.start - right.start)

  const parts = []
  let cursor = 0

  ranges.forEach((range) => {
    if (range.start > cursor) {
      parts.push({ type: 'text', value: safeText.slice(cursor, range.start) })
    }
    parts.push({ type: 'emote', id: range.id, key: range.key })
    cursor = Math.max(cursor, range.end + 1)
  })

  if (cursor < safeText.length) {
    parts.push({ type: 'text', value: safeText.slice(cursor) })
  }

  return parts
}
const renderEmoteText = (text, emotes) => {
  const parts = buildEmoteParts(text, emotes)
  if (!parts.length) return null

  return parts.map((part, index) => {
    if (part.type === 'text') {
      return part.value
    }

    return (
      <img
        key={part.key || `emote-${index}`}
        src={`https://static-cdn.jtvnw.net/emoticons/v2/${part.id}/default/dark/3.0`}
        alt=""
        className="log-emote"
      />
    )
  })
}

function EditorModal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  isSubmitting,
  cancelLabel = 'CANCEL',
  savingLabel = 'SAVING...',
  children,
}) {
  const modal = (
    <div className="fixed inset-0 overlay-mask modal-active p-4">
      <div className="modal-card w-full max-w-2xl p-8 rounded-2xl shadow-2xl text-left flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
          <h3 className="font-bold text-xl text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="editor-close-btn cursor-pointer hover:text-red-500 transition-colors"
            aria-label="Close editor"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-4">{children}</div>

          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="btn-shine py-3 rounded-xl font-bold bg-[#333] hover:bg-[#444] text-white transition-colors uppercase tracking-wider">
              {cancelLabel}
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary py-3 rounded-xl font-bold text-white shadow-lg shadow-sky-500/20 uppercase tracking-wider disabled:opacity-70">
              {isSubmitting ? savingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modal
  }

  return createPortal(modal, document.body)
}

function ConfirmModal({
  title,
  text,
  confirmLabel,
  cancelLabel,
  isBusy,
  onConfirm,
  onCancel,
}) {
  const modal = (
    <div id="confirm-modal-overlay" className="fixed inset-0 overlay-mask modal-active p-4">
      <div className="modal-card p-8 rounded-2xl text-center shadow-2xl max-w-md w-full">
        <div className="mx-auto bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
        </div>
        <h3 className="font-bold text-xl mb-2">{title}</h3>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">{text}</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn-shine py-3 rounded-lg font-bold bg-[#333] hover:bg-[#444] text-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            id="confirm-modal-ok"
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="btn-shine py-3 rounded-lg font-bold bg-red-600 hover:bg-red-700 disabled:bg-red-900/50 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modal
  }

  return createPortal(modal, document.body)
}

export function AzureSection({
  onValidateAzure,
  onToggleSensitiveField,
  onLiveTtsChange,
  onPreviewVoice,
  isValidatingAzure,
  showAzureKey,
  config,
  azureVoices,
  t,
}) {
  const styleSupported = hasStyleSupport(azureVoices, config?.language_filter)
  const isStyleDisabled = !styleSupported

  return (
    <div id="section-azure" className="tab-content">
      <SectionTitle>{t('title_azure')}</SectionTitle>

      <div className="grid gap-6">
        <section className="card flex flex-col gap-6">
          <div>
            <label className="label-text mb-1 block">{t('azure_key')}</label>
            <div className="relative">
              <input type={showAzureKey ? 'text' : 'password'} id="azure_key" className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none font-mono text-sm input-icon-space" placeholder={t('key_ph')} />
              <button
                type="button"
                onClick={() => onToggleSensitiveField?.('azure')}
                className="input-aux-btn absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                title={t('btn_show')}
              >
                <Eye className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">{t('key_help')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label-text mb-1 block">{t('region')}</label>
              <select id="azure_region" className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer">
                {AZURE_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>{region.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">{t('region_help')}</p>
            </div>
            <div>
              <label className="label-text mb-1 block">{t('language')}</label>
              <select id="language_filter" className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer">
                <option value="">-</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-1">{t('filter_help')}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <label className="label-text m-0">{t('default_voice')}</label>
              <button
                type="button"
                onClick={() => {
                  const voiceSelect = document.getElementById('voice_name')
                  const selectedVoice = voiceSelect?.value || config?.voice_name || ''
                  onPreviewVoice?.({
                    voice: selectedVoice,
                    style: config?.global_style || 'general',
                    speed: config?.global_speed || '1.0',
                    pitch: config?.global_pitch || '1.0',
                  })
                }}
                className="btn-secondary btn-compact rounded-lg"
              >
                <Play className="w-4 h-4" />
                {t('voice_preview')}
              </button>
            </div>
            <select id="voice_name" className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer" />
            <p className="text-[10px] text-gray-500 mt-1">{t('voice_help')}</p>
          </div>

          <div className={`mt-4 ${isStyleDisabled ? 'style-disabled' : ''}`}>
            <label className="label-text mb-1 block">{t('modal_reward_style_label')}</label>
            <select
              id="main_style"
              disabled={isStyleDisabled}
              onChange={(event) => onLiveTtsChange?.({ global_style: event.target.value })}
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer"
            >
              {AZURE_STYLE_IDS.map((styleId) => (
                <option key={styleId} value={styleId}>{t(`style_${styleId}`, styleId)}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">{t('azure_style_desc')}</p>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-4">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="label-text m-0">{t('lbl_speed')}</label>
                <span id="disp_main_speed" className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">1x</span>
              </div>
              <input
                type="range"
                id="main_speed"
                min="0.5"
                max="2.0"
                step="0.1"
                defaultValue={config?.global_speed || '1.0'}
                className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                onInput={(event) => {
                  const value = Number.parseFloat(event.currentTarget.value)
                  const badge = document.getElementById('disp_main_speed')
                  if (badge) badge.innerText = `${value}x`
                  const percent = ((value - 0.5) / 1.5) * 100
                  event.currentTarget.style.setProperty('--percent', `${Math.max(0, Math.min(100, percent))}%`)
                  onLiveTtsChange?.({ global_speed: event.currentTarget.value })
                }}
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                <span>{t('val_slow')}</span>
                <span>{t('val_fast')}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="label-text m-0">{t('lbl_pitch')}</label>
                <span id="disp_main_pitch" className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">1</span>
              </div>
              <input
                type="range"
                id="main_pitch"
                min="0.5"
                max="2.0"
                step="0.1"
                defaultValue={config?.global_pitch || '1.0'}
                className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                onInput={(event) => {
                  const value = Number.parseFloat(event.currentTarget.value)
                  const badge = document.getElementById('disp_main_pitch')
                  if (badge) badge.innerText = `${value}`
                  const percent = ((value - 0.5) / 1.5) * 100
                  event.currentTarget.style.setProperty('--percent', `${Math.max(0, Math.min(100, percent))}%`)
                  onLiveTtsChange?.({ global_pitch: event.currentTarget.value })
                }}
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                <span>{t('val_low')}</span>
                <span>{t('val_high')}</span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button
              id="btn-validate-azure"
              type="button"
              onClick={onValidateAzure}
              disabled={isValidatingAzure}
              className="btn-primary w-full py-3 rounded-xl text-white uppercase tracking-wider shadow-lg shadow-sky-500/20 disabled:opacity-70"
            >
              {isValidatingAzure ? t('processing') : t('validate_btn')}
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}

export function TwitchSection({ onConnectTwitch, onDisconnectTwitch, onToggleSensitiveField, twitchConnection, showTwitchToken, t }) {
  const isOnline = twitchConnection?.state === 'online'
  const isConnecting = twitchConnection?.state === 'connecting'
  const handleAuthClick = isOnline ? onDisconnectTwitch : onConnectTwitch

  return (
    <div id="section-twitch" className="tab-content">
      <SectionTitle>{t('title_twitch')}</SectionTitle>
      <section className="card flex flex-col gap-6">
        <div>
          <div id="twitch-error-box" className="hidden bg-red-500/10 border border-red-500/50 text-red-500 text-xs py-3 px-4 rounded-lg text-left mb-4">
            <span className="font-bold">{t('error')}:</span> <span className="font-bold" id="twitch-error-text" />
          </div>
          <label className="label-text">{t('oauth_label', 'OAuth Token')}</label>
          <div className="flex gap-3">
            <div className="relative flex-grow">
              <input type={showTwitchToken ? 'text' : 'password'} id="twitch_oauth" className="w-full cursor-not-allowed bg-black/40 text-gray-400 input-icon-space" readOnly placeholder={t('oauth_ph')} />
              <button
                type="button"
                onClick={() => onToggleSensitiveField?.('twitch')}
                className="input-aux-btn absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                title={t('btn_show')}
              >
                <Eye className="w-5 h-5" />
              </button>
            </div>
            <button
              id="btn-twitch-connect"
              onClick={handleAuthClick}
              disabled={isConnecting}
              className={`btn-primary text-white px-5 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 whitespace-nowrap shadow-lg ${
                isOnline ? 'is-connected' : ''
              } ${isConnecting ? 'opacity-80 cursor-wait' : ''}`}
            >
              <Twitch className="w-4 h-4" />
              <span id="lbl-twitch-connect">
                {isConnecting ? t('status_connecting') : isOnline ? t('btn_logged_in') : t('btn_connect_twitch')}
              </span>
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{t('token_help')}</p>
        </div>
      </section>
    </div>
  )
}

export function AudioSection({
  onTogglePause,
  onSkip,
  onClear,
  isPaused,
  ttsState,
  audioDevices = [],
  selectedAudioDevice,
  volumeValue = 50,
  onSelectAudioDevice,
  onRefreshAudioDevices,
  isRefreshingAudioDevices = false,
  audioOutputSupported,
  audioDeviceError,
  onLiveTtsChange,
  hotkeys,
  onHotkeyChange,
  onClearHotkey,
  onTestTts,
  t,
}) {
  const status = ttsState?.status || 'IDLE'
  const queueCount = ttsState?.count ?? 0

  const statusDotClass =
    status === 'PLAYING'
      ? 'bg-emerald-500 animate-pulse'
      : status === 'PAUSED'
        ? 'bg-yellow-500'
        : 'bg-gray-500'

  return (
    <div id="section-audio" className="tab-content">
      <SectionTitle>{t('title_audio')}</SectionTitle>
      <div className="grid gap-6">
        <section className="card">
          <label className="label-text">{t('output_device')}</label>
          <div className="flex gap-3">
            <select
              id="audio_output"
              className="flex-grow"
              value={selectedAudioDevice}
              onChange={(event) => onSelectAudioDevice?.(event.target.value)}
            >
              <option value="default">{t('audio_device_default')}</option>
              {audioDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
              ))}
              {!audioDevices.length && (
                <option value="__none" disabled>{t('audio_device_none')}</option>
              )}
            </select>
            <button
              type="button"
              onClick={() => onRefreshAudioDevices?.({ showSuccessToast: true })}
              disabled={isRefreshingAudioDevices}
              aria-busy={isRefreshingAudioDevices}
              className="px-4 py-2 rounded-lg btn-secondary audio-refresh-btn disabled:opacity-70 disabled:cursor-not-allowed"
              title={isRefreshingAudioDevices ? t('processing', 'Processing...') : t('audio_refresh')}
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshingAudioDevices ? 'animate-spin audio-refresh-icon-loading' : ''}`} />
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{t('output_help')}</p>
          {!audioOutputSupported && (
            <p className="text-[10px] text-yellow-400 mt-1">{t('audio_not_supported')}</p>
          )}
          {!!audioDeviceError && (
            <p className="text-[10px] text-red-400 mt-1">{audioDeviceError}</p>
          )}
        </section>

        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <label className="label-text m-0">{t('volume')}</label>
            <span className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">
              <span id="vol_val">50</span>%
            </span>
          </div>
          <input
            type="range"
            id="volume"
            min="0"
            max="100"
            defaultValue={volumeValue}
            className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            onInput={(event) => {
              const value = Number.parseFloat(event.currentTarget.value)
              const safeValue = Number.isFinite(value)
                ? Math.max(0, Math.min(100, Math.round(value)))
                : 50
              const badge = document.getElementById('vol_val')
              if (badge) badge.innerText = String(event.currentTarget.value)
              event.currentTarget.style.setProperty('--percent', `${Math.max(0, Math.min(100, value || 0))}%`)
              onLiveTtsChange?.({ volume: safeValue })
            }}
          />

          <button id="test-tts" onClick={onTestTts} className="btn-primary w-full py-4 mt-6 text-sm font-semibold rounded-xl shadow-lg group">
            <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span>{t('test_btn')}</span>
          </button>
        </section>

        <section className="card">
          <label className="label-text mb-2">{t('hotkeys_title')}</label>
          <p className="text-[10px] text-gray-500 mb-4">{t('hotkeys_help')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-semibold">{t('hotkey_pause')}</span>
              <HotkeyInput
                value={hotkeys?.toggle_pause || ''}
                onChange={(value) => onHotkeyChange?.('toggle_pause', value)}
                t={t}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold">{t('hotkey_skip')}</span>
              <HotkeyInput
                value={hotkeys?.skip || ''}
                onChange={(value) => onHotkeyChange?.('skip', value)}
                t={t}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold">{t('hotkey_clear')}</span>
              <HotkeyInput
                value={hotkeys?.clear || ''}
                onChange={(value) => onHotkeyChange?.('clear', value)}
                t={t}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold">{t('hotkey_test')}</span>
              <HotkeyInput
                value={hotkeys?.test_tts || ''}
                onChange={(value) => onHotkeyChange?.('test_tts', value)}
                t={t}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => onClearHotkey?.()}
              className="btn-secondary btn-compact rounded-lg"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('hotkey_reset')}</span>
            </button>
          </div>
        </section>

        <section className="card">
          <label className="label-text mb-4">{t('queue_controls')}</label>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <button id="btn-pause-resume" onClick={onTogglePause} className={`rounded-xl font-bold border transition-all flex items-center justify-center ${isPaused ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/30'}`}>
              <span className="text-xs tracking-wider">{isPaused ? t('btn_resume') : t('btn_pause')}</span>
            </button>
            <button onClick={onSkip} className="rounded-xl font-bold bg-sky-500/20 text-sky-500 border border-sky-500/30 hover:bg-sky-500/30 transition-all flex items-center justify-center">
              <span className="text-xs tracking-wider">{t('btn_skip')}</span>
            </button>
            <button onClick={onClear} className="rounded-xl font-bold bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30 transition-all flex items-center justify-center">
              <span className="text-xs tracking-wider">{t('btn_clear')}</span>
            </button>
          </div>

          <div className="status-card p-4 rounded-xl flex justify-between items-center transition-colors">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{t('status_label')}</div>
              <div id="player-status" className="text-white font-mono font-bold text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                <span>
                  {status === 'PLAYING'
                    ? t('status_playing')
                    : status === 'PAUSED'
                      ? t('status_paused')
                      : t('status_idle')}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{t('queue_label')}</div>
              <div id="queue-count" className="text-white font-mono font-bold text-lg">{queueCount}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export function RewardsSection({
  rewardRules,
  azureVoices,
  appLang,
  defaultVoice: preferredVoice,
  defaultLocale: preferredLocale,
  twitchConnection,
  onFetchRewards,
  onUpsertRewardRule,
  onDeleteRewardRule,
  t,
  onToast,
}) {
  const defaultVoice = useMemo(() => {
    const normalizedPreferred = String(preferredVoice || '').trim()
    if (normalizedPreferred) return normalizedPreferred
    return 'en-US-JennyNeural'
  }, [preferredVoice])
  const draftLocale = useMemo(() => {
    const localeFromVoice = getLocaleFromVoiceShortName(defaultVoice)
    if (localeFromVoice) return localeFromVoice
    return String(preferredLocale || '').trim() || 'en-US'
  }, [defaultVoice, preferredLocale])
  const isTwitchLoggedIn = twitchConnection?.state === 'online'
  const isCreateDisabled = !isTwitchLoggedIn
  const rewardEntries = useMemo(
    () => Object.entries(rewardRules || {}).sort((left, right) => left[0].localeCompare(right[0])),
    [rewardRules],
  )

  // Recalculate summaries whenever t changes to ensure language updates
  const rewardSummaries = useMemo(() => {
    const summaries = {}
    Object.entries(rewardRules || {}).forEach(([rewardId, rule]) => {
      summaries[rewardId] = formatVoiceSummary(rule, azureVoices, t)
    })
    return summaries
  }, [rewardRules, azureVoices, t])

  const [_availableRewards, setAvailableRewards] = useState([])
  const [isLoadingRewards, setIsLoadingRewards] = useState(false)
  const [isSavingRule, setIsSavingRule] = useState(false)
  const [modalError, setModalError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingRewardId, setEditingRewardId] = useState(null)
  const [form, setForm] = useState(() => createRewardDraft(defaultVoice, draftLocale))

  const voicesForLanguage = useMemo(() => {
    const languagePrefix = String(form.langFilter || '').toLowerCase()
    const matchingVoices = (azureVoices || []).filter((voice) =>
      String(voice.Locale || '').toLowerCase().startsWith(languagePrefix),
    )
    return matchingVoices.length ? matchingVoices : azureVoices || []
  }, [azureVoices, form.langFilter])

  const rewardSpeedValue = Number.parseFloat(String(form.speed ?? '1')) || 1
  const rewardPitchValue = Number.parseFloat(String(form.pitch ?? '1')) || 1
  const rewardSpeedPercent = ((Math.min(Math.max(rewardSpeedValue, 0.5), 2) - 0.5) / 1.5) * 100
  const rewardPitchPercent = ((Math.min(Math.max(rewardPitchValue, 0.5), 2) - 0.5) / 1.5) * 100
  const rewardStyleSupported = hasStyleSupport(azureVoices, form.langFilter)
  const isRewardStyleDisabled = !rewardStyleSupported
  const rewardLanguageOptions = useMemo(
    () => getLocaleOptionsFromVoices(azureVoices, LANGUAGE_OPTIONS, form.langFilter),
    [azureVoices, form.langFilter],
  )

  

  useEffect(() => {
    if (!isRewardStyleDisabled) return
    // When style support is disabled we need to coerce the form to a supported style.
    // This setState is intentional and safe — suppress the specific rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((previous) => {
      if (String(previous.style || 'general') === 'general') {
        return previous
      }
      return {
        ...previous,
        style: 'general',
      }
    })
  }, [isRewardStyleDisabled])

  const refreshRewards = async (options = {}) => {
    const showSuccessToast = options.showSuccessToast !== false
    const showErrorToast = options.showErrorToast !== false

    if (!onFetchRewards) {
      return
    }
    if (!isTwitchLoggedIn) {
      return
    }

    setIsLoadingRewards(true)

    const result = await onFetchRewards()

    if (result?.success) {
      const refreshedCount = String(result.rewards?.length || 0)
      setAvailableRewards(result.rewards || [])
      if (showSuccessToast) {
        onToast?.(`${t('rewards_refresh_success', 'Rewards list refreshed successfully.')} (${refreshedCount})`)
      }
    } else {
      setAvailableRewards([])
      if (showErrorToast) {
        onToast?.(result?.error || t('rewards_refresh_failed', 'Could not refresh the rewards list.'), 'error')
      }
    }

    setIsLoadingRewards(false)
  }

  const openCreateEditor = () => {
    if (isCreateDisabled) return
    setEditingRewardId(null)
    setForm(createRewardDraft(defaultVoice, draftLocale))
    setModalError('')
    setIsEditorOpen(true)
  }

  const openEditEditor = (rewardId, rule) => {
    const resolvedVoice = rule?.voice || defaultVoice
    setEditingRewardId(rewardId)
    setForm({
      ...createRewardDraft(defaultVoice, draftLocale),
      ...rule,
      rewardId,
      rewardName: rule?.rewardName || rule?.title || '',
      cost: Number.parseInt(String(rule?.cost ?? 100), 10) || 100,
      useFixText: Boolean(rule?.useFixText),
      voice: resolvedVoice,
    })
    setModalError('')
    setIsEditorOpen(true)
  }

  const handleSaveRule = async (event) => {
    event.preventDefault()

    const rewardName = String(form.rewardName || '').trim()
    if (!rewardName) {
      setModalError(`${t('modal_reward_name_label')}!`)
      return
    }

    setIsSavingRule(true)

    const resolvedVoice = form.voice || defaultVoice
    const result = await onUpsertRewardRule?.(
      {
        ...form,
        rewardName,
        voice: resolvedVoice,
      },
      editingRewardId,
    )

    if (result?.success) {
      onToast?.(
        editingRewardId
          ? t('reward_rule_updated_success', 'Reward rule updated successfully.')
          : t('reward_rule_created_success', 'Reward rule created successfully.'),
      )
      setModalError('')
      setIsEditorOpen(false)
      setEditingRewardId(null)
      await refreshRewards({ showSuccessToast: false, showErrorToast: false })
    } else {
      setModalError(result?.error || t('rewards_fail'))
    }

    setIsSavingRule(false)
  }

  const handleDeleteRule = (rewardId, rewardName) => {
    if (!rewardId) return
    setPendingDelete({ rewardId, rewardName })
  }

  const confirmDeleteRule = async () => {
    if (!pendingDelete?.rewardId) return

    setIsSavingRule(true)
    const result = await onDeleteRewardRule?.(pendingDelete.rewardId)

    if (result?.success) {
      onToast?.(t('reward_rule_deleted_success', 'Reward rule deleted successfully.'))
      await refreshRewards({ showSuccessToast: false, showErrorToast: false })
    } else {
      onToast?.(result?.error || t('reward_rule_delete_failed', 'Could not delete the reward rule.'), 'error')
    }

    setIsSavingRule(false)
    setPendingDelete(null)
  }

  return (
    <div id="section-rewards" className="tab-content">
      <SectionTitle>{t('title_rewards')}</SectionTitle>
      <div className="section-lock-wrapper">
        <div className={`grid gap-6 ${isCreateDisabled ? 'section-lock-content' : ''}`}>
          <section className="card">
          <div className="flex items-center justify-between mb-4">
            <label className="label-text">{t('rewards_list')}</label>
            <button
              type="button"
              onClick={() => refreshRewards({ showSuccessToast: true, showErrorToast: true })}
              disabled={isLoadingRewards || isCreateDisabled}
              className="btn-secondary btn-compact rounded-lg"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingRewards ? 'animate-spin' : ''}`} />
              <span>{isLoadingRewards ? `${t('btn_refresh')}...` : t('btn_refresh')}</span>
            </button>
          </div>

          <div id="reward-rules-list" className="space-y-4 mb-6">
            {!rewardEntries.length && (
              <div id="rewards-empty-msg" className="text-center text-gray-500 p-8 italic">
                {t('no_rewards_msg')}
              </div>
            )}

            {rewardEntries.map(([rewardId, rule]) => {
              const summary = rewardSummaries[rewardId] || formatVoiceSummary(rule, azureVoices, t)
              const rewardName = rule.rewardName || rule.title || t('new_reward_title')

              return (
                <div key={rewardId} className="card p-4 flex items-center justify-between gap-4 group transition-all reward-rule-row">
                  <div className="flex items-center gap-4 overflow-hidden flex-grow min-w-0">
                    <div className="p-2 row-icon-bg rounded-lg shadow-sm shrink-0">
                      <Mic className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="reward-name-text truncate text-sm font-semibold">{rewardName}</span>
                      <span className="text-xs text-gray-500 truncate">{summary}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditEditor(rewardId, rule)}
                      disabled={isCreateDisabled}
                      className="btn-edit p-2 btn-icon-accent"
                      title={t('action_edit')}
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rewardId, rewardName)}
                      disabled={isSavingRule || isCreateDisabled}
                      className="btn-delete p-2 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-70"
                      title={t('action_delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={openCreateEditor}
            disabled={isCreateDisabled}
            className="font-bold text-sm transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
            title={isCreateDisabled ? t('btn_connect_twitch') : undefined}
            style={{
              background: isCreateDisabled ? 'none' : 'var(--brand-gradient)',
              WebkitBackgroundClip: isCreateDisabled ? 'initial' : 'text',
              WebkitTextFillColor: isCreateDisabled ? 'var(--text-muted)' : 'transparent',
              backgroundSize: isCreateDisabled ? 'auto' : '200% auto',
              animation: isCreateDisabled ? 'none' : 'gradient-flow 3s linear infinite',
              color: isCreateDisabled ? 'var(--text-muted)' : undefined,
              cursor: isCreateDisabled ? 'not-allowed' : 'pointer',
              opacity: isCreateDisabled ? 0.5 : 1,
            }}
          >
            {t('add_reward')}
          </button>
          </section>
        </div>
        {isCreateDisabled && (
          <div className="section-lock-overlay" role="status" aria-live="polite">
            <div className="section-lock-card">
              <p className="text-sm font-semibold">{t('rewards_locked')}</p>
            </div>
          </div>
        )}
      </div>

      {isEditorOpen && (
        <EditorModal
          title={editingRewardId ? t('edit_reward') : t('create_reward')}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingRewardId(null)
          }}
          onSubmit={handleSaveRule}
          submitLabel={editingRewardId ? t('update_action') : t('create_action')}
          isSubmitting={isSavingRule}
          cancelLabel={t('modal_btn_cancel')}
          savingLabel={t('saving_btn')}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="label-text text-xs uppercase font-bold text-gray-400 mb-1 block">{t('modal_reward_name_label')}</label>
              <input
                type="text"
                value={form.rewardName}
                placeholder={t('modal_reward_name_ph')}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setForm((previous) => ({ ...previous, rewardName: value }))
                }}
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none"
              />
            </div>
            <div>
              <label className="label-text text-xs uppercase font-bold text-gray-400 mb-1 block">{t('modal_reward_cost_label')}</label>
              <input
                type="number"
                min="1"
                value={form.cost}
                placeholder={t('modal_reward_cost_ph')}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setForm((previous) => ({ ...previous, cost: value }))
                }}
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none"
              />
            </div>
          </div>
          <div className="voice-settings-panel p-4 rounded-xl">
            <div className="voice-settings-title mb-2 text-xs uppercase font-bold text-gray-400">{t('modal_audio_settings')}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-text text-[10px] opacity-70 mb-1 block">{t('modal_lang_filter')}</label>
                  <select
                    value={form.langFilter}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      const supportsStyle = hasStyleSupport(azureVoices, value)
                      // choose first matching voice for the newly selected language if available
                      const matching = (azureVoices || []).filter((voice) => String(voice.Locale || '').toLowerCase().startsWith(String(value || '').toLowerCase()))
                      const chosenVoice = matching.length ? matching[0].ShortName : (form.voice || defaultVoice)
                      setForm((previous) => ({
                        ...previous,
                        langFilter: value,
                        style: supportsStyle ? previous.style : 'general',
                        voice: chosenVoice,
                      }))
                    }}
                    className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                  >
                    {rewardLanguageOptions.map((language) => (
                      <option key={language} value={language}>{formatLocaleLabel(language, appLang)}</option>
                    ))}
                  </select>
              </div>

              <div>
                <label className="label-text text-[10px] opacity-70 mb-1 block">{t('modal_voice_select')}</label>
                <select
                  value={form.voice || defaultVoice}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setForm((previous) => ({ ...previous, voice: value }))
                  }}
                  className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                >
                  {voicesForLanguage.map((voice) => (
                    <option key={voice.ShortName} value={voice.ShortName}>
                      {formatVoiceLabel(voice, t) || voice.ShortName}
                    </option>
                  ))}
                </select>
              </div>

              <div className={`md:col-span-2 mt-2 ${isRewardStyleDisabled ? 'style-disabled' : ''}`}>
                <label className="label-text text-[10px] opacity-70 mb-1 block">{t('reward_style')}</label>
                <select
                  value={form.style}
                  disabled={isRewardStyleDisabled}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setForm((previous) => ({ ...previous, style: value }))
                  }}
                  className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                >
                  {AZURE_STYLE_IDS.map((styleName) => (
                    <option key={styleName} value={styleName}>{t(`style_${styleName}`, styleName)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="label-text m-0">{t('modal_speed')}</label>
                <span className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">{rewardSpeedValue.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                step="0.1"
                min="0.5"
                max="2.0"
                value={form.speed}
                onInput={(event) => {
                  const value = event.currentTarget?.value ?? ''
                  setForm((previous) => ({ ...previous, speed: value }))
                }}
                className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{ '--percent': `${rewardSpeedPercent}%` }}
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                <span>{t('val_slow')}</span>
                <span>{t('val_fast')}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="label-text m-0">{t('modal_pitch')}</label>
                <span className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">{rewardPitchValue.toFixed(1)}</span>
              </div>
              <input
                type="range"
                step="0.1"
                min="0.5"
                max="2.0"
                value={form.pitch}
                onInput={(event) => {
                  const value = event.currentTarget?.value ?? ''
                  setForm((previous) => ({ ...previous, pitch: value }))
                }}
                className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{ '--percent': `${rewardPitchPercent}%` }}
              />
              <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                <span>{t('val_low')}</span>
                <span>{t('val_high')}</span>
              </div>
            </div>
          </div>

          <div className="w-full mt-2">
            <label className="label-text text-xs uppercase font-bold text-gray-400 mb-1 block">{t('modal_reward_desc_label')}</label>
            <textarea
              rows={2}
              value={form.prompt}
              placeholder={t('modal_reward_desc_ph')}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((previous) => ({ ...previous, prompt: value }))
              }}
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none resize-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <span className="text-sm font-semibold">{t('modal_custom_text_toggle')}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useFixText}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    setForm((previous) => ({ ...previous, useFixText: checked }))
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
              </label>
            </div>

            {form.useFixText && (
              <div className="space-y-2">
                <p className="text-[10px] opacity-50">{t('modal_custom_text_help')}</p>
                <textarea
                  rows={3}
                  value={form.customText}
                  placeholder={t('modal_custom_text_ph')}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setForm((previous) => ({ ...previous, customText: value }))
                  }}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 resize-none"
                />
              </div>
            )}
          </div>

                

          {modalError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs py-3 px-4 rounded-lg text-left">
              <span className="font-bold">{t('error')}:</span> {modalError}
            </div>
          )}
        </EditorModal>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('warning_title')}
          text={t('confirm_reward_delete')}
          confirmLabel={t('btn_delete')}
          cancelLabel={t('btn_cancel')}
          isBusy={isSavingRule}
          onConfirm={confirmDeleteRule}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

export function AppearanceSection({
  appLang,
  onLanguageChange,
  onThemeChange,
  onAccentChange,
  animationsEnabled,
  onAnimationsToggle,
  trayEnabled,
  onTrayToggle,
  t,
}) {
  const themeOptions = [
    {
      id: 'default',
      label: t('theme_default'),
      variant: 'dark',
      preview: {
        bg: '#0f0f0f',
        panel: '#121212',
        card: '#181818',
        input: '#222222',
        border: '#282828',
        text: '#e0e0e0',
        muted: '#949ba4',
      },
    },
    {
      id: 'slate',
      label: t('theme_slate'),
      variant: 'dark',
      preview: {
        bg: '#0b0f14',
        panel: '#121822',
        card: '#182130',
        input: '#212b3a',
        border: '#2a384a',
        text: '#e6edf7',
        muted: '#9aa7bd',
      },
    },
    {
      id: 'ink',
      label: t('theme_ink'),
      variant: 'dark',
      preview: {
        bg: '#140f1f',
        panel: '#1b1529',
        card: '#241c36',
        input: '#2d2342',
        border: '#3b2f58',
        text: '#f2eaff',
        muted: '#b4a1d1',
      },
    },
    {
      id: 'green',
      label: t('theme_green'),
      variant: 'dark',
      preview: {
        bg: '#0f1511',
        panel: '#172019',
        card: '#1f2a22',
        input: '#243529',
        border: '#2f4233',
        text: '#e6f2ea',
        muted: '#9bb7a5',
      },
    },
    {
      id: 'paper',
      label: t('theme_paper'),
      variant: 'light',
      preview: {
        bg: '#f5f6f8',
        panel: '#ffffff',
        card: '#ffffff',
        input: '#eef0f3',
        border: '#d7dbe1',
        text: '#1f2430',
        muted: '#6b7380',
      },
    },
    {
      id: 'warm',
      label: t('theme_warm'),
      variant: 'light',
      preview: {
        bg: '#faf3ea',
        panel: '#fff8f1',
        card: '#f6ede1',
        input: '#eadcc9',
        border: '#ddcbb5',
        text: '#3b2a1c',
        muted: '#7a6654',
      },
    },
    {
      id: 'sage',
      label: t('theme_sage'),
      variant: 'light',
      preview: {
        bg: '#f1f6f1',
        panel: '#f9fcf7',
        card: '#eaf2e8',
        input: '#dde8da',
        border: '#c7d5c2',
        text: '#213022',
        muted: '#697a6b',
      },
    },
    {
      id: 'glacier',
      label: t('theme_glacier'),
      variant: 'light',
      preview: {
        bg: '#eef5fb',
        panel: '#f8fbff',
        card: '#e9f1fb',
        input: '#dbe7f5',
        border: '#c4d3e6',
        text: '#1e2a38',
        muted: '#6b7c92',
      },
    },
  ]

  const accentOptions = [
    {
      id: 'default',
      primary: '#00f2ff',
      secondary: '#a800ff',
      preview: 'radial-gradient(circle at 22% 25%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 34%), linear-gradient(145deg, #00f2ff 0%, #6f5dff 52%, #a800ff 100%)',
    },
    {
      id: 'volcano',
      primary: '#ff3b30',
      secondary: '#ff9f0a',
      preview: 'radial-gradient(circle at 24% 24%, rgba(255,240,220,0.45) 0%, rgba(255,240,220,0) 34%), linear-gradient(138deg, #ff2d55 0%, #ff3b30 38%, #ff6a00 72%, #ffb703 100%)',
    },
    {
      id: 'aurora',
      primary: '#14b866',
      secondary: '#2dd4bf',
      preview: 'radial-gradient(circle at 72% 26%, rgba(220,255,245,0.4) 0%, rgba(220,255,245,0) 35%), linear-gradient(142deg, #0f9d58 0%, #14b866 48%, #2dd4bf 100%)',
    },
    {
      id: 'ultraviolet',
      primary: '#5f0fff',
      secondary: '#ff3cac',
      preview: 'radial-gradient(circle at 70% 24%, rgba(255,220,246,0.35) 0%, rgba(255,220,246,0) 34%), linear-gradient(150deg, #3912a5 0%, #5f0fff 48%, #ff3cac 100%)',
    },
    {
      id: 'sunburst',
      primary: '#ffd60a',
      secondary: '#f97316',
      preview: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 32%), linear-gradient(132deg, #ffe45e 0%, #ffd60a 42%, #ff9f1c 76%, #f97316 100%)',
    },
    {
      id: 'neon',
      primary: '#ff006e',
      secondary: '#7dff00',
      preview: 'radial-gradient(circle at 76% 22%, rgba(235,255,220,0.35) 0%, rgba(235,255,220,0) 34%), linear-gradient(132deg, #ff006e 0%, #ff4f98 44%, #8cff00 78%, #7dff00 100%)',
    },
  ]

  return (
    <div id="section-appearance" className="tab-content">
      <SectionTitle>{t('title_visuals')}</SectionTitle>
      <div className="grid gap-6">
        <section className="card">
          <label className="label-text mb-2">{t('app_lang')}</label>
          <select
            id="app_lang_select"
            value={appLang}
            onChange={(event) => onLanguageChange?.(event.target.value)}
            className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer"
          >
            {APP_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-gray-500 mt-1">{t('lang_help')}</p>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="label-text">{t('tray_feature_title', 'Tray mode')}</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(trayEnabled)}
                onChange={(event) => onTrayToggle?.(event.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
            </label>
          </div>
          <p className="text-[10px] text-gray-500">{t('tray_feature_help', 'When enabled, closing the app sends it to tray and keeps background services running.')}</p>
        </section>

        <section className="card">
          <label className="label-text mb-2">{t('theme_select')}</label>
          <p className="text-[10px] text-gray-500 mb-4">{t('theme_help')}</p>
          <div className="grid grid-cols-2 gap-4">
            {themeOptions.map((themeOption) => (
              <button
                key={themeOption.id}
                onClick={() => onThemeChange(themeOption.id)}
                className="theme-tile p-4 rounded-xl border-2 transition-all text-left"
                style={{
                  backgroundColor: themeOption.preview.panel,
                  borderColor: themeOption.preview.border,
                  color: themeOption.preview.text,
                }}
              >
                <div
                  className="theme-preview"
                  style={{
                    backgroundColor: themeOption.preview.bg,
                    borderColor: themeOption.preview.border,
                  }}
                >
                  <div
                    className="theme-preview-sidebar"
                    style={{
                      backgroundColor: themeOption.preview.panel,
                      borderColor: themeOption.preview.border,
                    }}
                  >
                    <span className="theme-preview-logo" style={{ backgroundColor: themeOption.preview.text }} />
                    <span className="theme-preview-nav" style={{ backgroundColor: themeOption.preview.muted }} />
                    <span className="theme-preview-nav" style={{ backgroundColor: themeOption.preview.muted }} />
                    <span className="theme-preview-nav active" style={{ background: 'var(--brand-gradient)' }} />
                  </div>
                  <div className="theme-preview-content">
                    <div className="theme-preview-header">
                      <span className="theme-preview-title" style={{ backgroundColor: themeOption.preview.text }} />
                      <span className="theme-preview-subtitle" style={{ backgroundColor: themeOption.preview.muted }} />
                    </div>
                    <div
                      className="theme-preview-card"
                      style={{
                        backgroundColor: themeOption.preview.card,
                        borderColor: themeOption.preview.border,
                      }}
                    >
                      <span className="theme-preview-line" style={{ backgroundColor: themeOption.preview.muted }} />
                      <div className="theme-preview-row">
                        <span
                          className="theme-preview-input"
                          style={{
                            backgroundColor: themeOption.preview.input,
                            borderColor: themeOption.preview.border,
                          }}
                        />
                        <span className="theme-preview-button" />
                      </div>
                      <span className="theme-preview-line short" style={{ backgroundColor: themeOption.preview.text }} />
                    </div>
                  </div>
                </div>
                <span className="theme-tile-label block font-bold mt-3" style={{ color: themeOption.preview.text }}>
                  {themeOption.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <label className="label-text mb-2">{t('accent_select')}</label>
          <p className="text-[10px] text-gray-500 mb-4">{t('accent_help')}</p>
          <div className="flex flex-wrap gap-4">
            {accentOptions.map((accentOption) => (
              <button
                key={accentOption.id}
                type="button"
                className="accent-swatch"
                onClick={() => onAccentChange(accentOption.primary, accentOption.secondary)}
                style={{
                  backgroundImage: accentOption.preview || `linear-gradient(135deg, ${accentOption.primary} 0%, ${accentOption.secondary} 100%)`,
                }}
                aria-label={t('accent_select')}
              />
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="label-text">{t('performance_mode')}</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(animationsEnabled)}
                onChange={(event) => onAnimationsToggle?.(event.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
            </label>
          </div>
          <p className="text-[10px] text-gray-500">{t('performance_mode_help')}</p>
        </section>
      </div>
    </div>
  )
}

export function BlacklistSection({
  config,
  onModerationToggle,
  onModerationSelectChange,
  onPermissionRoleToggle,
  onMaxRepetitionChange,
  onWordBlacklistChange,
  onUserBlacklistChange,
  t,
}) {
  const wordBlacklistText = Array.isArray(config?.word_blacklist)
    ? config.word_blacklist.join(', ')
    : ''

  const userBlacklistText = Array.isArray(config?.blacklist)
    ? config.blacklist.join(', ')
    : ''

  const [wordBlacklistDraft, setWordBlacklistDraft] = useState(wordBlacklistText)
  const [userBlacklistDraft, setUserBlacklistDraft] = useState(userBlacklistText)

  useEffect(() => {
    setWordBlacklistDraft(wordBlacklistText)
  }, [wordBlacklistText])

  useEffect(() => {
    setUserBlacklistDraft(userBlacklistText)
  }, [userBlacklistText])

  const maxRepetitionValue = Number.parseInt(String(config?.max_repetition ?? 4), 10) || 4
  const repetitionPercent = Math.max(0, Math.min(100, ((maxRepetitionValue - 3) / 7) * 100))
  const legacyPermissionLevel = String(config?.permissionLevel || 'custom').toLowerCase()
  const defaultPermissionRoles = {
    everyone: false,
    follower: false,
    vip: false,
    mod: false,
    bot: false,
    streamer: false,
  }
  const legacyPermissionRoles = {
    everyone: {
      everyone: true,
      follower: true,
      vip: true,
      mod: true,
      bot: true,
      streamer: true,
    },
    followers: {
      ...defaultPermissionRoles,
      everyone: false,
      follower: true,
    },
    subs: {
      ...defaultPermissionRoles,
      everyone: false,
      follower: true,
    },
    mods: {
      ...defaultPermissionRoles,
      everyone: false,
      vip: true,
      mod: true,
      streamer: true,
    },
  }
  const hasPermissionRoles = Boolean(config?.permission_roles && typeof config.permission_roles === 'object')
  const basePermissionRoles = hasPermissionRoles
    ? config.permission_roles
    : (legacyPermissionRoles[legacyPermissionLevel] || defaultPermissionRoles)
  const permissionRoles = {
    ...defaultPermissionRoles,
    ...basePermissionRoles,
  }
  const nameStyle = String(config?.nameStyle || 'always')
  const permissionRoleItems = [
    { key: 'everyone', icon: Users, labelKey: 'perm_role_everyone', color: '#e5e7eb' },
    { key: 'follower', icon: Heart, labelKey: 'perm_role_follower', color: '#9146ff' },
    { key: 'vip', icon: Gem, labelKey: 'perm_role_vip', color: '#f472b6' },
    { key: 'subscriber', icon: Star, labelKey: 'perm_role_subscriber', color: '#fbbf24' },
    { key: 'artist', icon: Music, labelKey: 'perm_role_artist', color: '#8b5cf6' },
    { key: 'mod', icon: ShieldCheck, labelKey: 'perm_role_mod', color: '#22c55e' },
    { key: 'bot', icon: Bot, labelKey: 'perm_role_bot', color: '#94a3b8' },
    { key: 'streamer', icon: Radio, labelKey: 'perm_role_streamer', color: '#ef4444' },
  ]

  return (
    <div id="section-blacklist" className="tab-content">
      <SectionTitle>{t('menu_blacklist')}</SectionTitle>
      <div className="grid gap-6">
        <section className="card space-y-4">
          <label className="label-text">{t('content_filters')}</label>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between p-4 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <div>
                <span className="text-sm font-semibold block">{t('read_chat_messages')}</span>
                <span className="text-[10px] opacity-50">{t('read_chat_messages_help')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={Boolean(config?.read_chat_messages)}
                  onChange={(event) => onModerationToggle?.('read_chat_messages', event.target.checked)}
                />
                <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <div>
                <span className="text-sm font-semibold block">{t('read_emotes')}</span>
                <span className="text-[10px] opacity-50">{t('read_emotes_help')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={Boolean(config?.read_emotes)}
                  onChange={(event) => onModerationToggle?.('read_emotes', event.target.checked)}
                />
                <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <div>
                <span className="text-sm font-semibold block">{t('filter_links')}</span>
                <span className="text-[10px] opacity-50">{t('filter_links_help')}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={Boolean(config?.filter_links)}
                  onChange={(event) => onModerationToggle?.('filter_links', event.target.checked)}
                />
                <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
              </label>
            </div>

            <div className="p-4 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold block">{t('trim_repetition')}</span>
                  <span className="text-[10px] opacity-50">{t('trim_help')}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={Boolean(config?.trim_repetition)}
                    onChange={(event) => onModerationToggle?.('trim_repetition', event.target.checked)}
                  />
                  <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                </label>
              </div>

              <div className={`transition-all duration-300 ${config?.trim_repetition ? '' : 'opacity-40'}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-text text-[10px] opacity-70 uppercase font-bold">{t('max_rep')}</label>
                  <span id="disp_max_repetition" className="badge-accent font-mono px-2 py-0.5 rounded text-xs">{maxRepetitionValue}</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="10"
                  step="1"
                  defaultValue={maxRepetitionValue}
                  onInput={(event) => {
                    const value = Number.parseInt(event.currentTarget.value, 10) || 3
                    const percent = ((value - 3) / 7) * 100
                    const badge = document.getElementById('disp_max_repetition')
                    if (badge) badge.innerText = String(value)
                    event.currentTarget.style.setProperty('--percent', `${Math.max(0, Math.min(100, percent))}%`)
                    onMaxRepetitionChange?.(event.currentTarget.value)
                  }}
                  className="slider-smooth w-full"
                  style={{ '--percent': `${repetitionPercent}%`, '--slider-track': 'var(--bg-panel)' }}
                  disabled={!config?.trim_repetition}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <label className="label-text">{t('permissions_header')}</label>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label-text text-[10px] opacity-70 mb-2 block uppercase font-bold">{t('permissions_label')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {permissionRoleItems.map((item) => {
                  const Icon = item.icon
                  const checked = Boolean(permissionRoles[item.key])

                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-4 rounded-xl transition-colors"
                      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                        <Icon className="w-4 h-4" style={{ color: item.color }} />
                        {t(item.labelKey)}
                      </span>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={checked}
                          onChange={(event) => onPermissionRoleToggle?.(item.key, event.target.checked)}
                        />
                        <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                      </label>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] opacity-50 mt-1">{t('permissions_help')}</p>
            </div>

            <div>
              <label className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('name_style_label')}</label>
              <div className="relative">
                <select
                  id="tts-name-style"
                  value={nameStyle}
                  onChange={(event) => onModerationSelectChange?.('nameStyle', event.target.value)}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none appearance-none cursor-pointer text-sm"
                >
                  <option value="always">{t('name_always')}</option>
                  <option value="never">{t('name_never')}</option>
                  <option value="new_speaker">{t('name_new')}</option>
                </select>
              </div>
              <p className="text-[10px] opacity-50 mt-1">{t('name_style_help')}</p>
            </div>
          </div>
        </section>

        <section className="card space-y-2">
          <label className="label-text">{t('word_blacklist')}</label>
          <textarea
            value={wordBlacklistDraft}
            onChange={(event) => setWordBlacklistDraft(event.target.value)}
            onBlur={() => {
              if (wordBlacklistDraft !== wordBlacklistText) {
                onWordBlacklistChange?.(wordBlacklistDraft)
              }
            }}
            className="h-24 w-full p-3 rounded-xl border transition-all resize-none text-sm"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
            placeholder={t('word_blacklist_ph')}
          />
          <p className="text-[10px] opacity-50 mt-1">{t('word_blacklist_help')}</p>
        </section>

        <section className="card space-y-2">
          <label className="label-text">{t('blacklist_desc')}</label>
          <textarea
            value={userBlacklistDraft}
            onChange={(event) => setUserBlacklistDraft(event.target.value)}
            onBlur={() => {
              if (userBlacklistDraft !== userBlacklistText) {
                onUserBlacklistChange?.(userBlacklistDraft)
              }
            }}
            className="h-32 w-full p-3 rounded-xl border transition-all resize-none font-mono text-sm"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
            placeholder={t('blacklist_ph')}
          />
          <p className="text-[10px] opacity-50 mt-1">{t('blacklist_help')}</p>
        </section>
      </div>
    </div>
  )
}

export function VoicesSection({
  userVoiceRules,
  azureVoices,
  appLang,
  defaultVoice: preferredVoice,
  defaultLocale: preferredLocale,
  twitchConnection,
  onUpsertUserRule,
  onDeleteUserRule,
  t,
  onToast,
}) {
  const defaultVoice = useMemo(() => {
    const normalizedPreferred = String(preferredVoice || '').trim()
    if (normalizedPreferred) return normalizedPreferred
    return 'en-US-JennyNeural'
  }, [preferredVoice])
  const draftLocale = useMemo(() => {
    const localeFromVoice = getLocaleFromVoiceShortName(defaultVoice)
    if (localeFromVoice) return localeFromVoice
    return String(preferredLocale || '').trim() || 'en-US'
  }, [defaultVoice, preferredLocale])
  const isTwitchLoggedIn = twitchConnection?.state === 'online'
  const isSectionLocked = !isTwitchLoggedIn
  const userEntries = useMemo(
    () => Object.entries(userVoiceRules || {}).sort((left, right) => left[0].localeCompare(right[0])),
    [userVoiceRules],
  )

  // Recalculate summaries whenever t changes to ensure language updates
  const userSummaries = useMemo(() => {
    const summaries = {}
    Object.entries(userVoiceRules || {}).forEach(([username, rule]) => {
      summaries[username] = formatVoiceSummary(rule, azureVoices, t)
    })
    return summaries
  }, [userVoiceRules, azureVoices, t])

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [pendingDeleteUser, setPendingDeleteUser] = useState(null)
  const [editingUsername, setEditingUsername] = useState(null)
  const [form, setForm] = useState(() => createUserDraft(defaultVoice, draftLocale))

  const voicesForLanguage = useMemo(() => {
    const languagePrefix = String(form.lang || '').toLowerCase()
    const matchingVoices = (azureVoices || []).filter((voice) =>
      String(voice.Locale || '').toLowerCase().startsWith(languagePrefix),
    )
    return matchingVoices.length ? matchingVoices : azureVoices || []
  }, [azureVoices, form.lang])

  const userSpeedValue = Number.parseFloat(String(form.speed ?? '1')) || 1
  const userPitchValue = Number.parseFloat(String(form.pitch ?? '1')) || 1
  const userSpeedPercent = ((Math.min(Math.max(userSpeedValue, 0.5), 2) - 0.5) / 1.5) * 100
  const userPitchPercent = ((Math.min(Math.max(userPitchValue, 0.5), 2) - 0.5) / 1.5) * 100
  const userStyleSupported = hasStyleSupport(azureVoices, form.lang)
  const isUserStyleDisabled = !userStyleSupported
  const userLanguageOptions = useMemo(
    () => getLocaleOptionsFromVoices(azureVoices, LANGUAGE_OPTIONS, form.lang),
    [azureVoices, form.lang],
  )

  

  useEffect(() => {
    if (!isUserStyleDisabled) return
    // When user style support is disabled we need to coerce the form to a supported style.
    // This setState is intentional and safe — suppress the specific rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((previous) => {
      if (String(previous.style || 'general') === 'general') {
        return previous
      }
      return {
        ...previous,
        style: 'general',
      }
    })
  }, [isUserStyleDisabled])

  const openCreateEditor = () => {
    if (isSectionLocked) return
    setEditingUsername(null)
    setForm(createUserDraft(defaultVoice, draftLocale))
    setModalError('')
    setIsEditorOpen(true)
  }

  const openEditEditor = (username, rule) => {
    if (isSectionLocked) return
    const resolvedVoice = rule?.voice || defaultVoice
    setEditingUsername(username)
    setForm({
      ...createUserDraft(defaultVoice, draftLocale),
      ...rule,
      username,
      voice: resolvedVoice,
    })
    setModalError('')
    setIsEditorOpen(true)
  }

  const handleSaveRule = async (event) => {
    event.preventDefault()

    const normalizedUsername = String(form.username || '').trim().toLowerCase()
    if (!normalizedUsername) {
      setModalError(`${t('user_name_label')}!`)
      return
    }

    setIsSaving(true)

    const resolvedVoice = form.voice || defaultVoice
    const saveResult = await onUpsertUserRule?.(normalizedUsername, {
      ...form,
      lang: form.lang || 'hu-HU',
      voice: resolvedVoice,
      style: form.style || 'general',
      speed: form.speed || '1.0',
      pitch: form.pitch || '1.0',
    }, editingUsername)

    if (saveResult?.success) {
      onToast?.(
        editingUsername
          ? t('user_rule_updated_success', 'User voice rule updated successfully.')
          : t('user_rule_created_success', 'User voice rule created successfully.'),
      )
      setModalError('')
      setIsEditorOpen(false)
      setEditingUsername(null)
    } else {
      setModalError(saveResult?.error || t('error'))
    }

    setIsSaving(false)
  }

  const handleDeleteRule = (username) => {
    if (isSectionLocked) return
    if (!username) return
    setPendingDeleteUser({ username })
  }

  const confirmDeleteUserRule = async () => {
    if (!pendingDeleteUser?.username) return

    setIsSaving(true)
    const result = await onDeleteUserRule?.(pendingDeleteUser.username)

    if (result?.success) {
      onToast?.(t('user_rule_deleted_success', 'User voice rule deleted successfully.'))
    } else {
      onToast?.(result?.error || t('user_rule_delete_failed', 'Could not delete the user voice rule.'), 'error')
    }

    setIsSaving(false)
    setPendingDeleteUser(null)
  }

  return (
    <div id="section-voices" className="tab-content">
      <SectionTitle>{t('menu_voices_title')}</SectionTitle>
      <div className="section-lock-wrapper">
        <div className={`grid gap-6 ${isSectionLocked ? 'section-lock-content' : ''}`}>
          <section className="card">
          <div className="flex items-center justify-between mb-4">
            <label className="label-text">{t('voices_help')}</label>
            <div className="h-[34px] w-[126px] flex items-center" aria-hidden="true" />
          </div>

          <div id="user-rules-list" className="space-y-4 mb-6">
            {!userEntries.length && (
              <div className="text-center text-gray-500 p-8 italic">{t('no_user_rules_msg')}</div>
            )}

            {userEntries.map(([username, rule]) => {
              const summary = userSummaries[username] || formatVoiceSummary(rule, azureVoices, t)

              return (
                <div key={username} className="card p-4 flex items-center justify-between gap-4 group transition-all reward-rule-row">
                  <div className="flex items-center gap-4 overflow-hidden flex-grow min-w-0">
                    <div className="p-2 row-icon-bg rounded-lg shadow-sm shrink-0">
                      <User className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="reward-name-text truncate text-sm font-semibold">{username}</span>
                      <span className="text-xs text-gray-500 truncate">{summary}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditEditor(username, rule)}
                      disabled={isSectionLocked}
                      className="btn-edit p-2 btn-icon-accent"
                      title={t('action_edit')}
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(username)}
                      disabled={isSaving || isSectionLocked}
                      className="btn-delete p-2 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-70"
                      title={t('action_delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={openCreateEditor}
            disabled={isSectionLocked}
            className="font-bold text-sm transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
            title={isSectionLocked ? t('btn_connect_twitch') : undefined}
            style={{
              background: isSectionLocked ? 'none' : 'var(--brand-gradient)',
              WebkitBackgroundClip: isSectionLocked ? 'initial' : 'text',
              WebkitTextFillColor: isSectionLocked ? 'var(--text-muted)' : 'transparent',
              backgroundSize: isSectionLocked ? 'auto' : '200% auto',
              animation: isSectionLocked ? 'none' : 'gradient-flow 3s linear infinite',
              color: isSectionLocked ? 'var(--text-muted)' : undefined,
              cursor: isSectionLocked ? 'not-allowed' : 'pointer',
              opacity: isSectionLocked ? 0.5 : 1,
            }}
          >
            {t('add_user_rule')}
          </button>
          </section>
        </div>
        {isSectionLocked && (
          <div className="section-lock-overlay" role="status" aria-live="polite">
            <div className="section-lock-card">
              <p className="text-sm font-semibold">{t('rewards_locked')}</p>
            </div>
          </div>
        )}
      </div>

      {isEditorOpen && (
        <EditorModal
          title={editingUsername ? t('edit_user_rule') : t('create_user_rule')}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingUsername(null)
          }}
          onSubmit={handleSaveRule}
          submitLabel={editingUsername ? t('update_action') : t('create_action')}
          isSubmitting={isSaving}
          cancelLabel={t('modal_btn_cancel')}
          savingLabel={t('saving_btn')}
        >
          <div className="space-y-6">
            <div>
              <label className="label-text text-xs uppercase font-bold text-gray-400 mb-2 block">{t('twitch_name_ph')}</label>
              <input
                type="text"
                value={form.username}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setForm((previous) => ({ ...previous, username: value }))
                }}
                className="w-full p-4 rounded-xl bg-black/40 border border-white/10 text-white focus:border-sky-500 transition-colors outline-none font-bold text-lg placeholder-gray-600"
                placeholder={t('twitch_name_ph')}
              />
            </div>

            <div className="voice-settings-panel p-4 rounded-xl">
              <div className="voice-settings-title mb-2 text-xs uppercase font-bold text-gray-400">{t('modal_audio_settings')}</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label-text text-[10px] opacity-70 mb-1 block">{t('modal_lang_filter')}</label>
                  <select
                    value={form.lang}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      const supportsStyle = hasStyleSupport(azureVoices, value)
                      // pick a default voice for the newly selected language if available
                      const matching = (azureVoices || []).filter((voice) => String(voice.Locale || '').toLowerCase().startsWith(String(value || '').toLowerCase()))
                      const chosenVoice = matching.length ? matching[0].ShortName : (form.voice || defaultVoice)
                      setForm((previous) => ({
                        ...previous,
                        lang: value,
                        style: supportsStyle ? previous.style : 'general',
                        voice: chosenVoice,
                      }))
                    }}
                    className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                  >
                    {userLanguageOptions.map((language) => (
                      <option key={language} value={language}>{formatLocaleLabel(language, appLang)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-text text-[10px] opacity-70 mb-1 block">{t('modal_voice_select')}</label>
                  <select
                    value={form.voice || defaultVoice}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setForm((previous) => ({ ...previous, voice: value }))
                    }}
                    className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                  >
                    {voicesForLanguage.map((voice) => (
                      <option key={voice.ShortName} value={voice.ShortName}>
                        {formatVoiceLabel(voice, t) || voice.ShortName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`md:col-span-2 mt-2 ${isUserStyleDisabled ? 'style-disabled' : ''}`}>
                  <label className="label-text text-[10px] opacity-70 mb-1 block">{t('reward_style')}</label>
                  <select
                    value={form.style}
                    disabled={isUserStyleDisabled}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setForm((previous) => ({ ...previous, style: value }))
                    }}
                    className="w-full p-2 rounded-lg bg-black/50 border border-white/10 text-sm focus:border-sky-500 outline-none"
                  >
                    {AZURE_STYLE_IDS.map((styleName) => (
                      <option key={styleName} value={styleName}>{t(`style_${styleName}`, styleName)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="label-text m-0">{t('modal_speed')}</label>
                  <span className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">{userSpeedValue.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={form.speed}
                  onInput={(event) => {
                    const value = event.currentTarget?.value ?? ''
                    setForm((previous) => ({ ...previous, speed: value }))
                  }}
                  className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{ '--percent': `${userSpeedPercent}%` }}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                  <span>{t('val_slow')}</span>
                  <span>{t('val_fast')}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="label-text m-0">{t('modal_pitch')}</label>
                  <span className="badge-accent font-bold font-mono px-2 py-0.5 rounded text-xs">{userPitchValue.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={form.pitch}
                  onInput={(event) => {
                    const value = event.currentTarget?.value ?? ''
                    setForm((previous) => ({ ...previous, pitch: value }))
                  }}
                  className="slider-smooth w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{ '--percent': `${userPitchPercent}%` }}
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase tracking-wider">
                  <span>{t('val_low')}</span>
                  <span>{t('val_high')}</span>
                </div>
              </div>
            </div>

            

            {modalError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs py-3 px-4 rounded-lg text-left">
                <span className="font-bold">{t('error')}:</span> {modalError}
              </div>
            )}
          </div>
        </EditorModal>
      )}

      {pendingDeleteUser && (
        <ConfirmModal
          title={t('warning_title')}
          text={t('confirm_user_delete')}
          confirmLabel={t('btn_delete')}
          cancelLabel={t('btn_cancel')}
          isBusy={isSaving}
          onConfirm={confirmDeleteUserRule}
          onCancel={() => setPendingDeleteUser(null)}
        />
      )}
    </div>
  )
}

export function VisualsSection({
  config,
  overlayUrl,
  twitchConnection,
  ttsState,
  vtsConnection,
  onToggleObsServer,
  onOverlayStatusToggle,
  onOverlayResolutionChange,
  onOverlayLayoutChange,
  onToggleVtsEnabled,
  onVtsPortChange,
  onToggleVtsConnection,
  onToggleVtsChannel,
  onVtsMappingChange,
  onVtsRangeChange,
  onRefreshVtsParameters,
  onCopyOverlayUrl,
  onToast,
  t,
}) {
  const obsEnabled = Boolean(config?.obs_server_enabled)
  const overlayShowTtsStatus = Boolean(config?.overlay_show_tts_status ?? config?.overlay_show_status ?? true)
  const overlayShowTwitchStatus = Boolean(config?.overlay_show_twitch_status ?? config?.overlay_show_status ?? true)
  const vtsEnabled = Boolean(config?.vts_enabled)
  const vtsPort = Number.parseInt(String(config?.vts_port ?? 8001), 10) || 8001
  const overlayResolution = String(config?.overlay_resolution || '1080p')
  const overlayLayout = useMemo(() => {
    if (config?.overlay_layout && typeof config.overlay_layout === 'object') return config.overlay_layout
    return {
      chat: { x: 6, y: 70, scale: 1 },
      status_tts: { x: 80, y: 6, scale: 1 },
      status_twitch: { x: 80, y: 12, scale: 1 },
    }
  }, [config?.overlay_layout])
  const isTwitchLoggedIn = twitchConnection?.state === 'online'
  const isOverlayLocked = !isTwitchLoggedIn
  const ttsStatus = ttsState?.status || 'IDLE'
  const twitchState = twitchConnection?.state || 'offline'
  const vtsState = String(vtsConnection?.state || 'offline')
  const isVtsBusy = vtsState === 'connecting' || vtsState === 'authorizing'
  const isVtsConnected = vtsState === 'connected'
  const vtsStatusLabelByState = {
    offline: t('vts_status_offline', 'OFFLINE'),
    connecting: t('vts_status_connecting', 'CONNECTING...'),
    connected: t('vts_status_connected', 'CONNECTED'),
    denied: t('vts_status_denied', 'DENIED'),
    error: t('vts_status_error', 'ERROR'),
    authorizing: t('vts_status_authorizing', 'AUTHORIZING...'),
  }
  const obsSectionRef = useRef(null)
  const vtsSectionRef = useRef(null)

  useLayoutEffect(() => {
    const syncHeights = () => {
      const obsEl = obsSectionRef.current
      const vtsEl = vtsSectionRef.current
      if (!obsEl || !vtsEl) return

      // computeHeaderOffsets removed — we now cache a fixed collapsed height

      const obsHeader = obsEl.querySelector(':scope > .flex.items-center.justify-between') || obsEl.querySelector('.flex.items-center.justify-between')
      const vtsHeader = vtsEl.querySelector(':scope > .flex.items-center.justify-between') || vtsEl.querySelector('.flex.items-center.justify-between')
      if (!obsHeader || !vtsHeader) return

      // compute and cache a stable collapsed height based on OBS header + card padding
      if (!obsSectionRef.collapsedHeight) {
        const obsStyle = window.getComputedStyle(obsEl)
        const obsPadTop = Math.round(parseFloat(obsStyle.paddingTop) || 0)
        const obsPadBottom = Math.round(parseFloat(obsStyle.paddingBottom) || 0)
        const obsHeaderHeight = Math.round(obsHeader.getBoundingClientRect().height)
        const fixedTotal = obsHeaderHeight + obsPadTop + obsPadBottom
        obsSectionRef.collapsedHeight = fixedTotal
        obsSectionRef.collapsedPadTop = obsPadTop
        obsSectionRef.collapsedPadBottom = obsPadBottom
        // normalize header label spacing to avoid differences
        try {
          obsHeader.style.height = `${obsHeaderHeight}px`
          vtsHeader.style.height = `${obsHeaderHeight}px`
          const obsLabel = obsHeader.querySelector('.label-text')
          const vtsLabel = vtsHeader.querySelector('.label-text')
          if (obsLabel) obsLabel.style.marginBottom = '0px'
          if (vtsLabel) vtsLabel.style.marginBottom = '0px'
        } catch {
          // ignore
        }
      }

      const targetTotal = obsSectionRef.collapsedHeight
      const obsPadTop = obsSectionRef.collapsedPadTop
      const obsPadBottom = obsSectionRef.collapsedPadBottom

      if (!obsEnabled || !vtsEnabled) {
        obsEl.style.minHeight = `${targetTotal}px`
        vtsEl.style.minHeight = `${targetTotal}px`
        vtsEl.style.paddingTop = `${obsPadTop}px`
        vtsEl.style.paddingBottom = `${obsPadBottom}px`
      } else {
        obsEl.style.minHeight = ''
        vtsEl.style.minHeight = ''
        vtsEl.style.paddingTop = ''
        vtsEl.style.paddingBottom = ''
      }
    }

    // sync on next frame and on resize
    requestAnimationFrame(syncHeights)
    const onResize = () => requestAnimationFrame(syncHeights)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [obsEnabled, vtsEnabled, overlayResolution, overlayShowTtsStatus, overlayShowTwitchStatus])
  const vtsStatusLabel = vtsStatusLabelByState[vtsState] || vtsStatusLabelByState.offline
  const vtsConnectButtonLabel = isVtsBusy
    ? t('vts_btn_waiting', 'WAITING...')
    : isVtsConnected
      ? t('vts_btn_disconnect', 'DISCONNECT')
      : t('vts_btn_connect', 'CONNECT')
  const vtsParameters = Array.isArray(vtsConnection?.parameters)
    ? vtsConnection.parameters
    : []
  const hasVtsParameters = vtsParameters.length > 0
  const vtsMappingRows = [
    {
      key: 'mouth_open',
      label: t('vts_channel_mouth_open', 'Mouth Open'),
      enabledKey: 'vts_mouth_open_enabled',
      paramKey: 'vts_mouth_open_param',
      minKey: 'vts_mouth_open_min',
      maxKey: 'vts_mouth_open_max',
      fallbackParam: 'MouthOpen',
    },
    {
      key: 'mouth_smile',
      label: t('vts_channel_mouth_smile', 'Mouth Smile'),
      enabledKey: 'vts_mouth_smile_enabled',
      paramKey: 'vts_mouth_smile_param',
      minKey: 'vts_mouth_smile_min',
      maxKey: 'vts_mouth_smile_max',
      fallbackParam: 'MouthSmile',
    },
    {
      key: 'jaw_open',
      label: t('vts_channel_jaw_open', 'Jaw Open'),
      enabledKey: 'vts_jaw_open_enabled',
      paramKey: 'vts_jaw_open_param',
      minKey: 'vts_jaw_open_min',
      maxKey: 'vts_jaw_open_max',
      fallbackParam: 'JawOpen',
    },
  ]
  const overlayPreviewUsername = useMemo(() => {
    const username = String(twitchConnection?.username || '').trim()
    if (username) return username.toUpperCase()
    const fallback = String(t('overlay_preview_user') || '').trim()
    return (fallback || 'VIEWER_92').toUpperCase()
  }, [t, twitchConnection?.username])

  const overlayPreviewRef = useRef(null)
  const overlayPreviewStageRef = useRef(null)
  const overlayTtsStatusRef = useRef(null)
  const overlayTwitchStatusRef = useRef(null)
  const overlayDragRef = useRef(null)
  const overlayPointerMoveHandlerRef = useRef(null)
  const overlayKeyMoveRef = useRef({ key: '', target: '', timer: null, startedAt: 0 })
  const activeOverlayTargetRef = useRef(null)
  const overlayLayoutRef = useRef(overlayLayout)
  const previewScaleRef = useRef(1)
  const [previewTransform, setPreviewTransform] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  })
  const [vtsPortDraft, setVtsPortDraft] = useState(String(vtsPort))

  const overlayResolutions = [
    { value: '2160p', label: '4K (3840x2160)', width: 3840, height: 2160 },
    { value: '1440p', label: '1440p (2560x1440)', width: 2560, height: 1440 },
    { value: '1080p', label: '1080p (1920x1080)', width: 1920, height: 1080 },
    { value: '720p', label: '720p (1280x720)', width: 1280, height: 720 },
    { value: '480p', label: '480p (854x480)', width: 854, height: 480 },
  ]
  const MIN_OVERLAY_SCALE = 0.5
  const MAX_OVERLAY_SCALE = 2
  const RESIZE_HIT_SIZE = 4
  const KEY_NUDGE_INITIAL_STEP = 3
  const KEY_NUDGE_MAX_STEP = 18
  const KEY_NUDGE_ACCEL_MS = 220
  const KEY_NUDGE_INTERVAL_MS = 50
  const PREVIEW_FALLBACK_STATUS_BASE_SIZES = {
    status_tts: { width: 180, height: 38 },
    status_twitch: { width: 260, height: 38 },
  }
  const RESIZE_CURSOR_MAP = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  }
  const activeResolution = overlayResolutions.find((entry) => entry.value === overlayResolution)
    || overlayResolutions[2]
  const overlayStatusTtsScale = Math.max(
    MIN_OVERLAY_SCALE,
    Math.min(MAX_OVERLAY_SCALE, Number.parseFloat(String(overlayLayout?.status_tts?.scale ?? 1)) || 1),
  )
  const overlayStatusTwitchScale = Math.max(
    MIN_OVERLAY_SCALE,
    Math.min(MAX_OVERLAY_SCALE, Number.parseFloat(String(overlayLayout?.status_twitch?.scale ?? 1)) || 1),
  )

  useEffect(() => {
    setVtsPortDraft(String(vtsPort))
  }, [vtsPort])

  useLayoutEffect(() => {
    overlayLayoutRef.current = overlayLayout
  }, [overlayLayout])

  const updatePreviewTransform = useCallback(() => {
    const container = overlayPreviewRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const rawScale = Math.min(
      rect.width / activeResolution.width,
      rect.height / activeResolution.height,
    )
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1
    const offsetX = (rect.width - activeResolution.width * scale) / 2
    const offsetY = (rect.height - activeResolution.height * scale) / 2

    previewScaleRef.current = scale
    setPreviewTransform((previous) => {
      if (
        Math.abs(previous.scale - scale) < 0.001
        && Math.abs(previous.offsetX - offsetX) < 0.5
        && Math.abs(previous.offsetY - offsetY) < 0.5
      ) {
        return previous
      }

      return { scale, offsetX, offsetY }
    })
  }, [activeResolution.height, activeResolution.width])

  useLayoutEffect(() => {
    updatePreviewTransform()
  }, [updatePreviewTransform])

  useEffect(() => {
    const container = overlayPreviewRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => updatePreviewTransform())
    observer.observe(container)
    return () => observer.disconnect()
  }, [updatePreviewTransform])

  const handleCopyOverlayUrl = async () => {
    const result = await onCopyOverlayUrl?.(overlayUrl)
    if (result?.success) {
      onToast?.(t('toast_overlay_url_copied', 'Overlay URL copied to clipboard.'))
    } else {
      onToast?.(t(result?.error || 'clipboard_copy_failed', 'Copy failed.'), 'error')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateOverlayLayout = (target, xPercent, yPercent, scaleValue) => {
    if (target !== 'status_tts' && target !== 'status_twitch') return

    const clampValue = (value, min, max) => Math.max(min, Math.min(max, value))
    const toNumber = (value, fallback) => {
      const parsed = Number.parseFloat(String(value))
      return Number.isFinite(parsed) ? parsed : fallback
    }

    const normalizeScale = (value, fallback = 1) => clampValue(
      toNumber(value, fallback),
      MIN_OVERLAY_SCALE,
      MAX_OVERLAY_SCALE,
    )

    const getRenderedBaseSize = (ref, currentScale, fallbackSize) => {
      const element = ref?.current
      const previewScale = previewScaleRef.current || 1
      const scale = normalizeScale(currentScale, 1)
      if (!element || !previewScale || !scale) return fallbackSize

      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return fallbackSize

      return {
        width: rect.width / (previewScale * scale),
        height: rect.height / (previewScale * scale),
      }
    }

    const statusRef = target === 'status_tts'
      ? overlayTtsStatusRef
      : overlayTwitchStatusRef

    const currentLayout = overlayLayoutRef.current
      || {
        chat: { x: 6, y: 70, scale: 1 },
        status_tts: { x: 80, y: 6, scale: 1 },
        status_twitch: { x: 80, y: 12, scale: 1 },
      }
    const roundPercent = (value) => Math.round(value * 100) / 100
    const roundScale = (value) => Math.round(value * 100) / 100
    const baseWidth = activeResolution.width
    const baseHeight = activeResolution.height
    const currentStatus = currentLayout?.[target] || {}
    const nextScale = roundScale(
      scaleValue !== undefined
        ? normalizeScale(scaleValue, currentStatus.scale ?? 1)
        : normalizeScale(currentStatus.scale ?? 1, 1),
    )
    const statusBaseSize = getRenderedBaseSize(
      statusRef,
      nextScale,
      PREVIEW_FALLBACK_STATUS_BASE_SIZES[target] || { width: 220, height: 38 },
    )

    const statusWidth = statusBaseSize.width * nextScale
    const statusHeight = statusBaseSize.height * nextScale
    const desiredX = (clampValue(toNumber(xPercent, currentStatus.x ?? 0), 0, 100) / 100) * baseWidth
    const desiredY = (clampValue(toNumber(yPercent, currentStatus.y ?? 0), 0, 100) / 100) * baseHeight
    const maxX = Math.max(0, baseWidth - statusWidth)
    const maxY = Math.max(0, baseHeight - statusHeight)
    const clampedX = Math.max(0, Math.min(maxX, desiredX))
    const clampedY = Math.max(0, Math.min(maxY, desiredY))

    const nextStatus = {
      ...currentStatus,
      x: roundPercent((clampedX / baseWidth) * 100),
      y: roundPercent((clampedY / baseHeight) * 100),
      scale: nextScale,
    }

    const closeTo = (a, b, epsilon) => Math.abs(a - b) <= epsilon
    if (
      closeTo(toNumber(currentStatus.x, 0), nextStatus.x, 0.01)
      && closeTo(toNumber(currentStatus.y, 0), nextStatus.y, 0.01)
      && closeTo(normalizeScale(currentStatus.scale ?? 1, 1), nextStatus.scale, 0.01)
    ) {
      return
    }

    onOverlayLayoutChange?.({
      ...currentLayout,
      [target]: nextStatus,
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getStageMetrics = () => {
    const stage = overlayPreviewStageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    const scale = previewScaleRef.current || 1
    if (!rect.width || !rect.height || !scale) return null
    return {
      rect,
      scale,
      baseWidth: activeResolution.width,
      baseHeight: activeResolution.height,
    }
  }

  const getResizeHandle = (elementRect, clientX, clientY) => {
    const localX = clientX - elementRect.left
    const localY = clientY - elementRect.top
    const withinX = localX >= 0 && localX <= elementRect.width
    const withinY = localY >= 0 && localY <= elementRect.height
    if (!withinX || !withinY) return null

    const nearLeft = localX <= RESIZE_HIT_SIZE
    const nearRight = localX >= elementRect.width - RESIZE_HIT_SIZE
    const nearTop = localY <= RESIZE_HIT_SIZE
    const nearBottom = localY >= elementRect.height - RESIZE_HIT_SIZE

    if (nearTop && nearLeft) return 'nw'
    if (nearTop && nearRight) return 'ne'
    if (nearBottom && nearLeft) return 'sw'
    if (nearBottom && nearRight) return 'se'
    if (nearTop) return 'n'
    if (nearBottom) return 's'
    if (nearLeft) return 'w'
    if (nearRight) return 'e'
    return null
  }

  const getElementRectForTarget = (target) => {
    const element = target === 'status_tts'
      ? overlayTtsStatusRef.current
      : target === 'status_twitch'
        ? overlayTwitchStatusRef.current
        : null
    return element ? element.getBoundingClientRect() : null
  }

  const getCursorForHandle = (handle) => RESIZE_CURSOR_MAP[handle] || 'grab'

  const handleOverlayPointerHover = (event, target) => {
    const element = event.currentTarget
    if (!element) return

    const elementRect = getElementRectForTarget(target)
    if (!elementRect) return
    const handle = getResizeHandle(elementRect, event.clientX, event.clientY)
    element.style.cursor = handle ? getCursorForHandle(handle) : 'grab'
  }

  const handleOverlayPointerLeave = (event) => {
    const element = event.currentTarget
    if (!element) return
    element.style.cursor = isOverlayLocked ? 'not-allowed' : 'grab'
  }

  const handleOverlayPointerMove = (event) => {
    const dragState = overlayDragRef.current
    if (!dragState) return

    const {
      stageRect,
      previewScale,
      baseWidth,
      baseHeight,
      offsetX,
      offsetY,
      target,
      mode,
      elementBaseWidth,
      elementBaseHeight,
      elementScale,
      layoutX,
      layoutY,
      rightEdge,
      bottomEdge,
      handle,
    } = dragState

    const pointerX = (event.clientX - stageRect.left) / previewScale
    const pointerY = (event.clientY - stageRect.top) / previewScale

    if (mode === 'resize') {
      const maxScaleX = handle && handle.includes('w')
        ? rightEdge / elementBaseWidth
        : (baseWidth - layoutX) / elementBaseWidth
      const maxScaleY = handle && handle.includes('n')
        ? bottomEdge / elementBaseHeight
        : (baseHeight - layoutY) / elementBaseHeight
      const maxScaleBound = handle === 'e' || handle === 'w'
        ? maxScaleX
        : handle === 'n' || handle === 's'
          ? maxScaleY
          : Math.min(maxScaleX, maxScaleY)

      let nextScale = elementScale
      let nextX = layoutX
      let nextY = layoutY

      switch (handle) {
        case 'e':
          nextScale = (pointerX - layoutX) / elementBaseWidth
          break
        case 'w':
          nextScale = (rightEdge - pointerX) / elementBaseWidth
          nextX = rightEdge - elementBaseWidth * nextScale
          break
        case 's':
          nextScale = (pointerY - layoutY) / elementBaseHeight
          break
        case 'n':
          nextScale = (bottomEdge - pointerY) / elementBaseHeight
          nextY = bottomEdge - elementBaseHeight * nextScale
          break
        case 'ne':
          nextScale = Math.min(
            (pointerX - layoutX) / elementBaseWidth,
            (bottomEdge - pointerY) / elementBaseHeight,
          )
          nextY = bottomEdge - elementBaseHeight * nextScale
          break
        case 'sw':
          nextScale = Math.min(
            (rightEdge - pointerX) / elementBaseWidth,
            (pointerY - layoutY) / elementBaseHeight,
          )
          nextX = rightEdge - elementBaseWidth * nextScale
          break
        case 'nw':
          nextScale = Math.min(
            (rightEdge - pointerX) / elementBaseWidth,
            (bottomEdge - pointerY) / elementBaseHeight,
          )
          nextX = rightEdge - elementBaseWidth * nextScale
          nextY = bottomEdge - elementBaseHeight * nextScale
          break
        case 'se':
        default:
          nextScale = Math.min(
            (pointerX - layoutX) / elementBaseWidth,
            (pointerY - layoutY) / elementBaseHeight,
          )
          break
      }

      const clampedScale = Math.max(
        MIN_OVERLAY_SCALE,
        Math.min(MAX_OVERLAY_SCALE, maxScaleBound, nextScale),
      )
      const maxX = Math.max(0, baseWidth - elementBaseWidth * clampedScale)
      const maxY = Math.max(0, baseHeight - elementBaseHeight * clampedScale)
      const clampedX = Math.max(0, Math.min(maxX, nextX))
      const clampedY = Math.max(0, Math.min(maxY, nextY))

      updateOverlayLayout(
        target,
        (clampedX / baseWidth) * 100,
        (clampedY / baseHeight) * 100,
        clampedScale,
      )
      return
    }

    const maxX = Math.max(0, baseWidth - elementBaseWidth * elementScale)
    const maxY = Math.max(0, baseHeight - elementBaseHeight * elementScale)
    const clampedX = Math.max(0, Math.min(maxX, pointerX - offsetX))
    const clampedY = Math.max(0, Math.min(maxY, pointerY - offsetY))
    updateOverlayLayout(
      target,
      (clampedX / baseWidth) * 100,
      (clampedY / baseHeight) * 100,
    )
  }

  overlayPointerMoveHandlerRef.current = handleOverlayPointerMove

  const handleOverlayPointerMoveGlobal = useCallback((event) => {
    overlayPointerMoveHandlerRef.current?.(event)
  }, [])

  const stopOverlayDrag = useCallback(() => {
    overlayDragRef.current = null
    window.removeEventListener('pointermove', handleOverlayPointerMoveGlobal)
    window.removeEventListener('pointerup', stopOverlayDrag)
  }, [handleOverlayPointerMoveGlobal])

  const handleOverlayPointerDown = (event, target) => {
    if (event.button !== 0) return
    if (target !== 'status_tts' && target !== 'status_twitch') return
    activeOverlayTargetRef.current = target
    const metrics = getStageMetrics()
    if (!metrics) return
    const { rect, scale, baseWidth, baseHeight } = metrics

    const elementRect = getElementRectForTarget(target)
    if (!elementRect) return
    const currentLayout = overlayLayoutRef.current || {}
    const currentScale = Number.parseFloat(String(currentLayout?.[target]?.scale ?? 1)) || 1
    const layoutX = ((Number(currentLayout?.[target]?.x ?? 0)) / 100) * baseWidth
    const layoutY = ((Number(currentLayout?.[target]?.y ?? 0)) / 100) * baseHeight
    const elementBaseWidth = elementRect.width / (scale * currentScale)
    const elementBaseHeight = elementRect.height / (scale * currentScale)
    const pointerX = (event.clientX - rect.left) / scale
    const pointerY = (event.clientY - rect.top) / scale
    const resizeHandle = getResizeHandle(elementRect, event.clientX, event.clientY)
    const baseDragState = {
      target,
      stageRect: rect,
      previewScale: scale,
      baseWidth,
      baseHeight,
      elementBaseWidth,
      elementBaseHeight,
      elementScale: currentScale,
      layoutX,
      layoutY,
    }

    if (resizeHandle) {
      const rightEdge = layoutX + elementBaseWidth * currentScale
      const bottomEdge = layoutY + elementBaseHeight * currentScale
      overlayDragRef.current = {
        ...baseDragState,
        mode: 'resize',
        handle: resizeHandle,
        rightEdge,
        bottomEdge,
      }
    } else {
      const offsetX = pointerX - layoutX
      const offsetY = pointerY - layoutY
      overlayDragRef.current = {
        ...baseDragState,
        mode: 'move',
        offsetX,
        offsetY,
      }
    }

    event.currentTarget.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', handleOverlayPointerMoveGlobal)
    window.addEventListener('pointerup', stopOverlayDrag)
    event.preventDefault()
  }

  const nudgeOverlayByArrow = useCallback((target, key, step) => {
    if (target !== 'status_tts' && target !== 'status_twitch') return false

    const metrics = getStageMetrics()
    if (!metrics) return false
    const { scale, baseWidth, baseHeight } = metrics

    const element = target === 'status_tts'
      ? overlayTtsStatusRef.current
      : overlayTwitchStatusRef.current
    if (!element) return false

    const currentLayout = overlayLayoutRef.current || {}
    const layoutItem = currentLayout[target] || {}
    const currentScale = Number.parseFloat(String(layoutItem.scale ?? 1)) || 1
    const elementRect = element.getBoundingClientRect()
    const elementBaseWidth = elementRect.width / (scale * currentScale)
    const elementBaseHeight = elementRect.height / (scale * currentScale)

    const deltaX = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const deltaY = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0

    const currentX = ((Number(layoutItem.x ?? 0)) / 100) * baseWidth
    const currentY = ((Number(layoutItem.y ?? 0)) / 100) * baseHeight
    const maxX = Math.max(0, baseWidth - elementBaseWidth * currentScale)
    const maxY = Math.max(0, baseHeight - elementBaseHeight * currentScale)
    const nextX = Math.max(0, Math.min(maxX, currentX + deltaX))
    const nextY = Math.max(0, Math.min(maxY, currentY + deltaY))

    updateOverlayLayout(
      target,
      (nextX / baseWidth) * 100,
      (nextY / baseHeight) * 100,
      currentScale,
    )

    return true
  }, [getStageMetrics, updateOverlayLayout])

  const stopOverlayKeyMove = useCallback(() => {
    const moveState = overlayKeyMoveRef.current
    if (moveState.timer) {
      window.clearInterval(moveState.timer)
      moveState.timer = null
    }
    moveState.key = ''
    moveState.target = ''
    moveState.startedAt = 0
  }, [])

  const handleOverlayKeyDown = useCallback((event) => {
    const key = event.key
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return

    const targetElement = event.target
    const tagName = targetElement?.tagName?.toLowerCase?.() || ''
    if (targetElement?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName)) {
      return
    }

    const target = activeOverlayTargetRef.current
    if (!target) return
    event.preventDefault()

    const moveState = overlayKeyMoveRef.current
    if (moveState.timer && moveState.key === key && moveState.target === target) {
      const elapsed = Date.now() - moveState.startedAt
      const boost = Math.floor(elapsed / KEY_NUDGE_ACCEL_MS)
      const step = Math.min(KEY_NUDGE_MAX_STEP, KEY_NUDGE_INITIAL_STEP + boost * 2)
      void nudgeOverlayByArrow(target, key, step)
      return
    }

    stopOverlayKeyMove()

    moveState.key = key
    moveState.target = target
    moveState.startedAt = Date.now()
    void nudgeOverlayByArrow(target, key, KEY_NUDGE_INITIAL_STEP)

    moveState.timer = window.setInterval(() => {
      const currentMove = overlayKeyMoveRef.current
      if (!currentMove.key || !currentMove.target) return
      const elapsed = Date.now() - currentMove.startedAt
      const boost = Math.floor(elapsed / KEY_NUDGE_ACCEL_MS)
      const step = Math.min(KEY_NUDGE_MAX_STEP, KEY_NUDGE_INITIAL_STEP + boost * 2)
      void nudgeOverlayByArrow(currentMove.target, currentMove.key, step)
    }, KEY_NUDGE_INTERVAL_MS)
  }, [
    KEY_NUDGE_ACCEL_MS,
    KEY_NUDGE_INITIAL_STEP,
    KEY_NUDGE_INTERVAL_MS,
    KEY_NUDGE_MAX_STEP,
    nudgeOverlayByArrow,
    stopOverlayKeyMove,
  ])

  const handleOverlayKeyUp = useCallback((event) => {
    const key = event.key
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return

    const moveState = overlayKeyMoveRef.current
    if (moveState.key === key) {
      stopOverlayKeyMove()
    }
  }, [stopOverlayKeyMove])

  const handleOverlayWindowBlur = useCallback(() => {
    stopOverlayKeyMove()
  }, [stopOverlayKeyMove])

  useEffect(() => () => {
    stopOverlayDrag()
  }, [stopOverlayDrag])

  useEffect(() => () => {
    stopOverlayKeyMove()
  }, [stopOverlayKeyMove])

  useEffect(() => {
    window.addEventListener('keydown', handleOverlayKeyDown)
    window.addEventListener('keyup', handleOverlayKeyUp)
    window.addEventListener('blur', handleOverlayWindowBlur)
    return () => {
      window.removeEventListener('keydown', handleOverlayKeyDown)
      window.removeEventListener('keyup', handleOverlayKeyUp)
      window.removeEventListener('blur', handleOverlayWindowBlur)
    }
  }, [handleOverlayKeyDown, handleOverlayKeyUp, handleOverlayWindowBlur])

  return (
    <div id="section-visuals" className="tab-content">
      <SectionTitle>{t('title_visuals_vts')}</SectionTitle>
      <div className="section-lock-wrapper">
        <div className={isOverlayLocked ? 'section-lock-content' : ''}>
          <div className="grid gap-6">
            <section ref={obsSectionRef} className="card space-y-4">
              <div className="flex items-center justify-between">
                <label className="label-text">{t('visuals_header')}</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="obs-server-toggle"
                    checked={obsEnabled}
                    onChange={(event) => onToggleObsServer?.(event.target.checked)}
                    disabled={isOverlayLocked}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                </label>
              </div>

              <div id="obs-widget-tools" className={`space-y-6 anim-entry ${obsEnabled ? '' : 'hidden'}`}>


                <div className="space-y-2">
                  <label className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('overlay_url_label')}</label>
                  <div className="flex gap-2">
                    <input type="text" id="overlay-path-input" readOnly className="w-full p-3 rounded-xl font-mono text-xs outline-none transition-all cursor-default border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }} value={overlayUrl || 'http://127.0.0.1:8080'} />
                    <button onClick={handleCopyOverlayUrl} className="p-3 rounded-xl transition-all border group relative overflow-hidden active:scale-95" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }} title={t('copy_action', 'Copy')}>
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    {
                      key: 'tts',
                      checked: overlayShowTtsStatus,
                      label: t('overlay_show_tts_status', 'Show TTS status'),
                    },
                    {
                      key: 'twitch',
                      checked: overlayShowTwitchStatus,
                      label: t('overlay_show_twitch_status', 'Show Twitch status'),
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-4 rounded-xl transition-colors"
                      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                    >
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{item.label}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) => onOverlayStatusToggle?.(item.key, event.target.checked)}
                          disabled={isOverlayLocked}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="label-text text-[10px] opacity-70 uppercase font-bold">{t('overlay_resolution_label')}</label>
                  <select
                    value={overlayResolution}
                    onChange={(event) => onOverlayResolutionChange?.(event.target.value)}
                    disabled={isOverlayLocked}
                  >
                    {overlayResolutions.map((entry) => (
                      <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] opacity-50">{t('overlay_resolution_help')}</p>
                </div>

                <div className="space-y-2">
                  <label className="label-text text-[10px] opacity-70 uppercase font-bold">{t('overlay_preview_label')}</label>
                  <div
                    ref={overlayPreviewRef}
                    className="relative w-full rounded-2xl border overflow-hidden"
                    style={{
                      aspectRatio: `${activeResolution.width}/${activeResolution.height}`,
                      backgroundColor: 'rgba(10, 10, 16, 0.92)',
                      borderColor: 'var(--border-color)',
                      pointerEvents: 'auto',
                      opacity: isOverlayLocked ? 0.55 : 1,
                    }}
                  >
                    <div className="absolute inset-0" style={{
                      background: 'radial-gradient(circle at top left, rgba(0, 242, 255, 0.12), transparent 45%), radial-gradient(circle at bottom right, rgba(168, 0, 255, 0.16), transparent 50%)',
                    }} />
                    <div
                      ref={overlayPreviewStageRef}
                      className="absolute"
                      style={{
                        left: 0,
                        top: 0,
                        width: activeResolution.width,
                        height: activeResolution.height,
                        transform: `translate(${previewTransform.offsetX}px, ${previewTransform.offsetY}px) scale(${previewTransform.scale})`,
                        transformOrigin: 'top left',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 16,
                      }}
                    >
                      <div
                        ref={overlayTtsStatusRef}
                        className="absolute select-none"
                        style={{
                          left: `${Number(overlayLayout?.status_tts?.x ?? 80)}%`,
                          top: `${Number(overlayLayout?.status_tts?.y ?? 6)}%`,
                          transform: `scale(${overlayStatusTtsScale})`,
                          transformOrigin: 'top left',
                          cursor: 'grab',
                          touchAction: 'none',
                          overflow: 'visible',
                          display: overlayShowTtsStatus ? 'block' : 'none',
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 12,
                            pointerEvents: 'auto',
                            zIndex: 4,
                            background: 'transparent',
                          }}
                          onPointerDown={(event) => handleOverlayPointerDown(event, 'status_tts')}
                          onPointerMove={(event) => handleOverlayPointerHover(event, 'status_tts')}
                          onPointerLeave={handleOverlayPointerLeave}
                        />
                        <div style={{ position: 'relative' }}>
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              border: '1px dashed rgba(255,255,255,0.55)',
                              borderRadius: 12,
                              pointerEvents: 'none',
                              boxSizing: 'border-box',
                              zIndex: 2,
                            }}
                          />
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 12,
                            background: 'rgba(16, 16, 20, 0.85)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                            backdropFilter: 'blur(8px)',
                            position: 'relative',
                            zIndex: 1,
                          }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: 0.6,
                              textTransform: 'uppercase',
                              color: '#f8fafc',
                            }}>
                              <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: ttsStatus === 'PLAYING'
                                  ? '#22c55e'
                                  : ttsStatus === 'PAUSED'
                                    ? '#f59e0b'
                                    : '#64748b',
                                boxShadow: ttsStatus === 'PLAYING'
                                  ? '0 0 10px rgba(34,197,94,0.6)'
                                  : '0 0 6px rgba(0,0,0,0.4)',
                              }} />
                              {t('overlay_status_tts')}: {ttsStatus === 'PLAYING'
                                ? t('status_playing')
                                : ttsStatus === 'PAUSED'
                                  ? t('status_paused')
                                  : t('status_idle')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        ref={overlayTwitchStatusRef}
                        className="absolute select-none"
                        style={{
                          left: `${Number(overlayLayout?.status_twitch?.x ?? 80)}%`,
                          top: `${Number(overlayLayout?.status_twitch?.y ?? 12)}%`,
                          transform: `scale(${overlayStatusTwitchScale})`,
                          transformOrigin: 'top left',
                          cursor: 'grab',
                          touchAction: 'none',
                          overflow: 'visible',
                          display: overlayShowTwitchStatus ? 'block' : 'none',
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 12,
                            pointerEvents: 'auto',
                            zIndex: 4,
                            background: 'transparent',
                          }}
                          onPointerDown={(event) => handleOverlayPointerDown(event, 'status_twitch')}
                          onPointerMove={(event) => handleOverlayPointerHover(event, 'status_twitch')}
                          onPointerLeave={handleOverlayPointerLeave}
                        />
                        <div style={{ position: 'relative' }}>
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              border: '1px dashed rgba(255,255,255,0.55)',
                              borderRadius: 12,
                              pointerEvents: 'none',
                              boxSizing: 'border-box',
                              zIndex: 2,
                            }}
                          />
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 12,
                            background: 'rgba(16, 16, 20, 0.85)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                            backdropFilter: 'blur(8px)',
                            position: 'relative',
                            zIndex: 1,
                          }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: 0.6,
                              textTransform: 'uppercase',
                              color: '#f8fafc',
                            }}>
                              <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: twitchState === 'online'
                                  ? '#22c55e'
                                  : twitchState === 'connecting'
                                    ? '#fbbf24'
                                    : '#64748b',
                                boxShadow: twitchState === 'online'
                                  ? '0 0 10px rgba(34,197,94,0.6)'
                                  : twitchState === 'connecting'
                                    ? '0 0 10px rgba(251,191,36,0.6)'
                                    : '0 0 6px rgba(0,0,0,0.4)',
                              }} />
                              {t('overlay_status_twitch')}: {twitchState === 'online'
                                ? t('status_online')
                                : twitchState === 'connecting'
                                  ? t('status_connecting')
                                  : String(t('offline')).replace(/^•\s*/, '')}
                              {overlayPreviewUsername ? ` • ${overlayPreviewUsername}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] opacity-50">{t('overlay_layout_help')}</p>
                </div>

              </div>


            </section>

            <section ref={vtsSectionRef} className="card space-y-4">
              <div className="flex items-center justify-between">
                <label className="label-text">{t('vts_header')}</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vtsEnabled}
                    onChange={(event) => onToggleVtsEnabled?.(event.target.checked)}
                    disabled={isOverlayLocked}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                </label>
              </div>

              

              <div className={`space-y-4 anim-entry ${vtsEnabled ? '' : 'hidden'}`}>
                <div className="space-y-1">
                  <label htmlFor="vts-port" className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('websocket_port')}</label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                    <input
                      id="vts-port"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={5}
                      value={vtsPortDraft}
                      onChange={(event) => {
                        const digitsOnly = String(event.target.value || '').replace(/\D+/g, '').slice(0, 5)
                        setVtsPortDraft(digitsOnly)
                        if (digitsOnly) {
                          onVtsPortChange?.(digitsOnly)
                        }
                      }}
                      onBlur={() => {
                        const parsedPort = Number.parseInt(vtsPortDraft, 10)
                        const safePort = Number.isFinite(parsedPort) && parsedPort > 0
                          ? parsedPort
                          : 8001
                        setVtsPortDraft(String(safePort))
                        onVtsPortChange?.(safePort)
                      }}
                      disabled={isOverlayLocked || isVtsConnected || isVtsBusy}
                    />
                    <button
                        id="btn-vts-connect"
                      type="button"
                      onClick={onToggleVtsConnection}
                        disabled={isOverlayLocked}
                        className={`btn-primary text-white w-full md:w-[180px] h-[48px] px-4 rounded-xl text-xs font-bold transition-colors tracking-wider shadow-lg ${
                        isVtsConnected
                            ? 'is-connected'
                          : isVtsBusy
                              ? 'opacity-80 cursor-wait'
                              : 'shadow-sky-500/20'
                      }`}
                    >
                      {vtsConnectButtonLabel}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] opacity-50">{t('vts_port_help', 'Default VTube Studio port: 8001')}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80" style={{ color: 'var(--accent-primary)' }}>
                    {vtsStatusLabel}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="label-text text-[10px] opacity-70 uppercase font-bold">{t('vts_mapping_title', 'Lip-Sync variable mapping')}</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-60">
                        {hasVtsParameters
                          ? `${vtsParameters.length} ${t('vts_variables_found', 'variables')}`
                          : t('vts_variables_none', 'No variables loaded')}
                      </span>
                      <button
                        type="button"
                        onClick={onRefreshVtsParameters}
                        disabled={isOverlayLocked || vtsState !== 'connected' || isVtsBusy}
                        className="btn-secondary btn-compact"
                        title={t('vts_refresh_model', 'Refresh model variables')}
                        aria-label={t('vts_refresh_model', 'Refresh model variables')}
                      >
                        <RefreshCw className={isVtsBusy ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>

                  {vtsMappingRows.map((row) => {
                    const rowEnabled = config?.[row.enabledKey] !== false
                    const preferredParameter = String(config?.[row.paramKey] || row.fallbackParam || '').trim()
                    const hasPreferredParameter = vtsParameters.some((parameter) => parameter.id === preferredParameter)
                    const selectedParameterId = hasPreferredParameter ? preferredParameter : ''
                    const selectedParameter = vtsParameters.find((parameter) => parameter.id === selectedParameterId)
                    const parameterMin = Number.isFinite(Number(selectedParameter?.min)) ? Number(selectedParameter.min) : 0
                    const parameterMax = Number.isFinite(Number(selectedParameter?.max)) ? Number(selectedParameter.max) : 1
                    const resolvedMinValue = Number.isFinite(Number(config?.[row.minKey]))
                      ? Number(config[row.minKey])
                      : parameterMin
                    const resolvedMaxValue = Number.isFinite(Number(config?.[row.maxKey]))
                      ? Number(config[row.maxKey])
                      : parameterMax

                    return (
                      <div key={row.key} className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
                        <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0" style={{ color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', backgroundColor: 'rgba(0,0,0,0.15)' }}>
                              <VtsChannelIcon channelKey={row.key} />
                            </span>
                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>{row.label}</span>
                          </div>
                          <div className="flex justify-end">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rowEnabled}
                                onChange={(event) => onToggleVtsChannel?.(row.enabledKey, event.target.checked)}
                                disabled={isOverlayLocked || vtsState !== 'connected'}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 rounded-full peer transition-all duration-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} />
                            </label>
                          </div>
                        </div>

                        {rowEnabled && (
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_110px_110px] mt-3">
                            <div>
                              <label className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('vts_parameter_label', 'Variable')}</label>
                              <select
                                value={selectedParameterId}
                                onChange={(event) => onVtsMappingChange?.(row.paramKey, event.target.value)}
                                disabled={isOverlayLocked || !hasVtsParameters || !rowEnabled || vtsState !== 'connected'}
                              >
                                <option value="">{t('vts_parameter_none', 'Not selected')}</option>
                                {vtsParameters.map((parameter) => (
                                  <option key={parameter.id} value={parameter.id}>
                                    {parameter.name} ({parameter.id})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('vts_range_min', 'Min')}</label>
                              <input
                                type="number"
                                step="0.01"
                                min={Math.min(parameterMin, parameterMax)}
                                max={Math.max(parameterMin, parameterMax)}
                                value={resolvedMinValue}
                                disabled={isOverlayLocked || !selectedParameterId || !rowEnabled || vtsState !== 'connected'}
                                onChange={(event) => onVtsRangeChange?.(row.minKey, event.target.value)}
                              />
                            </div>

                            <div>
                              <label className="label-text text-[10px] opacity-70 mb-1 block uppercase font-bold">{t('vts_range_max', 'Max')}</label>
                              <input
                                type="number"
                                step="0.01"
                                min={Math.min(parameterMin, parameterMax)}
                                max={Math.max(parameterMin, parameterMax)}
                                value={resolvedMaxValue}
                                disabled={isOverlayLocked || !selectedParameterId || !rowEnabled || vtsState !== 'connected'}
                                onChange={(event) => onVtsRangeChange?.(row.maxKey, event.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <p className="text-[10px] opacity-60">{t('vts_config_desc')}</p>
              </div>
            </section>
          </div>
        </div>

        {isOverlayLocked && (
          <div className="section-lock-overlay" role="status" aria-live="polite" style={{ pointerEvents: 'none' }}>
            <div className="section-lock-card">
              <p className="text-sm font-semibold">{t('rewards_locked')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function LogsSection({ logs, t }) {
  const fallbackAvatar = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png'

  return (
    <div id="section-logs" className="tab-content">
      <SectionTitle>{t('menu_logs_title')}</SectionTitle>
      <p className="text-gray-400 text-sm mb-4">{t('logs_help')}</p>
      <section className="card p-4">
        <div id="log-container" className="h-[500px] overflow-y-auto space-y-2 font-mono text-xs">
          {!logs?.length && (
            <div className="text-center text-gray-500 italic p-8">{t('no_logs_msg')}</div>
          )}

          {logs?.map((entry) => (
            <div key={entry.id} className="log-entry flex items-start gap-3 p-2 bg-white/5 border-l-2 rounded-r transition-colors" style={{ borderColor: 'var(--accent-primary)' }}>
              <div className="log-avatar">
                <img src={entry.avatar || fallbackAvatar} alt="" />
              </div>
              <div className="flex min-w-0 w-full flex-col">
                <div className="flex items-center gap-2">
                  {!!entry?.badgeImages?.length && (
                    <div className="log-badges">
                      {entry.badgeImages.map((badge) => (
                        <img key={badge.url} src={badge.url} alt={badge.title || ''} title={badge.title || ''} />
                      ))}
                    </div>
                  )}
                  <strong className="text-sm font-bold truncate" style={{ color: 'var(--accent-primary)' }}>{entry.user}</strong>
                  {(entry.rewardId || entry.usedRewardRule) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider badge-reward-accent">{t('reward_badge')}</span>
                  )}
                  {entry.usedUserVoiceRule && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider badge-user-voice-accent">{t('user_voice_badge', 'USER VOICE')}</span>
                  )}
                  <span className="text-gray-500 text-[10px] font-mono ml-auto opacity-60">{entry.time}</span>
                </div>
                <div className="text-sm leading-relaxed break-words mt-1" style={{ color: 'var(--text-main)' }}>
                  {renderEmoteText(entry.text, entry.emotes)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function AboutSection({ t, projectGithubUrl }) {
  const [showLicense, setShowLicense] = useState(false)
  const licenseModal = showLicense && typeof document !== 'undefined'
    ? createPortal(
      <div className="fixed inset-0 overlay-mask modal-active p-4" role="dialog" aria-modal="true">
        <div className="modal-card w-full max-w-3xl p-8 rounded-2xl shadow-2xl text-left flex flex-col" style={{ maxHeight: '90vh' }}>
          <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
            <h3 className="font-bold text-xl text-white">{t('about_license_button', 'View license')}</h3>
            <button
              type="button"
              onClick={() => setShowLicense(false)}
              className="editor-close-btn cursor-pointer hover:text-red-500 transition-colors"
              aria-label={t('close', 'Close')}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="update-modal-markdown overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: 'calc(90vh - 120px)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {LICENSE_TEXT}
            </ReactMarkdown>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div id="section-about" className="tab-content">
        <SectionTitle>{t('about_title', 'About')}</SectionTitle>
        <div className="grid gap-6">
          <section className="card space-y-3">
            <label className="label-text">{t('about_intro_title', 'Project')}</label>
            <p className="text-sm leading-relaxed text-gray-500">
              {t('about_intro', 'AetherStream is a desktop tool for Twitch TTS, voice rules, and stream overlays.')}
            </p>
          </section>

          <section className="card space-y-3">
            <label className="label-text">{t('about_links_title', 'Links')}</label>
            <div className="grid gap-3">
              <LinkCard
                href={projectGithubUrl}
                title={t('about_github', 'GitHub')}
                description={t('about_github_desc', 'Source code, issues, and releases.')}
                icon={Github}
              />
              <LinkCard
                title={t('about_discord', 'Discord')}
                description={t('about_discord_desc', 'Community link coming soon.')}
                icon={SiDiscord}
                disabled
              />
              <LinkCard
                title={t('about_website', 'Website')}
                description={t('about_website_desc', 'Project website coming soon.')}
                icon={Globe}
                disabled
              />
            </div>
          </section>

          <section className="card space-y-3">
            <label className="label-text">{t('about_developer_title', 'Developer')}</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500 leading-relaxed sm:max-w-[70%]">
                {t('about_developer', 'Built by Daikh • © 2025-2026')}
              </p>
              <button
                type="button"
                className="btn-primary px-4 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg shadow-sky-500/20 whitespace-nowrap sm:self-start"
                onClick={() => setShowLicense(true)}
              >
                {t('about_license_button', 'View license')}
              </button>
            </div>
          </section>
        </div>
      </div>
      {licenseModal}
    </>
  )
}

export function ResetSection({
  onRequestFactoryReset,
  onExportPreset,
  onImportPreset,
  onRequestClearCache,
  onCheckForUpdates,
  isCheckingForUpdates,
  t,
}) {
  return (
    <div id="section-reset" className="tab-content">
      <SectionTitle>{t('system_tools_title')}</SectionTitle>
      <div className="grid gap-6">
        <section className="card">
          <label className="label-text mb-2">{t('auto_update_title')}</label>
          <p className="text-[10px] text-gray-500 mb-4">{t('auto_update_help')}</p>
          <button
            type="button"
            onClick={onCheckForUpdates}
            disabled={Boolean(isCheckingForUpdates)}
            className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg shadow-sky-500/20"
            title={t('auto_update_help')}
          >
            {isCheckingForUpdates ? `${t('processing')}...` : t('auto_update_action')}
          </button>
        </section>

        <section className="card">
          <label className="label-text mb-2">{t('preset_transfer_title')}</label>
          <p className="text-[10px] text-gray-500 mb-4">{t('preset_transfer_help')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onExportPreset}
              className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg shadow-sky-500/20"
            >
              {t('preset_export')}
            </button>
            <button
              type="button"
              onClick={onImportPreset}
              className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg shadow-sky-500/20"
            >
              {t('preset_import')}
            </button>
          </div>
        </section>

        <section className="card border-red-500/30 bg-red-500/5 maintenance-danger-card">
          <label className="label-text mb-2">{t('danger_zone_title', 'Danger Zone')}</label>
          <p className="text-[10px] text-gray-400 mb-5">{t('danger_zone_help', 'Critical maintenance actions. Continue only if necessary.')}</p>

          <div className="grid grid-cols-1 gap-3 mb-4">
            <button
              type="button"
              onClick={onRequestClearCache}
              className="btn-shine w-full py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-red-900/20 bg-red-600 hover:bg-red-700 text-white maintenance-action maintenance-action-cache"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('cache_clear_action')}</span>
            </button>
            <p className="text-[10px] text-gray-400">{t('cache_clear_help')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={onRequestFactoryReset}
              className="btn-shine w-full py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-red-900/20 bg-red-700 hover:bg-red-800 text-white maintenance-action"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('btn_reset')}</span>
            </button>
            <p className="text-[10px] text-gray-400">{t('reset_desc')}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

export function SectionRenderer({
  activeSection,
  t,
  projectGithubUrl,
  appLang,
  onLanguageChange,
  onValidateAzure,
  onToggleSensitiveField,
  showAzureKey,
  isValidatingAzure,
  onThemeChange,
  onAccentChange,
  animationsEnabled,
  onAnimationsToggle,
  trayEnabled,
  onTrayToggle,
  onTestTts,
  onPreviewVoice,
  onLiveTtsChange,
  onConnectTwitch,
  onDisconnectTwitch,
  showTwitchToken,
  onTogglePause,
  onSkip,
  onClear,
  isPaused,
  hotkeys,
  onHotkeyChange,
  onClearHotkey,
  audioDevices,
  selectedAudioDevice,
  onSelectAudioDevice,
  onRefreshAudioDevices,
  isRefreshingAudioDevices,
  audioOutputSupported,
  audioDeviceError,
  onRequestFactoryReset,
  twitchConnection,
  logs,
  ttsState,
  rewardRules,
  userVoiceRules,
  azureVoices,
  onFetchRewards,
  onUpsertRewardRule,
  onDeleteRewardRule,
  onUpsertUserRule,
  onDeleteUserRule,
  config,
  onExportPreset,
  onImportPreset,
  onRequestClearCache,
  onCheckForUpdates,
  isCheckingForUpdates,
  onModerationToggle,
  onModerationSelectChange,
  onPermissionRoleToggle,
  onMaxRepetitionChange,
  onWordBlacklistChange,
  onUserBlacklistChange,
  overlayUrl,
  vtsConnection,
  onToggleObsServer,
  onOverlayStatusToggle,
  onOverlayResolutionChange,
  onOverlayLayoutChange,
  onToggleVtsEnabled,
  onVtsPortChange,
  onToggleVtsConnection,
  onToggleVtsChannel,
  onVtsMappingChange,
  onVtsRangeChange,
  onRefreshVtsParameters,
  onCopyOverlayUrl,
  onToast,
}) {
  switch (activeSection) {
    case 'azure':
      return (
        <AzureSection
          onValidateAzure={onValidateAzure}
          onToggleSensitiveField={onToggleSensitiveField}
          showAzureKey={showAzureKey}
          onLiveTtsChange={onLiveTtsChange}
          isValidatingAzure={isValidatingAzure}
          config={config}
          azureVoices={azureVoices}
          onPreviewVoice={onPreviewVoice}
          t={t}
        />
      )
    case 'audio':
      return (
        <AudioSection
          onTogglePause={onTogglePause}
          onSkip={onSkip}
          onClear={onClear}
          isPaused={isPaused}
          ttsState={ttsState}
          audioDevices={audioDevices}
          selectedAudioDevice={selectedAudioDevice}
          volumeValue={config?.volume ?? 50}
          onSelectAudioDevice={onSelectAudioDevice}
          onRefreshAudioDevices={onRefreshAudioDevices}
          isRefreshingAudioDevices={isRefreshingAudioDevices}
          audioOutputSupported={audioOutputSupported}
          audioDeviceError={audioDeviceError}
          onLiveTtsChange={onLiveTtsChange}
          hotkeys={hotkeys}
          onHotkeyChange={onHotkeyChange}
          onClearHotkey={onClearHotkey}
          onTestTts={onTestTts}
          t={t}
        />
      )
    case 'twitch':
      return (
        <TwitchSection
          onConnectTwitch={onConnectTwitch}
          onDisconnectTwitch={onDisconnectTwitch}
          onToggleSensitiveField={onToggleSensitiveField}
          twitchConnection={twitchConnection}
          showTwitchToken={showTwitchToken}
          t={t}
        />
      )
    case 'rewards':
      return (
        <RewardsSection
          rewardRules={rewardRules}
          azureVoices={azureVoices}
          appLang={appLang}
          defaultVoice={config?.voice_name}
          defaultLocale={config?.language_filter}
          twitchConnection={twitchConnection}
          onFetchRewards={onFetchRewards}
          onUpsertRewardRule={onUpsertRewardRule}
          onDeleteRewardRule={onDeleteRewardRule}
          t={t}
          onToast={onToast}
        />
      )
    case 'voices':
      return (
        <VoicesSection
          userVoiceRules={userVoiceRules}
          azureVoices={azureVoices}
          appLang={appLang}
          defaultVoice={config?.voice_name}
          defaultLocale={config?.language_filter}
          twitchConnection={twitchConnection}
          onUpsertUserRule={onUpsertUserRule}
          onDeleteUserRule={onDeleteUserRule}
          t={t}
          onToast={onToast}
        />
      )
    case 'appearance':
      return (
        <AppearanceSection
          appLang={appLang}
          onLanguageChange={onLanguageChange}
          onThemeChange={onThemeChange}
          onAccentChange={onAccentChange}
          animationsEnabled={animationsEnabled}
          onAnimationsToggle={onAnimationsToggle}
          trayEnabled={trayEnabled}
          onTrayToggle={onTrayToggle}
          t={t}
        />
      )
    case 'visuals':
      return (
        <VisualsSection
          config={config}
          overlayUrl={overlayUrl}
          twitchConnection={twitchConnection}
          ttsState={ttsState}
          vtsConnection={vtsConnection}
          onToggleObsServer={onToggleObsServer}
          onOverlayStatusToggle={onOverlayStatusToggle}
          onOverlayResolutionChange={onOverlayResolutionChange}
          onOverlayLayoutChange={onOverlayLayoutChange}
          onToggleVtsEnabled={onToggleVtsEnabled}
          onVtsPortChange={onVtsPortChange}
          onToggleVtsConnection={onToggleVtsConnection}
          onToggleVtsChannel={onToggleVtsChannel}
          onVtsMappingChange={onVtsMappingChange}
          onVtsRangeChange={onVtsRangeChange}
          onRefreshVtsParameters={onRefreshVtsParameters}
          onCopyOverlayUrl={onCopyOverlayUrl}
          onToast={onToast}
          t={t}
        />
      )
    case 'blacklist':
      return (
        <BlacklistSection
          config={config}
          onModerationToggle={onModerationToggle}
          onModerationSelectChange={onModerationSelectChange}
          onPermissionRoleToggle={onPermissionRoleToggle}
          onMaxRepetitionChange={onMaxRepetitionChange}
          onWordBlacklistChange={onWordBlacklistChange}
          onUserBlacklistChange={onUserBlacklistChange}
          t={t}
        />
      )
    case 'logs':
      return <LogsSection logs={logs} t={t} />
    case 'about':
      return <AboutSection t={t} projectGithubUrl={projectGithubUrl} />
    case 'reset':
      return (
        <ResetSection
          onRequestFactoryReset={onRequestFactoryReset}
          onExportPreset={onExportPreset}
          onImportPreset={onImportPreset}
          onRequestClearCache={onRequestClearCache}
          onCheckForUpdates={onCheckForUpdates}
          isCheckingForUpdates={isCheckingForUpdates}
          t={t}
        />
      )
    default:
      return (
        <AudioSection
          onTogglePause={onTogglePause}
          onSkip={onSkip}
          onClear={onClear}
          isPaused={isPaused}
          ttsState={ttsState}
          audioDevices={audioDevices}
          selectedAudioDevice={selectedAudioDevice}
          volumeValue={config?.volume ?? 50}
          onSelectAudioDevice={onSelectAudioDevice}
          onRefreshAudioDevices={onRefreshAudioDevices}
          isRefreshingAudioDevices={isRefreshingAudioDevices}
          audioOutputSupported={audioOutputSupported}
          audioDeviceError={audioDeviceError}
          onLiveTtsChange={onLiveTtsChange}
          hotkeys={hotkeys}
          onHotkeyChange={onHotkeyChange}
          onClearHotkey={onClearHotkey}
          onTestTts={onTestTts}
          t={t}
        />
      )
  }
}


