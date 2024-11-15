/*
 * youch-core
 *
 * (c) Poppinss
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Representation of a source file chunk
 */
export type Chunk = {
  chunk: string
  lineNumber: number
}

/**
 * Representation of a parsed error message
 */
export interface ParsedError {
  message: string
  name: string
  frames: StackFrame[]
  /**
   * Referenced to the raw error property. The value will always
   * be an Error object even if the thrown value was not an
   * error
   */
  raw: Error
  cause?: unknown
  hint?: string
  code?: string
  stack?: string
}

/**
 * Representation of a stack frame
 */
export interface StackFrame {
  args?: any[]

  /**
   * The column number at which the error occurred.
   */
  columnNumber?: number

  /**
   * The line number at which the error occurred.
   */
  lineNumber?: number

  /**
   * The source file in which the error occurred.
   */
  fileName?: string

  /**
   * The function name
   */
  functionName?: string

  /**
   * Stack trace raw source
   */
  raw?: string

  /**
   * The source property refers to the file content
   * chunks for a given frame.
   *
   * The source is only available for frame type "app"
   * and "module"
   */
  source?: Chunk[]

  /**
   * The frame type refers to the location from where the
   * frame has originated.
   *
   * - native belongs to Node.js or v8 internals
   * - module belongs to files inside `node_modules`
   * - app belongs to application source code
   */
  type?: 'native' | 'module' | 'app'

  /**
   * The file type refers to the type of the file path.
   * It will either point to a file on the system or
   * points to an HTTP URL in case of errors within
   * the browser.
   */
  fileType?: 'fs' | 'http' | 'https'
}

/**
 * Source loaders are used to read the contents of the source
 * file.
 */
export type SourceLoader = (frame: StackFrame) =>
  | Promise<
      | undefined
      | {
          contents: string
        }
    >
  | undefined
  | {
      contents: string
    }

/**
 * Parsers are synchronous functions that can be used to pre-process
 * the source value before it get parsed.
 */
export type Parser = (source: unknown) => any

/**
 * Transformers can be async functions to post-process the parsed
 * error value.
 */
export type Transformer = (error: ParsedError, source: unknown) => void | Promise<void>
