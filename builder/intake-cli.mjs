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
    // Обогащённое предложение (с переводом) → валидная base-запись прямо в lemmas.jsonl
    // (в ветке PR — это предложение к мержу, INV-ADMIN про main соблюдён). Без перевода
    // (оффлайн-слово) → proposed-lemmas.jsonl, который builder не потребляет; админ
    // дозаполняет перевод при ревью (FR-024).
    const lemmasPath = join(ROOT, 'source', 'pl', 'lemmas.jsonl')
    const proposedPath = join(ROOT, 'source', 'pl', 'proposed-lemmas.jsonl')
    let applied = 0
    let proposed = 0
    for (const c of res.report.newEntries) {
      const isCollocation = c.type === 'new_collocation'
      const p = c.payload || {}
      const lemmaText = isCollocation ? p.collocation : p.lemma
      if (!lemmaText) continue
      const translations = p.translation ? [{ text: String(p.translation), source: 'user' }] : []
      const metadata = {}
      if (Array.isArray(p.wordForms) && p.wordForms.length) metadata.wordForms = p.wordForms
      if (typeof p.isPhrase === 'boolean') metadata.isPhrase = p.isPhrase
      if (p.level) metadata.level = p.level
      if (p.category) metadata.category = p.category
      if (typeof p.ruSimilarity === 'number') metadata.ruSimilarity = p.ruSimilarity
      if (typeof p.frequencyRank === 'number') metadata.frequencyRank = p.frequencyRank
      const raw = {
        entryKey: c.entryKey,
        language: p.language || 'pl',
        lemma: lemmaText,
        translations,
        partOfSpeech: p.partOfSpeech,
        synonyms: Array.isArray(p.synonyms) && p.synonyms.length ? p.synonyms : undefined,
        examples: Array.isArray(p.examples) && p.examples.length ? p.examples : undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }
      const entry = normalizeSourceEntry(raw, raw.language, isCollocation ? 'collocation' : 'lemma')
      const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined))
      if (translations.length > 0) {
        appendFileSync(lemmasPath, JSON.stringify(clean) + '\n', 'utf8')
        applied++
      } else {
        clean.needsTranslation = true
        if (p.context) clean.context = p.context
        appendFileSync(proposedPath, JSON.stringify(clean) + '\n', 'utf8')
        proposed++
      }
    }
    console.error(`[apply] lemmas.jsonl: +${applied} (с переводом), proposed-lemmas.jsonl: +${proposed} (нужен перевод)`)
  }
}

run().catch((e) => {
  console.error('[intake] ошибка:', e.message)
  process.exit(1)
})
