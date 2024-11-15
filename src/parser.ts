/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { Exception } from '@poppinss/exception'
import { parse, StackFrame as ESFrame } from 'error-stack-parser-es'

import debug from './debug.js'
import { SourceFile } from './source_file.js'
import type { Chunk, ParsedError, Parser, SourceLoader, StackFrame, Transformer } from './types.js'

/**
 * ErrorParser exposes the API to parse an thrown value and extract
 * the frames along with their location from it.
 */
export class ErrorParser {
  /**
   * FS source loader reads the file contents from the filesystem
   * for all non-native frames
   */
  static fsSourceLoader: SourceLoader = async (frame) => {
    if (!frame.fileName || frame.fileType !== 'fs' || frame.type === 'native') {
      return undefined
    }

    debug('reading contents for source file %s', frame.fileName!)
    try {
      return {
        contents: await readFile(frame.fileName, 'utf-8'),
      }
    } catch (error) {
      debug(`Unable to read source file %s, error %s`, frame.fileName, error.message)
    }
  }

  /**
   * Native frames filename identifiers for Node.js and
   * Deno
   */
  #nativeFramesIdentifiers = ['node:', 'ext:']

  /**
   * Native frames filename identifier for Bun. In case of
   * bun, the filename exactly matches the keyword "native"
   */
  #bunNativeIdentifier = 'native'

  /**
   * Cache of preloaded source files along with their absolute
   * path
   */
  #sourceFiles: Map<string, SourceFile> = new Map()

  /**
   * The offset can be used to skip initial frames from the
   * error stack
   */
  #offset?: number

  /**
   * Custom source loader to consult for reading the sourcefile
   * contents
   */
  #sourceLoader: SourceLoader = ErrorParser.fsSourceLoader

  /**
   * Parsers are used to prepare the source value for parsing
   */
  #parsers: Parser[] = []

  /**
   * Transformers are used to post process the parsed error and
   * attach additional information to it.
   */
  #transformers: Transformer[] = []

  constructor(options?: { offset?: number; frameSourceBuffer?: number }) {
    options = options ?? {}
    this.#offset = options.offset
  }

  /**
   * Normalizes the unknown error to be an Error
   */
  #normalizeError(source: unknown): Error {
    if (source instanceof Error) {
      return source
    }

    if (typeof source === 'object' && source && 'message' in source && 'stack' in source) {
      return source as Error
    }

