import { stableStringify } from './normalize.mjs'
import { sha256Hex } from './checksum.mjs'

// Разбивка словаря на бандлы для клиента (Q1: JSON-доставка). Детерминизм: записи
// отсортированы по entryKey, ключи объектов стабильны, без таймстемпов внутри.

/** Формирует бандлы + их checksum по языку. Возвращает [{file, sha256, count, language, content}]. */
export function buildBundles(entries) {
  const byLang = new Map()
  for (const e of entries) {
    if (!byLang.has(e.language)) byLang.set(e.language, [])
    byLang.get(e.language).push(e)
  }
  const bundles = []
  for (const lang of [...byLang.keys()].sort()) {
    const list = byLang.get(lang).slice().sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1))
    const content = stableStringify(list)
    bundles.push({
      file: `vocab-${lang}.json`,
      sha256: sha256Hex(content),
      count: list.length,
      language: lang,
      content,
    })
  }
  return bundles
}
