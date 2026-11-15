import { createError, getRouterParam, type H3Event } from 'h3'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Throws an h3 error whose `message` is shown to the client. */
export const fail = (statusCode: number, message: string) => createError({ statusCode, message })

export function idParam(event: H3Event): string {
  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID.test(id)) throw fail(400, 'Invalid id.')
  return id
}
