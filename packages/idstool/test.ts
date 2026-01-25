import test from 'ava'
import { $ } from 'zx'

test('find 灶', async t => {
    $.verbose = false
    const result = await $`node bin/ids-find.js "⿰火土"`
    t.assert(result.stdout.includes('灶'))
})

test('find 焽', async t => {
    $.verbose = false
    const result = await $`node bin/ids-find.js "日" "月" "火"`
    t.assert(result.stdout.includes('焽'))
})

test('ids-find --limit', async t => {
    $.verbose = false
    const resultAll = await $`node bin/ids-find.js "日"`
    const countAll = [...resultAll.stdout.trim()].length
    t.assert(countAll > 10)

    const resultLimited = await $`node bin/ids-find.js --limit=10 "日"`
    const countLimited = [...resultLimited.stdout.trim()].length
    t.assert(countLimited === 10)
})

test('decompose 江', async t => {
    $.verbose = false
    const result = await $`node bin/ids-decompose.js "江"`
    t.assert(result.stdout === '⿰氵⿱⿱一丨一\n')
})
