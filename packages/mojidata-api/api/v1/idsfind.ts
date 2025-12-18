import type { VercelRequest, VercelResponse } from '@vercel/node'

import { IDSFinder } from '@mandel59/idstool/lib/ids-finder'
import { writeObject } from './_lib/json-encoder'
import { Ref, drop, filter, take } from './_lib/iterator-utils'
import { filterChars } from './_lib/libsearch'
import search from './_lib/search'
import { getApiHeaders } from './_lib/getApiHeaders'
import { castToStringArray } from './_lib/cast'

export default async (request: VercelRequest, response: VercelResponse) => {
  const headers = getApiHeaders()
  let { p, q, ids, whole, limit, offset, all_results } = request.query
  const ps = castToStringArray(p)
  const qs = castToStringArray(q)
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
  ids = castToStringArray(ids)
  whole = castToStringArray(whole)
  const limitNum = (limit && parseInt(String(limit), 10)) || undefined
  const offsetNum = (offset && parseInt(String(offset), 10)) || undefined
  const doneRef: Ref<boolean | undefined> = { current: undefined }
  const allResults = Boolean(all_results)

  if (ids.length === 0 && whole.length === 0) {
    if (ps.length > 0) {
      return await search(request, response)
    }
    response.status(400)
    headers.forEach(({ key, value }) => response.setHeader(key, value))
    response.send({
      message: 'No parameters',
      error: { message: 'No parameters' },
    })
    return
  }

  const idsFinder = new IDSFinder({
    dbOptions: {
      readonly: true,
    },
  })

  let results: Generator<string> | string[] = idsFinder.find(
    ...ids,
    ...whole.map((x) => `§${x}§`),
  )

  const usingLimit = Number.isSafeInteger(limitNum) && limitNum! > 0
  const usingOffset = Number.isSafeInteger(offsetNum) && offsetNum! > 0

  if (!allResults) {
    results = filter((x) => x[0] !== '&', results)
  }

  if (ps.length > 0) {
    results = filterChars([...results], ps, qs)
  }

  if (usingOffset) {
    results = drop(offsetNum!, results)
  }

  if (usingLimit) {
    results = take(limitNum!, results, doneRef)
  }

  const resultValues = [...results]

  const write = async (chunk: string) => {
    if (response.write(chunk)) {
      return
    }
    await new Promise((resolve) => response.once('drain', resolve))
  }
  response.status(200)
  headers.forEach(({ key, value }) => response.setHeader(key, value))
  await writeObject(write, [
    [
      'query',
      {
        ids,
        whole,
        p: ps.length > 0 ? ps : undefined,
        q: qs.length > 0 ? qs : undefined,
        limit: limitNum,
        offset: offsetNum,
        all_results: all_results ? true : undefined,
      },
    ],
    ['results', resultValues],
    usingLimit && ['done', doneRef.current],
    !usingLimit && !usingOffset && ['total', resultValues.length],
  ])
  response.end()
}
