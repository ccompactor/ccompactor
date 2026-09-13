/**
 * A minimal Ink program, for the pty harness to run on its own.
 *
 * When the real TUI produces no output on a machine, this says whether the
 * problem is Ink in that environment or the TUI in particular. It writes a
 * marker, waits, and exits, so it cannot hang a test run.
 */
import React from 'react'
import { Box, Text, render } from 'ink'

const app = render(
  React.createElement(Box, null, React.createElement(Text, null, 'INK-PROBE-OK')),
)
setTimeout(() => {
  app.unmount()
  process.exit(0)
}, 3000)
