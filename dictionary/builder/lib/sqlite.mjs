// Сборка dictionary.sqlite с FTS-индексом (артефакт релиза для репо/поиска, FR-025).
// Использует экспериментальный node:sqlite (Node 22+). При отсутствии — мягко
// пропускает (клиент Q1 потребляет JSON-бандлы, sqlite не обязателен для клиента).

import { stableStringify } from './normalize.mjs'

export async function writeSqlite(entries, filePath) {
  let DatabaseSync
  try {
    ;({ DatabaseSync } = await import('node:sqlite'))
  } catch {
    return { ok: false, skipped: true, reason: 'node:sqlite_unavailable' }
  }
  const db = new DatabaseSync(filePath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      entry_key TEXT PRIMARY KEY,
      dictionary_id TEXT,
      language TEXT,
      lemma TEXT,
      normalized_lemma TEXT,
      data_json TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(entry_key, lemma, translations);
  `)
  const ins = db.prepare(
    `INSERT OR REPLACE INTO entries (entry_key, dictionary_id, language, lemma, normalized_lemma, data_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insFts = db.prepare(`INSERT INTO entries_fts (entry_key, lemma, translations) VALUES (?, ?, ?)`)
  for (const e of entries.slice().sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1))) {
    ins.run(e.entryKey, e.dictionaryId ?? null, e.language, e.lemma, e.normalizedLemma, stableStringify(e))
    insFts.run(e.entryKey, e.lemma, (e.translations ?? []).map((t) => t.text).join(' '))
  }
  db.close()
  return { ok: true, skipped: false }
}
