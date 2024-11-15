/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { SourceFile } from '../src/source_file.js'

test.group('Source file', () => {
  test('should return undefined from slice when content is undefined', async ({ assert, fs }) => {
    const sf = new SourceFile({
      contents: undefined,
    })
    assert.isUndefined(sf.slice(1, 10))
  })

  test('get file contents around a given line number', async ({ assert, fs }) => {
    const sf = new SourceFile({
      contents: await fs.contents('source_files/foo.cjs'),
    })

    assert.deepEqual(sf.slice(12, 7), [
      { chunk: '  console.log(`Primary ${process.pid} is running`);', lineNumber: 9 },
      { chunk: '', lineNumber: 10 },
      { chunk: '  // Fork workers.', lineNumber: 11 },
      { chunk: `  for (let i = 0; i < numCPUs; i++) {`, lineNumber: 12 },
      { chunk: '    cluster.fork();', lineNumber: 13 },
      { chunk: '  }', lineNumber: 14 },
      { chunk: '', lineNumber: 15 },
    ])

    assert.deepEqual(sf.slice(1, 7), [
      { chunk: `import http from 'node:http';`, lineNumber: 1 },
      { chunk: `import cluster from 'node:cluster';`, lineNumber: 2 },
      { chunk: `import process from 'node:process';`, lineNumber: 3 },
      { chunk: `import { availableParallelism } from 'node:os';`, lineNumber: 4 },
      { chunk: '', lineNumber: 5 },
      { chunk: 'const numCPUs = availableParallelism();', lineNumber: 6 },
      { chunk: '', lineNumber: 7 },
    ])

    assert.deepEqual(sf.slice(2, 7), [
      { chunk: `import http from 'node:http';`, lineNumber: 1 },
      { chunk: `import cluster from 'node:cluster';`, lineNumber: 2 },
      { chunk: `import process from 'node:process';`, lineNumber: 3 },
      { chunk: `import { availableParallelism } from 'node:os';`, lineNumber: 4 },
      { chunk: '', lineNumber: 5 },
      { chunk: 'const numCPUs = availableParallelism();', lineNumber: 6 },
      { chunk: '', lineNumber: 7 },
    ])

    assert.deepEqual(sf.slice(3, 7), [
      { chunk: `import http from 'node:http';`, lineNumber: 1 },
      { chunk: `import cluster from 'node:cluster';`, lineNumber: 2 },
      { chunk: `import process from 'node:process';`, lineNumber: 3 },
      { chunk: `import { availableParallelism } from 'node:os';`, lineNumber: 4 },
      { chunk: '', lineNumber: 5 },
      { chunk: 'const numCPUs = availableParallelism();', lineNumber: 6 },
      { chunk: '', lineNumber: 7 },
    ])

    assert.deepEqual(sf.slice(4, 7), [
      { chunk: `import http from 'node:http';`, lineNumber: 1 },
      { chunk: `import cluster from 'node:cluster';`, lineNumber: 2 },
      { chunk: `import process from 'node:process';`, lineNumber: 3 },
      { chunk: `import { availableParallelism } from 'node:os';`, lineNumber: 4 },
      { chunk: '', lineNumber: 5 },
      { chunk: 'const numCPUs = availableParallelism();', lineNumber: 6 },
      { chunk: '', lineNumber: 7 },
    ])

    assert.deepEqual(sf.slice(28, 7), [
      { chunk: '  http.createServer((req, res) => {', lineNumber: 22 },
      { chunk: '    res.writeHead(200);', lineNumber: 23 },
      { chunk: `    res.end('hello world\\n');`, lineNumber: 24 },
      { chunk: '  }).listen(8000);', lineNumber: 25 },
      { chunk: '', lineNumber: 26 },
      { chunk: '  console.log(`Worker ${process.pid} started`);', lineNumber: 27 },
      { chunk: '}', lineNumber: 28 },
    ])

    assert.deepEqual(sf.slice(27, 7), [
      { chunk: '  http.createServer((req, res) => {', lineNumber: 22 },
      { chunk: '    res.writeHead(200);', lineNumber: 23 },
      { chunk: `    res.end('hello world\\n');`, lineNumber: 24 },
      { chunk: '  }).listen(8000);', lineNumber: 25 },
      { chunk: '', lineNumber: 26 },
      { chunk: '  console.log(`Worker ${process.pid} started`);', lineNumber: 27 },
      { chunk: '}', lineNumber: 28 },
    ])

    assert.deepEqual(sf.slice(26, 7), [
      { chunk: '  http.createServer((req, res) => {', lineNumber: 22 },
      { chunk: '    res.writeHead(200);', lineNumber: 23 },
      { chunk: `    res.end('hello world\\n');`, lineNumber: 24 },
      { chunk: '  }).listen(8000);', lineNumber: 25 },
      { chunk: '', lineNumber: 26 },
      { chunk: '  console.log(`Worker ${process.pid} started`);', lineNumber: 27 },
      { chunk: '}', lineNumber: 28 },
    ])
  })
})
