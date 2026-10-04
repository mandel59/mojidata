import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

// Exactly six bounded mojidata requests; no search/graph traversal or retries.
const [base, output] = process.argv.slice(2)
assert.ok(base && output)
const expected = { subject: '充', rel: 'hydzd/variant', object: '𠑽', comment: '[充=⿱亠厶]' }
const cases = [['鐥', ['mji']], ['充', ['kdpv', 'kdpv_comment']], ['𠑽', ['kdpv_comment']], ['A', ['kdpv_comment']], ['鐥', []], ['充', []]]
const checks = []
for (const [char, select] of cases) {
  const url = new URL('/api/v1/mojidata', base)
  url.searchParams.set('char', char)
  for (const field of select) url.searchParams.append('select', field)
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  const result = body.results
  if (char === '鐥') assert.equal(result.mji.find(row => row.MJ文字図形名 === 'MJ068046').mjsm_note, '国字:みずかね')
  else if (char === 'A') assert.deepEqual(result, { kdpv_comment: [] })
  else {
    assert.ok(result.kdpv_comment.some(row => Object.entries(expected).every(([key, value]) => row[key] === value)))
    if (char === '充' && result.kdpv) assert.ok(result.kdpv['hydzd/variant'].includes('𠑽'))
  }
  if (select.length) assert.deepEqual(Object.keys(result).sort(), select.toSorted())
  checks.push({ char, select, url: url.href, status: response.status, results: result })
  console.log(`ok ${char} ${select.join(',') || 'full response'}`)
}
await writeFile(output, JSON.stringify({ observedAt: new Date().toISOString(), base, checks }, null, 2) + '\n')
