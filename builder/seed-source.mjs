// Сидирование source/pl/*.jsonl из существующего base-словаря платформы (feature 016, US3).
// Base = 8k+ VocabularyEntry (frontend/public/data/vocabulary). Маппинг в DictionaryEntry
// по data-model §2: ru → translations[0].text; frequencyRank/level/category/nuances/register/
// funFact/meanings/confusablePair/… → metadata; partOfSpeech/frequency/examples/synonyms —
// как есть. dictionaryId В SOURCE НЕ пишем (его присваивает builder, contract §1/§3).
//
// Источник ищется по (в порядке приоритета): аргумент CLI, env VOCAB_DIR, затем известные
// каталоги. Если base не найден — падаем с ошибкой (НЕ пишем заглушку молча). Заглушка
// только по явному флагу --allow-stub (для воспроизводимости тестов пайплайна).

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntryKey, normalizeLemma } from './lib/entryKey.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'source', 'pl')

// Поля VocabularyEntry, уходящие в metadata DictionaryEntry (data-model §2).
const META_FIELDS = [
  'frequencyRank', 'level', 'category', 'nuances', 'register',
  'funFact', 'meanings', 'confusablePair', 'ruSimilarity', 'isPhrase', 'wordForms',
]

function toSourceEntry(v) {
  const lemma = String(v.lemma || v.pl || '').trim()
  if (!lemma) return null
  // Схема source-entry требует translations с minItems:1 — без перевода запись невалидна.
  const translations = v.ru ? [{ text: String(v.ru).trim(), source: 'base' }] : []
  if (translations.length === 0) return null

  const metadata = {}
  for (const k of META_FIELDS) {
    const val = v[k]
    if (val === undefined || val === null) continue
    if (typeof val === 'string' && val.trim() === '') continue
    if (Array.isArray(val) && val.length === 0) continue
    metadata[k] = val
  }

  const entry = {
    entryKey: buildEntryKey('pl', 'lemma', lemma),
    language: 'pl',
    lemma,
    normalizedLemma: normalizeLemma(lemma),
    translations,
  }
  if (v.partOfSpeech) entry.partOfSpeech = v.partOfSpeech
  if (typeof v.frequency === 'number') entry.frequency = v.frequency
  if (Array.isArray(v.examples) && v.examples.length) entry.examples = v.examples
  if (Array.isArray(v.synonyms) && v.synonyms.length) entry.synonyms = v.synonyms
  if (Object.keys(metadata).length) entry.metadata = metadata
  return entry
}

async function loadVocabulary(explicitDir) {
  const candidates = [
    explicitDir,
    process.env.VOCAB_DIR,
    join(ROOT, '..', 'zazozu-frontend', 'public', 'data', 'vocabulary'),
    join(ROOT, '..', 'zazozu-frontend', 'dist', 'data', 'vocabulary'),
    join(ROOT, '..', 'frontend', 'public', 'data', 'vocabulary'),
    join(ROOT, '..', 'frontend', 'dist', 'data', 'vocabulary'),
  ].filter(Boolean)

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
    if (all.length) return { entries: all, dir }
  }
  return null
}

async function run() {
  const args = process.argv.slice(2)
  const allowStub = args.includes('--allow-stub')
  const explicitDir = args.find((a) => !a.startsWith('--'))

  await mkdir(OUT_DIR, { recursive: true })
  const vocab = await loadVocabulary(explicitDir)

  if (!vocab && !allowStub) {
    console.error(
      '[seed] base-словарь не найден. Укажите каталог vocabulary аргументом или env VOCAB_DIR\n' +
      '       (напр. ../zazozu-frontend/public/data/vocabulary), либо --allow-stub для заглушки.',
    )
    process.exit(1)
  }

  const rawEntries = vocab ? vocab.entries : []
  let skipped = 0
  const mapped = []
  for (const v of rawEntries) {
    const e = toSourceEntry(v)
    if (e) mapped.push(e)
    else skipped++
  }
  const entries = vocab
    ? mapped
    : [{ entryKey: 'pl:lemma:czytać', language: 'pl', lemma: 'czytać', normalizedLemma: 'czytać', translations: [{ text: 'читать', source: 'base' }] }]

  // Дедуп по entryKey + детерминированная сортировка.
  const byKey = new Map()
  for (const e of entries) byKey.set(e.entryKey, e)
  const lines = [...byKey.values()]
    .sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1))
    .map((e) => JSON.stringify(e))
  await writeFile(join(OUT_DIR, 'lemmas.jsonl'), lines.join('\n') + '\n')

  // examples/collocations/synonyms инлайнятся в лемму; отдельные файлы создаём пустыми,
  // если их ещё нет (builder их аддитивно домёрживает по entryKey).
  for (const f of ['examples.jsonl', 'collocations.jsonl', 'synonyms.jsonl']) {
    if (!existsSync(join(OUT_DIR, f))) await writeFile(join(OUT_DIR, f), '')
  }

  const src = vocab ? `base (${vocab.dir})` : 'fallback-stub'
  console.log(
    `[seed] source/pl/lemmas.jsonl: записано ${byKey.size} лемм ` +
    `(прочитано ${rawEntries.length}, пропущено без леммы/перевода ${skipped}, дублей ${mapped.length - byKey.size}). Источник: ${src}`,
  )
}

run().catch((e) => {
  console.error('[seed] ошибка:', e.message)
  process.exit(1)
})
