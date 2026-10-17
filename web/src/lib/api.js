async function request(url, options = {}) {
  const { body, headers, ...rest } = options
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `请求失败（HTTP ${response.status}）`)
    error.status = response.status
    error.code = data?.code
    throw error
  }

  return data
}

export const api = {
  health: () => request('/api/health'),
  getDrives: (refresh = false) => request(`/api/drives${refresh ? '?refresh=1' : ''}`),
  getTools: (refresh = false) => request(`/api/tools${refresh ? '?refresh=1' : ''}`),
  parseTorrent: (torrentPath) =>
    request('/api/torrent/parse', {
      method: 'POST',
      body: { path: torrentPath },
    }),
  openTorrent: (torrentPath, toolId) =>
    request('/api/open', {
      method: 'POST',
      body: { path: torrentPath, toolId },
    }),
  revealTorrent: (torrentPath) =>
    request('/api/reveal', {
      method: 'POST',
      body: { path: torrentPath },
    }),
  pickFolder: () =>
    request('/api/dialog/folder', { method: 'POST', body: {} }),
  pickExecutable: () =>
    request('/api/dialog/file', { method: 'POST', body: {} }),
  addCustomTool: (tool) =>
    request('/api/tools/custom', { method: 'POST', body: tool }),
  updateCustomTool: (id, tool) =>
    request(`/api/tools/custom/${encodeURIComponent(id)}`, { method: 'PUT', body: tool }),
  deleteCustomTool: (id) =>
    request(`/api/tools/custom/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setDefaultTool: (toolId) =>
    request('/api/tools/default', { method: 'POST', body: { toolId } }),
}

/**
 * Stream a scan response from the API as NDJSON events.
 *
 * @param {{path: string, recursive: boolean}} payload
 * @param {{signal?: AbortSignal, onEvent?: (event: object) => void}} handlers
 * @returns {Promise<object|null>} scan summary when the server sends one
 */
export async function streamScan(payload, { signal, onEvent } = {}) {
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    let message = `扫描请求失败（HTTP ${response.status}）`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // Keep the generic message.
    }
    throw new Error(message)
  }

  if (!response.body) throw new Error('当前浏览器不支持流式读取扫描结果')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let summary = null

  const handleLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      return
    }

    onEvent?.(event)
    if (event.type === 'done') summary = event.summary
    if (event.type === 'error') {
      const error = new Error(event.message || '扫描失败')
      error.event = event
      throw error
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      handleLine(line)
      newlineIndex = buffer.indexOf('\n')
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) handleLine(buffer)

  return summary
}
