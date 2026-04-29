import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const isTauriRuntime = () => {
  try {
    return Boolean(isTauri())
  } catch {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  }
}

async function safeInvoke(command, args = {}, fallback = null) {
  if (!isTauriRuntime()) return fallback

  try {
    return await invoke(command, args)
  } catch (error) {
    const message = String(error?.message || error || '')
    if (message.includes("Couldn't find callback id")) {
      return fallback
    }

    console.error(`[tauri invoke] ${command} failed`, error)
    return fallback
  }
}

export async function getConfig() {
  return (
    (await safeInvoke('get_config', {}, null)) ?? {
      azure_key: '',
      azure_region: 'westeurope',
      voice_name: 'en-US-JennyNeural',
      language_filter: 'en-US',
      volume: 50,
      audio_device: 'default',
      twitch_oauth: '',
      twitch_username: '',
      twitch_user_id: '',
      reward_rules_by_user: {},
      presets: [],
      active_preset_id: '',
      hotkeys: {
        toggle_pause: 'Ctrl+Shift+P',
        skip: 'Ctrl+Shift+S',
        clear: 'Ctrl+Shift+C',
        test_tts: 'Ctrl+Shift+T',
      },
      onboarding_complete: false,
      app_lang: 'en',
      theme: 'default',
      accent_primary: '#00f2ff',
      accent_secondary: '#a800ff',
      performance_mode: true,
      tray_enabled: false,
      obs_server_enabled: false,
      overlay_token: '',
      overlay_show_chat: false,
      overlay_show_status: true,
      overlay_show_tts_status: true,
      overlay_show_twitch_status: true,
      overlay_resolution: '1080p',
      overlay_layout: {
        chat: { x: 6, y: 70, scale: 1 },
        status_tts: { x: 80, y: 6, scale: 1 },
        status_twitch: { x: 80, y: 12, scale: 1 },
      },
      overlay_scale: 100,
      vts_enabled: false,
      vts_port: 8001,
      vts_auth_token: '',
      vts_mouth_open_enabled: true,
      vts_mouth_open_param: 'MouthOpen',
      vts_mouth_open_min: 0,
      vts_mouth_open_max: 1,
      vts_mouth_smile_enabled: true,
      vts_mouth_smile_param: 'MouthSmile',
      vts_mouth_smile_min: 0,
      vts_mouth_smile_max: 1,
      vts_jaw_open_enabled: true,
      vts_jaw_open_param: 'JawOpen',
      vts_jaw_open_min: 0,
      vts_jaw_open_max: 1,
    }
  )
}

export async function saveConfig(newConfig) {
  return (await safeInvoke('save_config', { newConfig }, { success: false, error: 'tauri_unavailable' }))
}

export async function getAppVersion() {
  return (await safeInvoke('get_app_version', {}, '0.2.0')) ?? '0.2.0'
}

export async function getLatestGithubRelease(owner, repo) {
  return (await safeInvoke(
    'get_latest_github_release',
    {
      owner: String(owner || '').trim(),
      repo: String(repo || '').trim(),
    },
    { success: false, error: 'update_check_failed' },
  ))
}

export async function openExternalUrl(url) {
  const safeUrl = String(url || '').trim()
  if (!safeUrl) {
    return { success: false, error: 'external_url_missing' }
  }

  if (!isTauriRuntime()) {
    try {
      window.open(safeUrl, '_blank', 'noopener,noreferrer')
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error?.message || error || 'external_url_open_failed') }
    }
  }

  return (await safeInvoke(
    'open_external_url',
    { url: safeUrl },
    { success: false, error: 'external_url_open_failed' },
  ))
}

export async function downloadAndRunInstaller(url, fileName = '') {
  const safeUrl = String(url || '').trim()
  const safeFileName = String(fileName || '').trim()

  if (!safeUrl) {
    return { success: false, error: 'installer_url_missing' }
  }

  if (!isTauriRuntime()) {
    return { success: false, error: 'tauri_unavailable' }
  }

  return (await safeInvoke(
    'download_and_run_installer',
    {
      url: safeUrl,
      fileName: safeFileName,
    },
    { success: false, error: 'installer_download_failed' },
  ))
}

export async function factoryReset() {
  return (await safeInvoke('factory_reset', {}, { success: false }))
}

export async function fetchAzureVoices() {
  return (await safeInvoke('fetch_azure_voices', {}, [])) ?? []
}

export async function validateAzureAndFetchVoices(azureKey, azureRegion) {
  return (
    (await safeInvoke(
      'validate_azure_and_fetch_voices',
      {
        azureKey,
        azureRegion,
      },
      { success: false, voices: [], error: 'err_azure_invalid' },
    )) ?? { success: false, voices: [], error: 'err_azure_invalid' }
  )
}

export async function testTts(payload) {
  return (await safeInvoke('test_tts', { data: payload }, { success: false }))
}

export async function synthesizeTts(payload) {
  return (await safeInvoke('synthesize_tts', { data: payload }, { success: false }))
}

export async function playTts(payload) {
  return (await safeInvoke('play_tts', { data: payload }, { success: false }))
}

export async function listAudioOutputDevices() {
  return (await safeInvoke('list_audio_output_devices', {}, null))
}

export async function ttsPause() {
  return (await safeInvoke('tts_pause', {}, true)) ?? true
}

export async function ttsResume() {
  return (await safeInvoke('tts_resume', {}, true)) ?? true
}

