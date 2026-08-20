import {
  createD1FetchHandler,
  type MojidataApiD1Env,
} from "@mandel59/mojidata-api-d1"

const handleFetch = createD1FetchHandler({
  requireRegisteredQuerySemantics: true,
})

export default {
  fetch(request: Request, env: MojidataApiD1Env): Promise<Response> | Response {
    return handleFetch(request, env)
  },
}
