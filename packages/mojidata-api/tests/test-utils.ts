import { createNodeApp } from '../node'

type QueryValue = string | number | boolean | null | undefined
type Query =
  | Record<string, QueryValue | QueryValue[]>
  | URLSearchParams
  | undefined

const defaultApiBaseUrl = 'http://localhost:3001'

let appPromise: Promise<ReturnType<typeof createNodeApp>> | undefined

function getLocalApp() {
  appPromise ??= Promise.resolve(createNodeApp())
  return appPromise
}

export function getApiBaseUrl(): string | undefined {
  return process.env.MOJIDATA_API_BASE_URL
}

export function buildUrl(pathname: string, query?: Query): string {
  const baseUrl = getApiBaseUrl() ?? defaultApiBaseUrl
  const url = new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)

  if (!query) return url.toString()

  const params =
    query instanceof URLSearchParams ? query : new URLSearchParams()

  if (!(query instanceof URLSearchParams)) {
    for (const [key, rawValue] of Object.entries(query)) {
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          if (value === undefined || value === null) continue
          params.append(key, String(value))
        }
        continue
      }
      if (rawValue === undefined || rawValue === null) continue
      params.set(key, String(rawValue))
    }
  }

  url.search = params.toString()
  return url.toString()
}

export async function fetchJson(
  pathname: string,
  query?: Query,
  init?: RequestInit,
): Promise<{ response: Response; json: any }> {
  const url = buildUrl(pathname, query)
  const baseUrl = getApiBaseUrl()
  const headers = new Headers(init?.headers)
  const bypass = process.env.X_VERCEL_PROTECTION_BYPASS
  if (bypass && !headers.has('x-vercel-protection-bypass')) {
    headers.set('x-vercel-protection-bypass', bypass)
  }

  if (!baseUrl) {
    const app = await getLocalApp()
    const response = await app.fetch(new Request(url, {
      ...init,
      headers,
    }))
    const text = await response.text()
    let json: any
    try {
      json = text.length ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { response, json }
  }

  const timeoutMs = 10_000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    let json: any
    try {
      json = text.length ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { response, json }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown error: ${String(error)}`
    throw new Error(
      `Failed to fetch ${url} (is the server running?)\n` +
        `Set MOJIDATA_API_BASE_URL to use a running server, or unset it to use the in-process app.\n` +
        `Cause: ${message}`,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
