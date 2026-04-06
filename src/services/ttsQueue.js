import {
  playTts,
  ttsClear,
  ttsPause,
  ttsResume,
  ttsSkip,
} from './tauriApi'

let queue = []
let currentItem = null
let isPaused = false

let config = {
  voice_name: 'en-US-JennyNeural',
  volume: 50,
  audio_device: 'default',
  global_speed: '1.0',
  global_pitch: '1.0',
  global_style: 'general',
}

const listeners = new Set()

function emitState() {
  const status = isPaused ? 'PAUSED' : currentItem ? 'PLAYING' : 'IDLE'
  const count = queue.length + (currentItem ? 1 : 0)

  listeners.forEach((listener) => {
    try {
      listener({ status, count })
    } catch (error) {
      console.error('[tts-queue] listener failed', error)
    }
  })
}

function finishCurrentItem(success = true, error = null) {
  if (currentItem?.resolve) {
    currentItem.resolve({ success, error })
  }

  currentItem = null
  emitState()
  void processQueue()
}

async function processQueue() {
  if (currentItem || isPaused) {
    emitState()
    return
  }

  const next = queue.shift()
  if (!next) {
    emitState()
    return
  }

  currentItem = next
  emitState()

  try {
    const response = await playTts({
      text: next.text,
      voice: next.voice || config.voice_name,
      rate: next.rate || config.global_speed || '1.0',
      pitch: next.pitch || config.global_pitch || '1.0',
      style: next.style || config.global_style || 'general',
      volume: config.volume ?? 50,
      audio_device: config.audio_device || 'default',
    })

    if (!response?.success) {
      finishCurrentItem(false, response?.error || 'tts_playback_failed')
      return
    }
    finishCurrentItem(true)
  } catch (error) {
    console.error('[tts-queue] process failed', error)
    finishCurrentItem(false, error?.message || 'tts_queue_failed')
  }
}

export function configureTtsQueue(nextConfig = {}) {
  config = {
    ...config,
    ...nextConfig,
  }
}

export function subscribeTtsQueue(listener) {
  if (typeof listener !== 'function') return () => {}

  listeners.add(listener)
  listener({
    status: isPaused ? 'PAUSED' : currentItem ? 'PLAYING' : 'IDLE',
    count: queue.length + (currentItem ? 1 : 0),
  })

  return () => {
    listeners.delete(listener)
  }
}

export function enqueueTts(text, options = {}) {
  return new Promise((resolve) => {
    if (!text || !String(text).trim()) {
      resolve({ success: false, error: 'tts_text_missing' })
      return
    }

    queue.push({
      text: String(text).trim(),
      voice: options.voice,
      rate: options.rate,
      pitch: options.pitch,
      style: options.style,
      resolve,
    })

    emitState()
    void processQueue()
  })
}

export function pauseTtsQueue() {
  if (isPaused) return false

  isPaused = true
  emitState()
  if (currentItem) {
    void ttsPause()
  }
  return true
}

export async function resumeTtsQueue() {
  if (!isPaused) return false

  isPaused = false
  emitState()
  if (currentItem) {
    await ttsResume()
  }
  void processQueue()
  return true
}

export function skipTtsQueue() {
  if (!currentItem) return false
  void ttsSkip()
  finishCurrentItem(false, 'tts_skipped')
  return true
}

export function clearTtsQueue() {
  while (queue.length > 0) {
    const item = queue.shift()
    item?.resolve?.({ success: false, error: 'tts_cleared' })
  }

  if (!currentItem) {
    emitState()
    return true
  }
  void ttsClear()
  finishCurrentItem(false, 'tts_cleared')
  return true
}
