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

test('decompose 江', async t => {
    $.verbose = false
    const result = await $`node bin/ids-decompose.js "江"`
    t.assert(result.stdout === '⿰氵工\n')
})
