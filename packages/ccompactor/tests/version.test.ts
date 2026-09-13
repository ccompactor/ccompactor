import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { VERSION } from '../src/version.js'

/**
 * `--version` reported a stale constant through four releases because nothing
 * connected it to package.json. `build` regenerates src/version.ts, so this
 * fails only for someone running `tsc` by hand — which is exactly the mistake
 * worth catching before it ships.
 */
test('the compiled-in version matches package.json', () => {
  // `npm test` runs the compiled tests from dist-test/tests, so the package
  // root is two levels up.
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
  assert.equal(VERSION, pkg.version, 'run `npm run build` to regenerate src/version.ts')
})
