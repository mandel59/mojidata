const jsonContentType = 'application/json; charset=utf-8'

const headers = [
  { key: 'Content-Type', value: jsonContentType },
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
]
export function getApiHeaders() {
  return headers
}
