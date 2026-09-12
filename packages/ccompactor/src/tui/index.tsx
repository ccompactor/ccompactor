/**
 * `ccompactor --tui`
 *
 * The interactive mode, which is the whole product for anyone who does not
 * already know the session id they want.
 */
import { render } from 'ink'
import React from 'react'
import { App } from './App.js'

export interface TuiOptions {
  outDir?: string
  anyProject?: boolean
}

export async function runTui(options: TuiOptions = {}): Promise<number> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      'the TUI needs a terminal: stdin is not a tty. Use `ccompactor list` and `ccompactor extract` instead.\n',
    )
    return 1
  }
  let code = 0
  const app = render(
    <App
      outDir={options.outDir ?? '.ccompactor'}
      anyProject={options.anyProject ?? true}
      onDone={(value: number) => {
        code = value
      }}
    />,
    { exitOnCtrlC: false },
  )
  await app.waitUntilExit()
  return code
}
