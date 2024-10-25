import ansis from 'ansis'
import { readFile } from 'node:fs/promises'
import { highlight } from 'tinyhighlight/picocolors'
import { ErrorParser } from '../src/parser.js'
import { ParsedError } from '../src/types.js'
import stripAnsi from 'strip-ansi'

function print(error: ParsedError) {
  console.log('')
  console.log(ansis.red(error.message))
  if (error.hint) {
    console.log(`${ansis.blue('●')} ${error.hint}`)
  }

  console.log('')
  let frameSourcePrinted = false

  error.frames.forEach((frame) => {
    if (frame.type === 'app' && !frameSourcePrinted && frame.source) {
      console.log(ansis.yellow(`‐ ${frame.raw!.trim()}`))
      // console.log('')
      frameSourcePrinted = true
      const chunks = highlight(frame.source.map((c) => c.chunk).join('\n')).split('\n')

      frame.source.map(({ lineNumber }, index) => {
        const chunk = chunks[index]
        if (lineNumber === frame.lineNumber) {
          console.log(
            ansis.bgRed(
              `${ansis.visible('❯')} ${ansis.visible(`${lineNumber}`)} ${ansis.visible('┃')}  ${ansis.visible(stripAnsi(chunk))}`
            )
          )
        } else {
          console.log(`  ${ansis.dim(`${lineNumber}`)} ${ansis.dim('┃')}  ${chunk}`)
        }
      })
      // console.log('')
    } else {
      console.log(ansis.dim(`‐ ${frame.raw!.trim()}`))
    }
  })
}

async function run(): Promise<void> {
  try {
    await readFile('./foo.txt')
  } catch (error) {
    const parsed = await new ErrorParser().parse(error)
    print(parsed)
  }
}

await run()
