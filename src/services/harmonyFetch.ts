import type { BiuHarmonyBridge } from '@/types/electron'

type NativePayload = {
  status: number
  headers: string
  body: string
}

type Pending = {
  resolve: (response: Response) => void
  reject: (error: Error) => void
}

const pending = new Map<string, Pending>()
let requestSeq = 0
let installed = false

function shouldNativeFetch(url: string): boolean {
  if (/^https:\/\/(api|passport)\.bilibili\.com\//.test(url)) return true
  // Metadata/lyrics providers are also cross-origin; use the same native
  // transport instead of relying on each catalogue's CORS policy.
  return /^https:\/\/(music\.163\.com|c\.y\.qq\.com|songsearch\.kugou\.com|itunes\.apple\.com)\//.test(url)
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function makeResponse(payload: NativePayload): Response {
  if (!payload.status) {
    throw new Error('HarmonyOS native request failed')
  }
  let headers: Record<string, string>
  try {
    headers = JSON.parse(payload.headers || '{}') as Record<string, string>
  } catch {
    headers = {}
  }
  delete headers['content-encoding']
  delete headers['content-length']
  delete headers['transfer-encoding']
  delete headers['connection']
  return new Response(payload.body, {
    status: payload.status,
    headers,
  })
}

export function installHarmonyFetch(): void {
  if (installed || typeof window === 'undefined') return
  const bridge: BiuHarmonyBridge | undefined = window.BiuHarmony
  if (!bridge) return
  installed = true

  window.__biuHarmonyResolve = (requestId: string, payload: NativePayload) => {
    const entry = pending.get(requestId)
    if (!entry) return
    pending.delete(requestId)
    try {
      entry.resolve(makeResponse(payload))
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const originalFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!shouldNativeFetch(url)) {
      return originalFetch(input, init)
    }

    return new Promise<Response>((resolve, reject) => {
      const requestId = String(++requestSeq)
      pending.set(requestId, { resolve, reject })
      try {
        bridge.request(
          requestId,
          url,
          (init?.method ?? 'GET').toUpperCase(),
          JSON.stringify(headersToObject(init?.headers)),
          typeof init?.body === 'string' ? init.body : '',
        )
      } catch (error) {
        pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }) as typeof fetch
}