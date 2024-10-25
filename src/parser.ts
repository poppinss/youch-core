/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

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
  #sourceLoader?: SourceLoader

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

    return new Error(JSON.stringify(source), { cause: source })
  }

  /**
   * Returns the source chunks for a given file and the
   * line number.
   */
  async #getSource(fileName: string, lineNumber: number): Promise<Chunk[] | undefined> {
    let sourceFile = this.#sourceFiles.get(fileName)
    if (!sourceFile) {
      sourceFile = new SourceFile(
        this.#sourceLoader
          ? await this.#sourceLoader(fileName)
          : {
              filePath: fileName,
            }
      )
      await sourceFile.load()
      debug('caching sourcefile instance for %s', fileName)
      this.#sourceFiles.set(fileName, sourceFile)
    }

    return sourceFile.slice(lineNumber, 11)
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
    const [fileName, lineNumber] = sourceIdentifier.split(':')
    if (fileName && !Number.isNaN(Number(lineNumber))) {
      return [
        {
          fileName: fileName,
          lineNumber: Number(lineNumber),
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
   * Returns the type of the frame.
   */
  #getFrameType(fileName: string): StackFrame['type'] {
    return fileName.includes('node:')
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
    for (let frame of frames) {
      const { source: raw, ...rest } = frame
      if (!frame.fileName) {
        stackFrames.push({
          ...rest,
          raw,
        })
        continue
      }

      const type = this.#getFrameType(frame.fileName)
      const fileType = this.#getFrameSourceType(frame.fileName)
      const source =
        fileType === 'fs' && type !== 'native'
          ? await this.#getSource(frame.fileName, frame.lineNumber ?? 1)
          : undefined

      const stackFrame = {
        ...rest,
        source,
        raw,
        type,
        fileType,
      } satisfies StackFrame

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
     * and the metadata + frames
     */
    const parsedError = {
      message: error.message,
      name: error.name,
      metadata: [],
      frames: await this.#enhanceFrames(esFrames),
      hint: 'hint' in error ? (error.hint as string) : undefined,
      code: 'code' in error ? (error.code as string) : undefined,
      cause: error.cause,
      stack: error.stack,
    } satisfies ParsedError

    for (let transformer of this.#transformers) {
      await transformer(parsedError, error)
    }

    return parsedError
  }
}
