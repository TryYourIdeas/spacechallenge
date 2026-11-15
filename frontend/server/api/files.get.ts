import { config } from '../utils/config'
import { listCsvFiles } from '../utils/files'
import { fail } from '../utils/http'
import { log } from '../utils/log'

// CSV files the user may import: the server's data directory, nothing else.
export default defineEventHandler(async () => {
  try {
    return { files: await listCsvFiles(config().sourceDir) }
  } catch (e) {
    log('error', 'cannot list data directory', { err: (e as Error).message })
    throw fail(503, 'The data directory is not available.')
  }
})
