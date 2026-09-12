#!/usr/bin/env node
/**
 * Vendor the openclaude compaction modules ccompactor depends on.
 *
 * WHY THIS EXISTS, AND WHY IT MUST BE DELETED BEFORE RELEASE
 * ---------------------------------------------------------
 * openclaude is a fork of Anthropic's Claude Code CLI. Its own LICENSE says:
 *
 *   "The original Claude Code source is proprietary software: Copyright (c)
 *    Anthropic PBC. All rights reserved." ... "The underlying derived code
 *    remains subject to Anthropic's copyright. This project does not have
 *    Anthropic's authorization to distribute their proprietary source."
 *
 * So the files this script writes must never reach a registry. That is enforced
 * by packages/ccompactor/scripts/guard-vendor.mjs, which fails `prepublishOnly`
 * while they are present. They exist to reach behavioural parity quickly while
 * the clean-room engine in src/compact/engine.ts is written against the
 * behaviour they implement.
 *
 * Run:  node --experimental-strip-types scripts/extract-openclaude-compact.ts
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const upstream = join(root, 'openclaude', 'src', 'services', 'compact')
const out = join(root, 'packages', 'ccompactor', 'src', 'compact', 'vendor')

/** Modules worth vendoring: pure enough to lift, per docs/SPEC.md §4.1. */
const MODULES = ['prompt.ts', 'grouping.ts']

const HEADER = (file: string) => `/**
 * VENDORED — do not edit, do not publish.
 *
 * Source: openclaude@e2b021d src/services/compact/${file}
 * Upstream is a fork of Anthropic's proprietary Claude Code CLI; see the
 * repository LICENSE, which states it has no authorization to distribute the
 * derived source. This file exists only until src/compact/engine.ts replaces it
 * and is blocked from publication by scripts/guard-vendor.mjs.
 *
 * Modified by ccompactor: imports rewritten to local shims so the module lifts
 * without the rest of the application.
 *
 * @ts-nocheck — this is foreign code that is being kept verbatim on purpose.
 * Editing it to satisfy our tsconfig would make it something other than the
 * thing we are trying to match behaviourally, and it is deleted before release.
 */
`

/** Rewrites that make a module liftable without the surrounding application. */
const REWRITES: Array<[RegExp, string]> = [
  // Bun's compile-time feature flags are dead-code elimination, not runtime
  // behaviour. A local shim reading an env var keeps the branch honest.
  [/import \{ feature \} from 'bun:bundle'\n/g, "import { feature } from '../shims.js'\n"],
  // The proactive module is behind `feature('PROACTIVE')` and is always null in
  // this build; the conditional require is dropped so no REPL code is pulled in.
  [/const proactiveModule =[\s\S]*?: null\n/g, 'const proactiveModule: any = null\n'],
  // Types from the host application, replaced by local structural shims.
  [/from '\.\.\/\.\.\/types\/message\.js'/g, "from '../shims.js'"],
]

async function main(): Promise<void> {
  if (!existsSync(upstream)) {
    console.error(
      `openclaude submodule not found at ${upstream}\nRun: git submodule update --init --recursive`,
    )
    process.exit(1)
  }
  await mkdir(out, { recursive: true })

  const vendored: string[] = []
  for (const file of MODULES) {
    const source = await readFile(join(upstream, file), 'utf8')
    let body = source
    for (const [pattern, replacement] of REWRITES) body = body.replace(pattern, replacement)
    await writeFile(join(out, file), HEADER(file) + body, 'utf8')
    vendored.push(file)
  }

  await writeFile(
    join(out, 'MANIFEST.json'),
    `${JSON.stringify(
      {
        generatedBy: 'scripts/extract-openclaude-compact.ts',
        upstream: 'https://github.com/Gitlawb/openclaude',
        upstreamPath: 'src/services/compact',
        note: 'Derived from Anthropic Claude Code. Must not be published. See NOTICE.',
        modules: vendored,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const present = (await readdir(out)).filter((f) => f.endsWith('.ts'))
  console.log(`vendored ${present.length} module(s) into packages/ccompactor/src/compact/vendor`)
  console.log('REMINDER: this code cannot ship. The publish guard enforces it.')
}

await main()
