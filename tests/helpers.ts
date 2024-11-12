/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getActiveTest } from '@japa/runner'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'

export const httpServer = {
  create(callback: (req: IncomingMessage, res: ServerResponse) => void) {
    return new Promise<void>((resolve) => {
      const server = createServer(callback)
      getActiveTest()?.cleanup(() => {
        return new Promise<void>((r, reject) =>
          server.close((error) => {
            if (error) {
              reject(error)
            } else {
              r()
            }
          })
        )
      })

      server.listen(3000, () => {
        resolve()
      })
    })
  },
}

/**
 * Replaces windows slash to unix slash
 */
export function toUnixSlash(path: string) {
  const isExtendedLengthPath = path.startsWith('\\\\?\\')
  return isExtendedLengthPath ? path : path.replace(/\\/g, '/')
}

/**
 * Normalizes a file URL to a unix path
 */
export function normalizePath(fileURL: string) {
  return toUnixSlash(fileURLToPath(fileURL))
}
