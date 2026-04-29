const PLUGIN_NAME = 'AetherStream TTS'
const DEVELOPER_NAME = 'AetherStream'

let socket = null
let keepAliveTimer = null
let authToken = ''
let parameterCatalog = new Map()

let status = {
  state: 'offline',
  port: 8001,
  authenticated: false,
  error: '',
  parameters: [],
}

const listeners = new Set()

function emitStatus(patch = {}) {
  status = {
    ...status,
    ...patch,
  }

  listeners.forEach((listener) => {
    try {
      listener(status)
    } catch (error) {
      console.error('[vts] status listener failed', error)
    }
  })
}

function stopKeepAlive() {
  if (!keepAliveTimer) return
  clearInterval(keepAliveTimer)
  keepAliveTimer = null
}

function startKeepAlive() {
  stopKeepAlive()
  keepAliveTimer = setInterval(() => {
    sendRequest('APIStateRequest', {})
  }, 5000)
}

function isSocketOpen() {
  return Boolean(socket) && socket.readyState === WebSocket.OPEN
}

function sendRequest(messageType, data = {}) {
  if (!isSocketOpen()) {
    return false
  }

  try {
    socket.send(
      JSON.stringify({
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        requestID: `Aether-${Date.now()}`,
        messageType,
        data,
      }),
    )

    return true
  } catch (error) {
    console.error('[vts] send request failed', error)
    return false
  }
}

function requestParameterList() {
  return sendRequest('InputParameterListRequest', {})
}

function normalizeParameterEntry(parameter) {
  const fallbackId = parameter?.id || parameter?.parameterID || parameter?.name || parameter?.parameterName
  const id = String(fallbackId || '').trim()
  if (!id) return null

  const label = String(
    parameter?.name
    || parameter?.parameterName
    || parameter?.id
    || parameter?.parameterID
    || id,
  ).trim() || id
  const min = Number(parameter?.min)
  const max = Number(parameter?.max)
  const defaultValue = Number(parameter?.defaultValue)

  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) ? max : 1
  const safeDefaultValue = Number.isFinite(defaultValue)
    ? defaultValue
    : safeMin

  return {
    id,
    name: label,
    min: safeMin,
    max: safeMax,
    defaultValue: safeDefaultValue,
  }
}

function sendAuthentication() {
  if (authToken) {
    sendRequest('AuthenticationRequest', {
      pluginName: PLUGIN_NAME,
      pluginDeveloper: DEVELOPER_NAME,
      authenticationToken: authToken,
    })
  } else {
    sendRequest('AuthenticationTokenRequest', {
      pluginName: PLUGIN_NAME,
      pluginDeveloper: DEVELOPER_NAME,
    })
  }
}

function handleVtsMessage(rawMessage, onToken, connectionContext = null) {
  let message

  try {
    message = JSON.parse(rawMessage)
  } catch {
    return
  }

  const type = message?.messageType
  const data = message?.data || {}

  if (type === 'AuthenticationTokenResponse') {
    const token = data?.authenticationToken || ''
    if (token) {
      authToken = token

      if (typeof onToken === 'function') {
        try {
          onToken(token)
        } catch (error) {
          console.error('[vts] onToken callback failed', error)
        }
      }

      sendRequest('AuthenticationRequest', {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: DEVELOPER_NAME,
        authenticationToken: token,
      })
    }

    return
  }

  if (type === 'AuthenticationResponse') {
    if (data?.authenticated) {
      emitStatus({
        state: 'connected',
        authenticated: true,
        error: '',
      })
      requestParameterList()
      startKeepAlive()
    } else {
      const canRetryWithFreshToken = Boolean(connectionContext?.canRetryWithFreshToken)
      const hadCachedToken = Boolean(authToken)

      if (hadCachedToken && canRetryWithFreshToken) {
        authToken = ''
        if (connectionContext) {
          connectionContext.canRetryWithFreshToken = false
        }

        // Cached token can become stale. Request a fresh token once before failing.
        sendAuthentication()
        emitStatus({
          state: 'authorizing',
          authenticated: false,
          error: '',
        })
        return
      }

      emitStatus({
        state: 'denied',
        authenticated: false,
        error: 'vts_auth_denied',
      })
    }

    return
  }

  if (type === 'InputParameterListResponse') {
    const defaultParameters = Array.isArray(data?.defaultParameters) ? data.defaultParameters : []
    const customParameters = Array.isArray(data?.customParameters) ? data.customParameters : []
    const directParameters = Array.isArray(data?.parameters) ? data.parameters : []
    const inputParameters = Array.isArray(data?.inputParameters) ? data.inputParameters : []

    const allParameters = [
      ...defaultParameters,
      ...customParameters,
      ...directParameters,
      ...inputParameters,
    ]
      .map((parameter) => normalizeParameterEntry(parameter))
      .filter(Boolean)

    const deduped = new Map()
    allParameters.forEach((parameter) => {
      deduped.set(parameter.id, parameter)
    })

    const normalizedParameters = [...deduped.values()]
      .sort((left, right) => left.name.localeCompare(right.name))

    parameterCatalog = new Map(normalizedParameters.map((parameter) => [parameter.id, parameter]))
    emitStatus({
      state: 'connected',
      authenticated: true,
      error: '',
      parameters: normalizedParameters,
    })

    return
  }

  if (type === 'APIError') {
    emitStatus({
      state: 'error',
      authenticated: false,
      error: data?.message || 'vts_api_error',
    })
  }
}

