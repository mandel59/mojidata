import test from 'ava'
import { $ } from 'zx'

test('ivs-list 一', async t => {
    $.verbose = false
    const result = await $`node bin/ivs-list.js "一"`
    t.assert(result.stdout === '{"IVS":"一󠄀","unicode":"4E00 E0100","collection":"Adobe-Japan1","code":"CID+1200"}\n')
})