    const error = new Exception(JSON.stringify(source))
    error.help =
      'To get as much information as possible from your errors, make sure to throw Error objects. See <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error">https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error</a> for more information.'
    return error
  }

  /**
   * Returns the source chunks for a given file and the
   * line number.
   */
  async #getSource(frame: StackFrame): Promise<Chunk[] | undefined> {
    let sourceFile = this.#sourceFiles.get(frame.fileName!)
    if (sourceFile) {
      debug('reading sourcefile from cache %s', frame.fileName!)
      return sourceFile.slice(frame.lineNumber ?? 1, 11)
    }

    const contents = await this.#sourceLoader(frame)
    if (contents) {
      sourceFile = new SourceFile(contents)
      debug('caching sourcefile instance for %s', frame.fileName!)
      this.#sourceFiles.set(frame.fileName!, sourceFile)
      return sourceFile.slice(frame.lineNumber ?? 1, 11)
    }
  }

  /**
   * Syntax errors in JavaScript does not contain the source file
   * location within the stack trace, since the error has
   * happened in the language parser.
   *
   * However, Node.js includes the absolute path to the file within
   * the stack trace contents as the first line. So we parse
   * that out in this function.
   */
  #parseSyntaxError(error: SyntaxError): ESFrame[] {
    const [sourceIdentifier] = error.stack?.split('\n') || []
    /**
     * We need to assume the last chunk in the array is the line
     * number and rest is part of the filename. For example:
     * In windows, the filepath contains a colon. "D:\youch-core"
     */
    const tokens = sourceIdentifier.split(':')
    const lineNumber = Number(tokens.pop())
    const fileName = tokens.join(':')

    if (fileName && !Number.isNaN(lineNumber)) {
      return [
        {
          fileName: fileName,
          lineNumber: lineNumber,
          source: sourceIdentifier,
        },
      ]
    }

    return []
  }

  /**
   * Applies the offset on the frames to skip certain frames
   * from the start
   */
  #applyOffset(frames: ESFrame[]) {
    if (this.#offset) {
      return frames.slice(this.#offset)
    }
    return frames
  }

  /**
   * Replaces windows slash to unix slash
   */
  #toUnixSlash(fileName: string) {
    const isExtendedLengthPath = fileName.startsWith('\\\\?\\')
    return isExtendedLengthPath ? fileName : fileName.replace(/\\/g, '/')
  }

  /**
   * Normalizes the filename to be a path with unix slash. The
   * URL style paths are also converted to normalized file
   * paths
   */
  #normalizeFileName(fileName: string) {
    if (fileName.startsWith('file:')) {
      return this.#toUnixSlash(fileURLToPath(fileName))
    }
    return this.#toUnixSlash(fileName)
  }

  /**
   * Returns the type of the frame.
   */
  #getFrameType(fileName: string): StackFrame['type'] {
    return this.#nativeFramesIdentifiers.some((identifier) => fileName.includes(identifier)) ||
      fileName === this.#bunNativeIdentifier
      ? 'native'
      : fileName.includes('node_modules/')
        ? 'module'
        : 'app'
  }

  /**
   * Returns the source type of the frame.
   */
  #getFrameSourceType(fileName: string): StackFrame['fileType'] {
    return fileName.startsWith('http://')
      ? 'http'
      : fileName.startsWith('https://')
        ? 'https'
        : 'fs'
  }

  /**
   * Enhances a frame to contain additional information
   */
  async #enhanceFrames(frames: ESFrame[]): Promise<StackFrame[]> {
    let stackFrames: StackFrame[] = []
    for (const { source: raw, ...frame } of frames) {
      const stackFrame: StackFrame = {
        ...frame,
        raw,
      }

      if (!stackFrame.fileName) {
        stackFrames.push(stackFrame)
        continue
      }

      stackFrame.fileName = this.#normalizeFileName(stackFrame.fileName)
      stackFrame.type = this.#getFrameType(stackFrame.fileName)
      stackFrame.fileType = this.#getFrameSourceType(stackFrame.fileName)
      stackFrame.source = await this.#getSource(stackFrame)

      debug('stack frame %O', stackFrame)
      stackFrames.push(stackFrame)
    }

    return stackFrames
  }

  /**
   * Register a parser. Parsers are synchronous functions
   * that can be used to pre-process the source value
   * before it get parsed.
   *
   * @example
   * ```ts
   * sourceFile.useParser((source) => {
   *   if (valueCanBeParsed) {
   *     return newValue
   *   }
   *   return source
   * })
   * ```
   */
  useParser(parser: Parser): this {
    this.#parsers.push(parser)
    return this
  }

  /**
   * Register a transformer. Transformers can be async functions
   * to post-process the parsed error value.
   *
   * @example
   * ```ts
   * sourceFile.useTransformer((error, source) => {
   *   // mutate "error" properties
   * })
   * ```
   */
  useTransformer(transformer: Transformer): this {
    this.#transformers.push(transformer)
    return this
  }

  /**
   * Define a custom source loader to load the contents of the
   * source file within the error stack.
   *
   * For example: You might want to register a custom source loader
   * that makes an fetch call to the server to read the source of
   * the file within the error stack.
   */
  defineSourceLoader(loader: SourceLoader): this {
    this.#sourceLoader = loader
    return this
  }

  /**
   * Parse an unknown value into a parsed error object.
   */
  async parse(source: unknown): Promise<ParsedError> {
    debug('parsing source %O', source)

    /**
     * As the first step, we allow parsers to mutate the error
     * and turn it into an Error object
     */
    source = this.#parsers.reduce((result, parser) => {
      result = parser(result)
      return result
    }, source)

    /**
     * Normalize the error after we are done with the parsers
     */
    let error = this.#normalizeError(source)

    debug('error normalized to %O', error)

    /**
     * Starting with an initial set of frames returned by the
     * "error-stack-parser-es" library. Syntax errors needs a
     * bit of pre-processing. Check the "#parseSyntaxError"
     * method for more info.
     */
    let esFrames: ESFrame[] = error instanceof SyntaxError ? this.#parseSyntaxError(error) : []

    /**
     * Parse rest of the frames
     */
    esFrames = esFrames.concat(parse(error, { allowEmpty: true }))

    /**
     * Apply offset by dropping the unneeded frames
     */
    esFrames = this.#applyOffset(esFrames)

    /**
     * Creating a parsed error object with all the error properties
     * and the stack frames
     */
    const parsedError = {
      message: error.message,
      name: error.name,
      frames: await this.#enhanceFrames(esFrames),
      hint:
        'hint' in error && error.hint
          ? String(error.hint)
          : 'help' in error && error.help
            ? String(error.help)
            : undefined,
      code: 'code' in error ? String(error.code) : undefined,
      cause: error.cause,
      stack: error.stack,
      raw: error,
    } satisfies ParsedError

    for (const transformer of this.#transformers) {
      await transformer(parsedError, error)
    }

    return parsedError
  }
}