export function setVtsAuthToken(token) {
  authToken = String(token || '').trim()
}

export function getVtsAuthToken() {
  return authToken
}

export function subscribeVtsStatus(listener) {
  if (typeof listener !== 'function') return () => {}

  listeners.add(listener)
  listener(status)

  return () => {
    listeners.delete(listener)
  }
}

export function connectVts({ port = 8001, token = '', onToken } = {}) {
  const numericPort = Number.parseInt(String(port), 10)
  const safePort = Number.isFinite(numericPort) && numericPort > 0 ? numericPort : 8001

  if (token) {
    authToken = String(token).trim()
  }

  if (socket && socket.readyState === WebSocket.CONNECTING && status.port === safePort) {
    return
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close()
  }

  emitStatus({
    state: 'connecting',
    port: safePort,
    authenticated: false,
    error: '',
  })

  try {
    socket = new WebSocket(`ws://127.0.0.1:${safePort}`)
  } catch (error) {
    emitStatus({
      state: 'error',
      authenticated: false,
      error: error?.message || 'vts_socket_create_failed',
    })
    return
  }

  const currentSocket = socket
  let hadSocketError = false
  const connectionContext = {
    canRetryWithFreshToken: true,
  }

  socket.onopen = () => {
    if (socket !== currentSocket) return
    emitStatus({
      state: 'authorizing',
      port: safePort,
      authenticated: false,
      error: '',
    })
    sendAuthentication()
  }

  socket.onmessage = (event) => {
    if (socket !== currentSocket) return
    handleVtsMessage(event?.data, onToken, connectionContext)
  }

  socket.onerror = () => {
    if (socket !== currentSocket) return
    hadSocketError = true
    emitStatus({
      state: 'error',
      authenticated: false,
      error: 'vts_socket_error',
    })
  }

  socket.onclose = (event) => {
    if (socket !== currentSocket) return
    stopKeepAlive()
    socket = null

    const closedDuringHandshake = status.state === 'connecting' || status.state === 'authorizing'
    const closeCode = Number(event?.code)
    const closeReason = String(event?.reason || '').trim()
    const wasUnexpectedClose = Number.isFinite(closeCode) && closeCode !== 1000

    if (hadSocketError || closedDuringHandshake || wasUnexpectedClose) {
      emitStatus({
        state: 'error',
        authenticated: false,
        error: closeReason || `vts_socket_error${Number.isFinite(closeCode) ? `_${closeCode}` : ''}`,
      })
      return
    }

    emitStatus({
      state: 'offline',
      authenticated: false,
      error: '',
      parameters: [],
    })
  }
}

export function disconnectVts() {
  stopKeepAlive()

  const currentSocket = socket
  socket = null

  if (currentSocket) {
    try {
      currentSocket.close()
    } catch {
      // noop
    }
  }
  emitStatus({
    state: 'offline',
    authenticated: false,
    error: '',
    parameters: [],
  })
}

export function requestVtsParameters() {
  if (status.state !== 'connected') return false
  return requestParameterList()
}

export function injectVtsParameters(parameterValues = [], options = {}) {
  if (!isSocketOpen() || status.state !== 'connected') {
    return false
  }

  if (!Array.isArray(parameterValues) || parameterValues.length === 0) {
    return false
  }

  const requestedMode = String(options?.mode || 'set').toLowerCase()
  const mode = requestedMode === 'add' ? 'add' : 'set'

  const dedupedById = new Map()

  parameterValues.forEach((entry) => {
    const id = String(entry?.id || '').trim()
    const numericValue = Number(entry?.value)
    if (!id || !Number.isFinite(numericValue)) {
      return
    }

    const bounds = parameterCatalog.get(id)
    const min = Number.isFinite(bounds?.min) ? Number(bounds.min) : 0
    const max = Number.isFinite(bounds?.max) ? Number(bounds.max) : 1
    let clamped = Math.max(Math.min(min, max), Math.min(Math.max(min, max), numericValue))

    if (mode === 'add') {
      const deltaLimit = Math.max(1, Math.abs(max - min))
      clamped = Math.max(-deltaLimit, Math.min(deltaLimit, numericValue))
    }

    dedupedById.set(id, {
      id,
      value: clamped,
    })
  })

  if (!dedupedById.size) {
    return false
  }

  return sendRequest('InjectParameterDataRequest', {
    parameterValues: [...dedupedById.values()],
    mode,
  })
}

export function injectVtsMouth(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return false
  }

  return injectVtsParameters([
    {
      id: 'MouthOpen',
      value: numeric,
    },
  ])
}
