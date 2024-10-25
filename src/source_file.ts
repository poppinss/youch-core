/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises'

import debug from './debug.js'
import type { Chunk } from './types.js'

/**
 * SourceFile exposes the API to read the contents of a file and
 * slice it into chunks for displaying the source code of a
 * stack frame
 */
export class SourceFile {
  #filePath: string
  #contents?: string
  #loaded: boolean = false

  constructor(options: { filePath: string; contents?: string }) {
    if ('contents' in options) {
      this.#contents = options.contents
    }
    this.#filePath = options.filePath
  }

  /**
   * Loads the file contents and returns it as a string.
   * The file contents are cached after the first call
   * to the "load" method.
   */
  async load() {
    if (this.#contents === undefined) {
      debug('reading contents for source file %s', this.#filePath)
      try {
        this.#contents = await readFile(this.#filePath, 'utf-8')
      } catch (error) {
        debug(`Unable to read source file %s, error %s`, this.#filePath, error.message)
      }
    }

    this.#loaded = true
    return this.#contents
  }

  /**
   * Slice the file contents for the buffer size around a given
   * line number.
   *
   * @example
   * ```ts
   * const chunks = sourceFile.slice(11, 7)
   * // Here chunks will be an array of 7 items from line number
   * // 8 to 14
   * ```
   */
  slice(lineNumber: number, bufferSize: number): undefined | Chunk[] {
    if (!this.#loaded) {
      throw new Error('Cannot slice source file. Make sure to call "load" method first')
    }

    if (!this.#contents) {
      return undefined
    }

    /**
     * Splitting the file contents by new line.
     */
    const lines = this.#contents.split(/\n|\r\n/)

    /**
     * Total number of lines within the file contents
     */
    const contentSize = lines.length

    /**
     * Chunks size refers to number of lines to read before
     * the line and number of lines to read after the
     * main line.
     *
     * For example: If the bufferSize is 7, then the chunkSize
     * will be 3. It means
     * - 3 lines at the top
     * - The highlighted line
     * - 3 lines at the bottom
     */
    const chunkSize = Math.ceil((bufferSize - 1) / 2)

    /**
     * The start index refers to the array index from where we
     * have to start reading the contents. If the number of
     * lines to read exceeds the line number, then we
     * start reading from zero.
     */
    let startIndex = chunkSize >= lineNumber ? 0 : lineNumber - chunkSize - 1

    /**
     * If the remainder at the end of file is smaller than
     * the chunk size, then we read more lines at the
     * start of the file.
     */
    if (contentSize - lineNumber < chunkSize) {
      startIndex = Math.max(startIndex - (chunkSize - (contentSize - lineNumber)), 0)
    }

    /**
     * The source index is the 0 based array index for the provided
     * line number
     */
    const sourceIndex = lineNumber - 1

    /**
     * Using the start remainder to read additional contents at the
     * end of the file when fewer lines are available at the
     * start
     */
    const startRemainder = startIndex - sourceIndex + chunkSize

    /**
     * End index refers to the index until which to read the
     * contents of the file
     */
    const endIndex = startRemainder + chunkSize + lineNumber

    debug('slicing file contents', {
      startIndex,
      endIndex,
      sourceIndex,
      contentSize,
      bufferSize,
      chunkSize,
    })

    return lines.slice(startIndex, endIndex).map((chunk, index) => {
      return {
        chunk,
        lineNumber: startIndex + index + 1,
      }
    })
  }
}
