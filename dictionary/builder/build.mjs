// Dictionary Builder (feature 016, US4): source/** → dictionary.sqlite + JSON-бандлы
// + manifest.json + version.json + checksum. Детерминирован (FR-026); существующие
// dictionaryId не переназначаются (INV-ID-1).

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntryKey } from './lib/entryKey.mjs'
import { normalizeSourceEntry, stableStringify } from './lib/normalize.mjs'
import { validateSourceEntry } from './lib/validate.mjs'
import { buildBundles } from './lib/bundles.mjs'
import { sha256Hex } from './lib/checksum.mjs'
import { writeSqlite } from './lib/sqlite.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/**
 * Чистая сборка словаря из источников. Тестируема (детерминизм, стабильность id,
 * remap) без файловой системы.
 *
 * @param sources { lemmas, examples, collocations, synonyms } — массивы сырых записей
 * @param opts { version, generatedAt, prevManifest, remap, lang }
 */
export function buildDictionary(sources, opts = {}) {
  const lang = opts.lang || 'pl'
  const prevIds = idMapFromManifestEntries(opts.prevEntries)
  let nextId = maxNumericId(prevIds) + 1

  // Леммы → базовые записи.
  const byKey = new Map()
  for (const raw of sources.lemmas ?? []) {
    const e = normalizeSourceEntry(raw, lang, 'lemma')
    const errs = validateSourceEntry(e)
    if (errs.length) throw new Error(`invalid source entry ${e.entryKey || e.lemma}: ${errs.join(', ')}`)
    byKey.set(e.entryKey, { ...e, examples: e.examples ? [...e.examples] : [], collocations: e.collocations ? [...e.collocations] : [], synonyms: e.synonyms ? [...e.synonyms] : [] })
  }

  // Примеры/коллокации/синонимы прикрепляются к существующим леммам по entryKey.
  for (const ex of sources.examples ?? []) {
    const e = byKey.get(ex.entryKey)
    if (e && ex.example && !e.examples.includes(ex.example)) e.examples.push(ex.example)
  }
  for (const col of sources.collocations ?? []) {
    // Коллокация — отдельная запись словаря.
    const key = col.entryKey || buildEntryKey(lang, 'collocation', col.collocation ?? col.lemma ?? '')
    if (!byKey.has(key)) {
      byKey.set(key, normalizeSourceEntry({ ...col, lemma: col.collocation ?? col.lemma, entryKey: key }, lang, 'collocation'))
    }
  }
  for (const syn of sources.synonyms ?? []) {
    const e = byKey.get(syn.entryKey)
    if (e && Array.isArray(syn.synonyms)) e.synonyms = [...new Set([...(e.synonyms ?? []), ...syn.synonyms])]
  }

  // Присвоение стабильных dictionaryId (INV-ID-1).
  const entries = [...byKey.values()].sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1))
  for (const e of entries) {
    const prev = prevIds.get(e.entryKey)
    e.dictionaryId = prev ?? `d${nextId++}`
  }

  const bundles = buildBundles(entries)
  const manifest = {
    version: opts.version || 'dev',
    generatedAt: opts.generatedAt || new Date().toISOString(),
    bundles: bundles.map(({ file, sha256, count, language }) => ({ file, sha256, count, language })),
    sqlite: { file: 'dictionary.sqlite', sha256: '' },
    checksum: sha256Hex(bundles.map((b) => `${b.file}:${b.sha256}`).join('|')),
    remap: opts.remap ?? [],
  }
  return { entries, bundles, manifest }
}

function idMapFromManifestEntries(prevEntries) {
  const m = new Map()
  for (const e of prevEntries ?? []) if (e.entryKey && e.dictionaryId) m.set(e.entryKey, e.dictionaryId)
  return m
}
function maxNumericId(idMap) {
  let max = 0
  for (const id of idMap.values()) {
    const n = Number(String(id).replace(/^d/, ''))
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

// ── CLI ──
async function readJsonl(path) {
  if (!existsSync(path)) return []
  const text = await readFile(path, 'utf8')
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

async function runCli() {
  const lang = 'pl'
  const srcDir = join(ROOT, 'source', lang)
  const sources = {
    lemmas: await readJsonl(join(srcDir, 'lemmas.jsonl')),
    examples: await readJsonl(join(srcDir, 'examples.jsonl')),
    collocations: await readJsonl(join(srcDir, 'collocations.jsonl')),
    synonyms: await readJsonl(join(srcDir, 'synonyms.jsonl')),
  }
  const version = process.env.DICT_VERSION || `dict-${new Date().toISOString().slice(0, 10)}`
  const distDir = join(ROOT, 'dist')
  await mkdir(distDir, { recursive: true })

  // Предыдущие записи для стабильности id (если dist уже существует).
  let prevEntries = []
  const prevBundle = join(distDir, `vocab-${lang}.json`)
  if (existsSync(prevBundle)) prevEntries = JSON.parse(await readFile(prevBundle, 'utf8'))

  const { entries, bundles, manifest } = buildDictionary(sources, { version, prevEntries, lang })

  for (const b of bundles) await writeFile(join(distDir, b.file), b.content)
  const sqliteRes = await writeSqlite(entries, join(distDir, 'dictionary.sqlite'))
  if (sqliteRes.ok) manifest.sqlite.sha256 = sha256Hex(await readFile(join(distDir, 'dictionary.sqlite')))
  else manifest.sqlite = undefined

  await writeFile(join(distDir, 'manifest.json'), stableStringify(manifest))
  await writeFile(join(distDir, 'version.json'), stableStringify({ version: manifest.version, generatedAt: manifest.generatedAt }))
  await writeFile(join(distDir, 'checksum'), manifest.checksum)
  console.log(`[builder] ${entries.length} записей, версия ${manifest.version}, sqlite=${sqliteRes.ok}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((e) => {
    console.error('[builder] сборка провалена:', e.message)
    process.exit(1)
  })
}
