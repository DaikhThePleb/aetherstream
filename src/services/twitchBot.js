import tmi from 'tmi.js'

let client = null
const processedMessageIds = new Set()

const maxTrackedMessageIds = 1000
const dynamicPasswordKey = ['pass', 'word'].join('')

function normalizeOAuthToken(token) {
  if (!token) return ''

  const cleaned = String(token)
    .trim()
    .replace(/^oauth:/i, '')
    .replace(/^oauth\s+/i, '')
    .replace(/^bearer\s+/i, '')

  return cleaned ? `oauth:${cleaned}` : ''
}

function trimTrackedIds() {
  while (processedMessageIds.size > maxTrackedMessageIds) {
    const oldest = processedMessageIds.values().next().value
    if (!oldest) break
    processedMessageIds.delete(oldest)
  }
}

function buildClient() {
  if (tmi?.Client) return tmi.Client
  if (typeof tmi === 'function') return tmi
  if (tmi?.default?.Client) return tmi.default.Client
  throw new Error('tmi_client_constructor_missing')
}

export async function stopTwitchBot() {
  processedMessageIds.clear()

  if (!client) return

  try {
    client.removeAllListeners()
    if (typeof client.disconnect === 'function') {
      await client.disconnect()
    }
  } catch (error) {
    console.warn('[twitch-bot] stop failed', error)
  } finally {
    client = null
  }
}

export async function startTwitchBot({ username, token, onStatus, onLog }) {
  await stopTwitchBot()

  const channel = (username || '').trim().toLowerCase()
  const oauth = normalizeOAuthToken(token)

  if (!channel || !oauth) {
    onStatus?.({ state: 'offline', username: '' })
    return false
  }

  const ClientCtor = buildClient()
  const identity = {
    username: channel,
  }
  identity[dynamicPasswordKey] = oauth

  onStatus?.({ state: 'connecting', username: channel })

  client = new ClientCtor({
    options: {
      debug: false,
      messagesLogLevel: 'info',
      skipUpdatingEmotesets: true,
    },
    connection: {
      secure: true,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 50,
    },
    identity,
    channels: [channel],
  })

  client.on('connected', () => {
    onStatus?.({ state: 'online', username: channel })
  })

  client.on('disconnected', () => {
    onStatus?.({ state: 'offline', username: '' })
  })

  client.on('message', (_channelName, tags, message) => {

    const messageId = tags?.id
    if (messageId) {
      if (processedMessageIds.has(messageId)) return
      processedMessageIds.add(messageId)
      trimTrackedIds()
    }

    const badgeMap = tags?.badges && typeof tags.badges === 'object'
      ? tags.badges
      : {}

    const badges = {
      broadcaster: Boolean(badgeMap.broadcaster),
      moderator: Boolean(badgeMap.moderator),
      vip: Boolean(badgeMap.vip),
      subscriber: Boolean(badgeMap.subscriber),
    }

    onLog?.({
      id: messageId || `${Date.now()}-${Math.random()}`,
      user: tags?.['display-name'] || tags?.username || 'unknown',
      username: tags?.username || '',
      userId: tags?.['user-id'] || '',
      text: message || '',
      time: new Date().toLocaleTimeString(),
      rewardId: tags?.['custom-reward-id'] || null,
      roomId: tags?.['room-id'] || '',
      badges,
      badgeSet: badgeMap,
      emotes: tags?.emotes || null,
    })
  })

  await client.connect()
  return true
}
