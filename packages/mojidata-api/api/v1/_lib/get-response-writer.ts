import { VercelResponse } from "@vercel/node"

export function getResponseWriter(response: VercelResponse) {
  return async (chunk: string) => {
    if (response.write(chunk)) {
      return
    }
    await new Promise((resolve) => response.once('drain', resolve))
  }
}
