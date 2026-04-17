export function createCachedPromise<T>(factory: () => Promise<T>) {
  let promise: Promise<T> | undefined
  return () => {
    promise ??= factory()
    return promise
  }
}
