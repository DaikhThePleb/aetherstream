const PLUGIN_NAME = 'AetherStream TTS'
const DEVELOPER_NAME = 'AetherStream'

let socket = null
let keepAliveTimer = null
let authToken = ''

let parameterConfig = {
  MouthOpen: { min: 0, max: 1 },
}

let status = {
  state: 'offline',
  port: 8001,
  authenticated: false,
  error: '',
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
  sendRequest('InputParameterListRequest', {})
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

function handleVtsMessage(rawMessage, onToken) {
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
      authToken = ''
      emitStatus({
        state: 'denied',
        authenticated: false,
        error: 'vts_auth_denied',
      })
      disconnectVts()
    }

    return
  }

  if (type === 'InputParameterListResponse') {
    const defaultParameters = Array.isArray(data?.defaultParameters) ? data.defaultParameters : []
    const customParameters = Array.isArray(data?.customParameters) ? data.customParameters : []
    const allParameters = [...defaultParameters, ...customParameters]

    const mouthParameter = allParameters.find((parameter) => parameter?.name === 'MouthOpen')
    if (mouthParameter) {
      parameterConfig = {
        ...parameterConfig,
        MouthOpen: {
          min: Number.isFinite(Number(mouthParameter.min)) ? Number(mouthParameter.min) : 0,
          max: Number.isFinite(Number(mouthParameter.max)) ? Number(mouthParameter.max) : 1,
        },
      }
    }

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
    handleVtsMessage(event?.data, onToken)
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

  socket.onclose = () => {
    if (socket !== currentSocket) return
    stopKeepAlive()
    socket = null

    const closedDuringHandshake = status.state === 'connecting' || status.state === 'authorizing'

    if (hadSocketError || closedDuringHandshake) {
      emitStatus({
        state: 'error',
        authenticated: false,
        error: 'vts_socket_error',
      })
      return
    }

    emitStatus({
      state: 'offline',
      authenticated: false,
      error: '',
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
  })
}

export function injectVtsMouth(value) {
  if (!isSocketOpen() || status.state !== 'connected') {
    return false
  }

  const numeric = Number(value)
  const min = parameterConfig?.MouthOpen?.min ?? 0
  const max = parameterConfig?.MouthOpen?.max ?? 1

  const clamped = Number.isFinite(numeric)
    ? Math.max(min, Math.min(max, numeric))
    : 0

  return sendRequest('InjectParameterDataRequest', {
    parameterValues: [
      {
        id: 'MouthOpen',
        value: clamped,
      },
    ],
    mode: 'set',
  })
}
