/**
 * The interactive mode.
 *
 * Filled in at Phase 6; the entry point exists from the start so `--tui` is a
 * promise the CLI keeps rather than a flag that silently does nothing.
 */
export async function runTui(): Promise<number> {
  process.stderr.write('the TUI is not built yet; use `ccompactor list` and `extract`\n')
  return 1
}
