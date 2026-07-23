// CLI-обёртка intake для GitHub Actions (feature 016, US3).
// Читает батч(и) из contributions/**, текущий словарь из source/pl/lemmas.jsonl,
// печатает review-report (markdown) в stdout и код возврата 0/1.
//   node dictionary/builder/intake-cli.mjs <path-to-batch.json>

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { processBatch, renderReport } from './intake.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function loadSourceIndex() {
  const path = join(ROOT, 'source', 'pl', 'lemmas.jsonl')
  const map = new Map()
  if (!existsSync(path)) return map
  const text = await readFile(path, 'utf8')
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    try {
      const e = JSON.parse(line)
      if (e.entryKey) map.set(e.entryKey, e)
    } catch {
      /* пропускаем битую строку */
    }
  }
  return map
}

async function run() {
  const batchPath = process.argv[2]
  if (!batchPath) {
    console.error('usage: intake-cli.mjs <batch.json>')
    process.exit(2)
  }
  const batch = JSON.parse(await readFile(batchPath, 'utf8'))
  const source = await loadSourceIndex()
  const res = processBatch(batch, source)
  if (!res.ok) {
    console.error('Валидация батча провалена:', JSON.stringify(res.errors, null, 2))
    process.exit(1)
  }
  console.log(renderReport(res.report))
}

run().catch((e) => {
  console.error('[intake] ошибка:', e.message)
  process.exit(1)
})
