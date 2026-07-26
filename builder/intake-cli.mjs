// CLI-обёртка intake для GitHub Actions (feature 016, US3).
// Читает батч(и) из contributions/**, текущий словарь из source/pl/lemmas.jsonl,
// печатает review-report (markdown) в stdout и код возврата 0/1.
//   node dictionary/builder/intake-cli.mjs <path-to-batch.json>

import { readFile } from 'node:fs/promises'
import { appendFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { processBatch, renderReport } from './intake.mjs'
import { normalizeSourceEntry } from './lib/normalize.mjs'

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

  if (process.argv.includes('--apply') && res.report.newEntries.length > 0) {
    // Новые леммы приходят БЕЗ перевода, а source-entry.schema требует translations
    // (minItems:1). Поэтому НЕ пишем их в lemmas.jsonl (иначе build упадёт на валидации,
    // INV-ADMIN). Складываем как ПРЕДЛОЖЕНИЯ в proposed-lemmas.jsonl — этот файл builder
    // не потребляет (build.mjs читает только lemmas/examples/collocations/synonyms).
    // Админ при ревью PR добавляет перевод и переносит запись в lemmas.jsonl (FR-024).
    const proposedPath = join(ROOT, 'source', 'pl', 'proposed-lemmas.jsonl')
    let written = 0
    for (const c of res.report.newEntries) {
      const isCollocation = c.type === 'new_collocation'
      const lemmaText = isCollocation ? c.payload?.collocation : c.payload?.lemma
      if (!lemmaText) continue
      const raw = { entryKey: c.entryKey, language: c.payload?.language || 'pl', lemma: lemmaText, translations: [] }
      const entry = normalizeSourceEntry(raw, raw.language, isCollocation ? 'collocation' : 'lemma')
      const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined))
      clean.needsTranslation = true
      if (c.payload?.context) clean.context = c.payload.context
      appendFileSync(proposedPath, JSON.stringify(clean) + '\n', 'utf8')
      written++
    }
    console.error(`[apply] ${written} предложений записано в source/pl/proposed-lemmas.jsonl (нужен перевод от админа; build их НЕ потребляет)`)
  }
}

run().catch((e) => {
  console.error('[intake] ошибка:', e.message)
  process.exit(1)
})
