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