export async function ttsSkip() {
  return (await safeInvoke('tts_skip', {}, true)) ?? true
}

export async function ttsClear() {
  return (await safeInvoke('tts_clear', {}, true)) ?? true
}

export async function twitchLogin(clientId, lang, theme, accentPrimary, accentSecondary) {
  return (await safeInvoke(
    'twitch_login',
    {
      clientId: String(clientId || '').trim(),
      lang: String(lang || 'en').trim(),
      theme: String(theme || 'dark').trim(),
      primaryColor: String(accentPrimary || '#00b4ff').trim(),
      secondaryColor: String(accentSecondary || '#a800ff').trim(),
    },
    { success: false, error: 'interactive_oauth_not_implemented' },
  ))
}

export async function validateTwitchToken(token) {
  return (await safeInvoke('validate_twitch_token', { token }, { success: false }))
}

export async function fetchTwitchRewards() {
  return (
    (await safeInvoke('fetch_twitch_rewards', {}, { success: false, rewards: [] })) ?? {
      success: false,
      rewards: [],
    }
  )
}

export async function fetchTwitchRewardRedemptions(rewardIds) {
  return (
    (await safeInvoke('fetch_twitch_reward_redemptions', { rewardIds }, { success: false, redemptions: [] })) ?? {
      success: false,
      redemptions: [],
    }
  )
}

export async function createTwitchReward(rewardData) {
  return (await safeInvoke('create_twitch_reward', { rewardData }, { success: false }))
}

export async function updateTwitchReward(rewardData) {
  return (await safeInvoke('update_twitch_reward', { rewardData }, { success: false }))
}

export async function deleteTwitchReward(rewardId) {
  return (await safeInvoke('delete_twitch_reward', { rewardId }, { success: false }))
}

export async function completeTwitchRedemption(rewardId, redemptionId) {
  return (await safeInvoke('complete_twitch_redemption', { rewardId, redemptionId }, { success: false }))
}

export async function ensureOverlayServer() {
  return (await safeInvoke('ensure_overlay_server', {}, { success: false }))
}

export async function overlaySetEnabled(enabled) {
  return (await safeInvoke('overlay_set_enabled', { enabled }, { success: false }))
}

export async function overlayUpdateScale(scale) {
  return (await safeInvoke('overlay_update_scale', { scale }, { success: false }))
}

export async function overlayUpdateConfig(configPatch) {
  return (await safeInvoke('overlay_update_config', { configPatch }, { success: false }))
}

export async function overlayPushEvent(eventPayload) {
  return (await safeInvoke('overlay_push_event', { eventPayload }, { success: false }))
}

export async function exportPresetFile(defaultName, contents) {
  return (await safeInvoke(
    'export_preset_file',
    { defaultName, contents },
    { success: false, canceled: true },
  ))
}

export async function importPresetFile() {
  return (await safeInvoke(
    'import_preset_file',
    {},
    { success: false, canceled: true, contents: '' },
  ))
}

async function withWindow(callback) {
  if (!isTauriRuntime()) return
  const currentWindow = getCurrentWindow()
  try {
    await callback(currentWindow)
  } catch (error) {
    console.error('Window operation failed', error)
  }
}

export async function minimizeWindow() {
  await withWindow((windowHandle) => windowHandle.minimize())
}

export async function hideWindow() {
  await withWindow((windowHandle) => windowHandle.hide())
}

export async function toggleMaximizeWindow() {
  await withWindow(async (windowHandle) => {
    const isMaximized = await windowHandle.isMaximized()
    if (isMaximized) {
      await windowHandle.unmaximize()
    } else {
      await windowHandle.maximize()
    }
  })
}

export async function closeWindow() {
  await withWindow((windowHandle) => windowHandle.close())
}

export async function exitApplication() {
  return (await safeInvoke('exit_application', {}, { success: false }))
}

export async function setGlobalHotkeys(hotkeys) {
  return (await safeInvoke(
    'set_global_hotkeys',
    { hotkeys },
    { success: false, failed: [], registered: [] },
  ))
}

export async function setTrayEnabled(enabled, labels = {}) {
  return (await safeInvoke(
    'set_tray_enabled',
    {
      enabled: Boolean(enabled),
      labels,
    },
    { success: false, enabled: false },
  ))
}

export async function sendToTray(labels = {}) {
  return (await safeInvoke(
    'send_to_tray',
    {
      labels,
    },
    { success: false },
  ))
}

export async function updateTrayLanguage(labels = {}) {
  return (await safeInvoke('update_tray_lang', { labels }, true)) ?? true
}

export async function onBackendEvent(eventName, handler) {
  if (!isTauriRuntime()) return () => {}

  try {
    const unlisten = await listen(String(eventName || '').trim(), (event) => {
      handler?.(event?.payload)
    })

    return () => {
      try {
        unlisten?.()
      } catch {
        // ignore unlisten failures
      }
    }
  } catch (error) {
    console.error(`Failed to subscribe backend event: ${String(eventName || '')}`, error)
    return () => {}
  }
}

export async function onWindowCloseRequested(handler) {
  if (!isTauriRuntime()) return () => {}

  try {
    const currentWindow = getCurrentWindow()
    return await currentWindow.onCloseRequested((event) => {
      handler?.(event)
    })
  } catch (error) {
    console.error('Failed to subscribe close-request handler', error)
    return () => {}
  }
}
