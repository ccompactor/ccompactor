/**
 * Installing the Agent Skill.
 *
 * An agent that does not know ccompactor exists will not use it. The skill is
 * three lines of discovery plus one rule — read the artifact before re-deriving
 * history — installed where each agent already looks.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SkillTarget {
  agent: string
  dir: string
}

export function skillTargets(): SkillTarget[] {
  const home = homedir()
  return [
    { agent: 'claude', dir: join(home, '.claude', 'skills', 'ccompactor') },
    { agent: 'codex', dir: join(home, '.codex', 'skills', 'ccompactor') },
    { agent: 'pi', dir: join(home, '.pi', 'agent', 'skills', 'ccompactor') },
  ]
}

/** The skill payload shipped beside the built CLI. */
export function payloadDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/skill/index.js → ../../skill
  return resolve(here, '..', '..', 'skill')
}

export async function install(): Promise<string[]> {
  const from = payloadDir()
  const info = await stat(from).catch(() => null)
  if (!info?.isDirectory()) {
    throw new Error(`skill payload missing at ${from}; reinstall ccompactor`)
  }
  const written: string[] = []
  for (const target of skillTargets()) {
    await mkdir(dirname(target.dir), { recursive: true })
    await cp(from, target.dir, { recursive: true })
    written.push(target.dir)
  }
  return written
}

export async function uninstall(): Promise<string[]> {
  const removed: string[] = []
  for (const target of skillTargets()) {
    await rm(target.dir, { recursive: true, force: true })
    removed.push(target.dir)
  }
  return removed
}
