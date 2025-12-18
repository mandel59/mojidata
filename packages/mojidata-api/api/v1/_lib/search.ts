import { VercelRequest, VercelResponse } from '@vercel/node'
import { writeObject } from './json-encoder'
import { getResponseWriter } from './get-response-writer'
import { getApiHeaders } from './getApiHeaders'
import { Ref, drop, take } from './iterator-utils'
import { castToStringArray } from './cast'
import { search } from './libsearch'

export default async (request: VercelRequest, response: VercelResponse) => {
  let { p, q, limit, offset, all_results } = request.query
  const ps = castToStringArray(p)
  const qs = castToStringArray(q)
  const headers = getApiHeaders()
  if (ps.length === 0) {
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send(JSON.stringify({ error: { message: 'p is required' } }))
    return
  }
  if (qs.length !== ps.length) {
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send(
      JSON.stringify({
        error: { message: 'q.length must be equal to p.length' },
      }),
    )
    return
  }
  const limitNum = (limit && parseInt(String(limit), 10)) || undefined
  const offsetNum = (offset && parseInt(String(offset), 10)) || undefined
  const usingLimit = Number.isSafeInteger(limitNum) && limitNum! > 0
  const usingOffset = Number.isSafeInteger(offsetNum) && offsetNum! > 0

  const doneRef: Ref<boolean | undefined> = { current: undefined }
  let results = search(ps, qs)

  if (usingOffset) {
    results = drop(offsetNum!, results)
  }

  if (usingLimit) {
    results = take(limitNum!, results, doneRef)
  }

  const r = [...results]
  const write = getResponseWriter(response)
  response.status(200)
  headers.forEach(({ key, value }) => response.setHeader(key, value))
  await writeObject(write, [
    [
      'query',
      {
        p: ps,
        q: qs,
        limit: limitNum,
        offset: offsetNum,
        all_results: all_results ? true : undefined,
      },
    ],
    ['results', r],
    usingLimit && ['done', doneRef.current],
    !usingLimit && !usingOffset && ['total', r.length],
  ])
  response.end()
}
