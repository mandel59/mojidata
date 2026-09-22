import assert from 'node:assert/strict'

const base = process.argv[2]
async function get(path, params) {
  const url = new URL(path, base)
  for (const [key, values] of Object.entries(params)) {
    for (const value of [values].flat()) url.searchParams.append(key, value)
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  return body.results
}

const details = await get('/api/v1/mojidata', {
  char: '弁', select: ['unihan_variant', 'unihan_variant_inverse'],
})
assert.deepEqual(details.unihan_variant.filter(x => x[0] === 'kJapaneseOldVariant').map(x => x[2]).sort(), ['瓣', '辨', '辯'])
assert.deepEqual(details.unihan_variant_inverse.filter(x => x[0] === 'kJapaneseNewVariant').map(x => x[2]).sort(), ['瓣', '辨', '辯'])
console.log('ok Japanese forward/reverse detail fields')

const edges = await get('/api/v1/mojidata-variants', { char: '弁' })
for (const old of ['瓣', '辨', '辯']) {
  assert.ok(edges.some(x => x.c1 === '弁' && x.c2 === old && x.r === 'kJapaneseOldVariant' && x.f === 1))
  assert.ok(edges.some(x => x.c1 === old && x.c2 === '弁' && x.r === 'kJapaneseNewVariant' && x.f === 1))
}
console.log('ok Japanese variant graph labels and multiple old forms')

for (const [property, value, expected] of [
  ['kJapaneseNewVariant', 'U+5F01', ['瓣', '辨', '辯']],
  ['kJapaneseOldVariant', '瓣', ['弁']],
  ['kJapaneseOldVariant.glob', '瓣', ['弁']],
]) {
  const rows = await get('/api/v1/idsfind', { p: `unihan.${property}`, q: value })
  assert.deepEqual(rows.sort(), expected)
  console.log(`ok search ${property}`)
}
for (const [property, count] of [['kJapaneseNewVariant', 364], ['kJapaneseOldVariant', 362]]) {
  const rows = await get('/api/v1/idsfind', { p: `unihan.${property}.has`, q: '' })
  assert.equal(rows.length, count)
  console.log(`ok search ${property}.has: ${count}`)
}
