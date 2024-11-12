/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import got from 'got'
import axios from 'axios'
import unidici from 'undici'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { ErrorParser } from '../src/parser.js'
import { httpServer, normalizePath, toUnixSlash } from './helpers.js'

test.group('Error parser', () => {
  test('should parse error', async ({ assert }) => {
    const error = new Error('Something went wrong')
    const { frames, raw } = await new ErrorParser().parse(error)

    assert.strictEqual(raw, error)
    assert.equal(frames[0].fileName, normalizePath(import.meta.url))
    assert.equal(frames[0].lineNumber, 22)
    assert.equal(frames[0].type, 'app')
    assert.equal(frames[0].fileType, 'fs')
    assert.equal(
      frames[0].source!.find(({ lineNumber }) => lineNumber === 22)?.chunk,
      `    const error = new Error('Something went wrong')`
    )
  })

  test('should parse error stack pointing to invalid file path', async ({ assert }) => {
    const error = new Error('Something went wrong')
    error.stack = error.stack!.replace(fileURLToPath(import.meta.url), 'invalid-path')

    const { frames } = await new ErrorParser().parse(error)

    assert.equal(frames[0].fileName, 'invalid-path')
    assert.equal(frames[0].lineNumber, 37)
    assert.equal(frames[0].type, 'app')
    assert.equal(frames[0].fileType, 'fs')
    assert.isUndefined(frames[0].source)
  })

  test('should parse error stack pointing webpack file path', async ({ assert }) => {
    const error = new Error('Something went wrong')
    error.stack = error.stack!.replace(
      fileURLToPath(import.meta.url),
      join(fileURLToPath(import.meta.url), 'dist', 'webpack:')
    )

    const { frames } = await new ErrorParser().parse(error)
    assert.equal(
      frames[0].fileName,
      toUnixSlash(join(fileURLToPath(import.meta.url), 'dist', 'webpack:'))
    )
    assert.equal(frames[0].lineNumber, 50)
    assert.equal(frames[0].type, 'app')
    assert.equal(frames[0].fileType, 'fs')
    assert.isUndefined(frames[0].source)
  })

  test('should parse error stack from browser', async ({ assert }) => {
    const error = {
      message: 'hello is not defined',
      stack: `ReferenceError: hello is not defined
    at Home (http://localhost:3333/inertia/pages/home.tsx?t=1729422957400:25:5)
    at renderWithHooks (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:11548:26)
    at mountIndeterminateComponent (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:14926:21)
    at beginWork (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:15914:22)
    at beginWork$1 (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:19753:22)
    at performUnitOfWork (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:19198:20)
    at workLoopSync (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:19137:13)
    at renderRootSync (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:19116:15)
    at recoverFromConcurrentError (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:18736:28)
    at performConcurrentWorkOnRoot (http://localhost:3333/node_modules/.vite/deps/react-dom_client.js?v=251581c7:18684:30)`,
    }

    const { frames } = await new ErrorParser().parse(error)
    assert.equal(frames[0].fileName, 'http://localhost:3333/inertia/pages/home.tsx?t=1729422957400')
    assert.equal(frames[0].lineNumber, 25)
    assert.equal(frames[0].type, 'app')
    assert.equal(frames[0].fileType, 'http')
    assert.isUndefined(frames[0].source)
  })

  test('should parse error from file with sourcemaps', async ({ assert }) => {
    assert.plan(5)

    try {
      // @ts-expect-error
      const { default: mkay } = await import('./fixtures/stacktracey/mkay.uglified.cjs')
      mkay()
    } catch (error) {
      const { frames } = await new ErrorParser().parse(error)
      assert.equal(
        frames[0].fileName,
        normalizePath(new URL('./fixtures/stacktracey/mkay.cjs', import.meta.url))
      )
      assert.equal(frames[0].lineNumber, 4)
      assert.equal(frames[0].type, 'app')
      assert.equal(frames[0].fileType, 'fs')
      assert.equal(
        frames[0].source!.find(({ lineNumber }) => lineNumber === 4)?.chunk,
        `  throw new Error ('mkay') }`
      )
    }
  })

  test('should parse syntax errors', async ({ assert }) => {
    assert.plan(6)

    try {
      // @ts-expect-error
      await import('./fixtures/stacktracey/syntax_error.cjs')
    } catch (error) {
      const { frames } = await new ErrorParser().parse(error)
      assert.equal(
        frames[0].fileName,
        normalizePath(new URL('./fixtures/stacktracey/syntax_error.cjs', import.meta.url))
      )
      assert.equal(frames[0].lineNumber, 2)
      assert.equal(frames[0].type, 'app')
      assert.equal(frames[0].fileType, 'fs')
      assert.equal(
        frames[0].source!.find(({ lineNumber }) => lineNumber === 2)?.chunk,
        `foo->bar ()`
      )

      /**
       * All other frames will be from the native code
       */
      assert.equal(frames[1].type, 'native')
    }
  })

  test('should parse "got" network timeout error', async () => {
    /**
     * Got stack frames do not point back to client.
     * https://github.com/sindresorhus/got/issues/2293
     *
     * Custom solution needed
     * https://github.com/sindresorhus/got/issues/1077
     * https://github.com/sindresorhus/got/blob/main/documentation/async-stack-frames.md#conclusion
     */
    try {
      await got('http://locahost:8100', { timeout: { connect: 100 }, retry: { limit: 0 } })
    } catch (error) {
      await new ErrorParser().parse(error)
    }
  }).timeout(4000)

  test('should parse "undici" network timeout error', async ({ assert }) => {
    assert.plan(6)

    try {
      await unidici.fetch('http://locahost:8100')
    } catch (error) {
      const { frames } = await new ErrorParser().parse(error)
      assert.equal(frames[2].fileName, normalizePath(import.meta.url))
      assert.equal(frames[2].lineNumber, 161)
      assert.equal(frames[2].type, 'app')
      assert.equal(frames[2].fileType, 'fs')
      assert.equal(
        frames[2].source!.find(({ lineNumber }) => lineNumber === 161)?.chunk,
        `      await unidici.fetch('http://locahost:8100')`
      )

      assert.equal(frames[0].type, 'module')
    }
  }).timeout(4000)

  test('should allow offsetting frames', async ({ assert }) => {
    assert.plan(6)

    try {
      await unidici.fetch('http://locahost:8100')
    } catch (error) {
      const { frames } = await new ErrorParser({ offset: 2 }).parse(error)
      assert.equal(frames[0].fileName, normalizePath(import.meta.url))
      assert.equal(frames[0].lineNumber, 181)
      assert.equal(frames[0].type, 'app')
      assert.equal(frames[0].fileType, 'fs')
      assert.equal(frames[1].type, 'module')
      assert.equal(
        frames[0].source!.find(({ lineNumber }) => lineNumber === 181)?.chunk,
        `      await unidici.fetch('http://locahost:8100')`
      )
    }
  }).timeout(4000)

  test('should parse "axios" non-200 exceptions', async ({ assert }) => {
    assert.plan(6)

    httpServer.create((_, res) => {
      res.writeHead(400)
      res.write('Access denied')
      res.end()
    })

    try {
      await axios('http://localhost:3000')
    } catch (error) {
      const { frames } = await new ErrorParser().parse(error)
      assert.equal(frames[7].fileName, normalizePath(import.meta.url))
      assert.equal(frames[7].lineNumber, 206)
      assert.equal(frames[7].type, 'app')
      assert.equal(frames[7].fileType, 'fs')
      assert.equal(
        frames[7].source!.find(({ lineNumber }) => lineNumber === 206)?.chunk,
        `      await axios('http://localhost:3000')`
      )

      assert.equal(frames[0].type, 'module')
    }
  }).timeout(4000)

  test('normalize boolean thrown as an error', async ({ assert }) => {
    const error = await new ErrorParser().parse(true)
    assert.equal(error.message, 'true')
    assert.equal(
      error.hint,
      'To get as much information as possible from your errors, make sure to throw Error objects. See <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error">https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error</a> for more information.'
    )
  })

  test('normalize promise thrown as an error', async ({ assert }) => {
    const p = new Promise(() => {})
    const error = await new ErrorParser().parse(p)
    assert.equal(error.message, '{}')
    assert.equal(
      error.hint,
      'To get as much information as possible from your errors, make sure to throw Error objects. See <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error">https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error</a> for more information.'
    )
  })

  test('define custom parser', async ({ assert }) => {
    const p = new Promise(() => {})
    const parser = new ErrorParser()
    parser.useParser((value) => {
      return value instanceof Promise ? new Error('Promise cannot be thrown') : value
    })

    const error = await parser.parse(p)
    assert.equal(error.message, 'Promise cannot be thrown')
    assert.equal(error.frames[0].fileName, normalizePath(import.meta.url))
    assert.equal(error.frames[0].lineNumber, 245)
    assert.equal(error.frames[0].type, 'app')
    assert.equal(error.frames[0].fileType, 'fs')
    assert.equal(
      error.frames[0].source!.find(({ lineNumber }) => lineNumber === 245)?.chunk,
      `      return value instanceof Promise ? new Error('Promise cannot be thrown') : value`
    )
  })

  test('define custom source loader', async ({ assert }) => {
    const error = new Error('Something went wrong')
    const parser = new ErrorParser()

    parser.defineSourceLoader(async (filePath) => {
      return {
        filePath,
        contents: await readFile(import.meta.filename, 'utf-8'),
      }
    })

    const parsedError = await parser.parse(error)
    assert.equal(error.message, 'Something went wrong')
    assert.equal(parsedError.frames[0].fileName, normalizePath(import.meta.url))
    assert.equal(parsedError.frames[0].lineNumber, 261)
    assert.equal(parsedError.frames[0].type, 'app')
    assert.equal(parsedError.frames[0].fileType, 'fs')
    assert.equal(
      parsedError.frames[0].source!.find(({ lineNumber }) => lineNumber === 261)?.chunk,
      `    const error = new Error('Something went wrong')`
    )
  })
})
