export type Ref<T> = { current: T }

export function* drop<T>(n: number, gen: Generator<T>): Generator<T> {
  for (let i = 0; i < n; i++) {
    const { done } = gen.next()
    if (done) {
      return
    }
  }
  yield* gen
}

export function* take<T>(
  n: number,
  gen: Generator<T>,
  doneRef?: Ref<boolean | undefined>,
): Generator<T> {
  let next = gen.next()
  for (let i = 0; i < n; i++) {
    if (next.done) {
      if (doneRef) doneRef.current = true
      return
    }
    yield next.value
    next = gen.next()
  }
  if (doneRef) doneRef.current = next.done ?? false
}

export function* filter<T>(
  fn: (x: T) => boolean,
  gen: Generator<T>,
): Generator<T> {
  for (const x of gen) {
    if (fn(x)) {
      yield x
    }
  }
}
