// Сидирование source/pl/*.jsonl из существующего словаря платформы (feature 016, US3).
// Читает бандлы vocabularyBank (frontend/public/data/vocabulary или переданный путь)
// и пишет lemmas.jsonl с нормализованным entryKey. Если источник не найден — создаёт
// минимальный seed, чтобы пайплайн/тесты были воспроизводимы.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntryKey, normalizeLemma } from './lib/entryKey.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'source', 'pl')

function toSourceEntry(v) {
  const lemma = v.lemma || v.pl
  return {
    entryKey: buildEntryKey('pl', 'lemma', lemma),
    language: 'pl',
    lemma,
    normalizedLemma: normalizeLemma(lemma),
    translations: v.ru ? [{ text: v.ru }] : [],
    partOfSpeech: v.partOfSpeech,
    frequency: v.frequency,
  }
}

async function loadVocabulary() {
  const candidates = [
    join(ROOT, '..', 'frontend', 'public', 'data', 'vocabulary'),
    join(ROOT, '..', 'frontend', 'dist', 'data', 'vocabulary'),
  ]
  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    const all = []
    for (const f of files) {
      try {
        const arr = JSON.parse(await readFile(join(dir, f), 'utf8'))
        if (Array.isArray(arr)) all.push(...arr)
      } catch {
        /* пропускаем нечитабельный бандл */
      }
    }
    if (all.length) return all
  }
  return null
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true })
  const vocab = await loadVocabulary()
  const entries = vocab
    ? vocab.filter((v) => v.lemma || v.pl).map(toSourceEntry)
    : [
        // Минимальный seed (fallback), если словарь платформы недоступен.
        { entryKey: 'pl:lemma:czytać', language: 'pl', lemma: 'czytać', normalizedLemma: 'czytać', translations: [{ text: 'читать' }] },
      ]
  // Дедуп по entryKey.
  const byKey = new Map()
  for (const e of entries) byKey.set(e.entryKey, e)
  const lines = [...byKey.values()]
    .sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1))
    .map((e) => JSON.stringify(e))
  await writeFile(join(OUT_DIR, 'lemmas.jsonl'), lines.join('\n') + '\n')
  for (const f of ['examples.jsonl', 'collocations.jsonl', 'synonyms.jsonl']) {
    if (!existsSync(join(OUT_DIR, f))) await writeFile(join(OUT_DIR, f), '')
  }
  console.log(`[seed] записано ${byKey.size} лемм в source/pl/lemmas.jsonl (источник: ${vocab ? 'vocabularyBank' : 'fallback'})`)
}

run().catch((e) => {
  console.error('[seed] ошибка:', e.message)
  process.exit(1)
})
