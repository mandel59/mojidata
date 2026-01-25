export type IterableOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>
export type MaybePromise<T> = T | Promise<T>
export type Falsy = false | 0 | '' | null | undefined

export type Writer = (chunk: string) => MaybePromise<void>

export type Serializable =
  | string
  | number
  | boolean
  | null
  | object
  | undefined
  | (() => MaybePromise<boolean>)

export async function writeJson(write: Writer, json: string) {
  await write(json)
  return true
}

export async function writeValue(write: Writer, value: Serializable) {
  if (value === undefined) {
    return false
  }
  if (typeof value === 'function') {
    return await (value as () => MaybePromise<boolean>)()
  } else {
    await write(JSON.stringify(value))
    return true
  }
}

export async function writeArray<T extends Serializable>(
  write: Writer,
  values: IterableOrAsyncIterable<T>,
) {
  await write('[')
  let previous = false
  for await (const value of values) {
    if (previous) {
      await write(',')
    }
    previous = (await writeValue(write, value)) || false
  }
  await write(']')
  return true
}

export async function writeObject(
  write: Writer,
  entries: IterableOrAsyncIterable<[key: string, value: Serializable] | Falsy>,
) {
  await write('{')
  let previous = false
  for await (const entry of entries) {
    if (!entry) {
      continue
    }
    const [key, value] = entry
    if (previous) {
      await write(',')
    }
    await write(JSON.stringify(key))
    await write(':')
    previous = true
    const filled = await writeValue(write, value)
    if (!filled) {
      // fallback to null
      write('null')
    }
  }
  await write('}')
  return true
}
