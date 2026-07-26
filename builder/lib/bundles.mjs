import { stableStringify } from './normalize.mjs'
import { sha256Hex } from './checksum.mjs'

// Разбивка словаря на бандлы для клиента (Q1: JSON-доставка). Детерминизм: записи
// отсортированы по entryKey, ключи объектов стабильны, без таймстемпов внутри.
//
// Бандл пишется в формате VocabularyEntry (как ждёт frontend/vocabularyBank), а не
// в DictionaryEntry: обратный маппинг зеркалит vocabularyBank.toDictionaryEntry —
// ru ← translations[0].text; level/category/frequencyRank/ruSimilarity/nuances/
// register/funFact/wordForms/isPhrase/… ← metadata; id ← dictionaryId; pl ← lemma.

/** DictionaryEntry (source-сборка) → VocabularyEntry (формат клиента). */
export function toVocabularyEntry(e) {
  const m = e.metadata ?? {}
  const v = {
    id: e.dictionaryId ?? '',
    pl: e.lemma,
    lemma: e.lemma,
    ru: e.translations?.[0]?.text ?? '',
    frequency: typeof e.frequency === 'number' ? e.frequency : 0,
    level: m.level ?? '',
    partOfSpeech: e.partOfSpeech ?? '',
    category: m.category ?? '',
    examples: Array.isArray(e.examples) ? e.examples : [],
    synonyms: Array.isArray(e.synonyms) ? e.synonyms : [],
    frequencyRank: typeof m.frequencyRank === 'number' ? m.frequencyRank : 0,
    ruSimilarity: typeof m.ruSimilarity === 'number' ? m.ruSimilarity : 0,
    wordForms: Array.isArray(m.wordForms) ? m.wordForms : [],
    nuances: typeof m.nuances === 'string' ? m.nuances : '',
    isPhrase: typeof m.isPhrase === 'boolean' ? m.isPhrase : (e.lemma?.includes(' ') ?? false),
  }
  // Необязательные поля — только когда заданы (undefined отбрасывается сериализацией).
  if (Array.isArray(e.collocations) && e.collocations.length) v.collocations = e.collocations
  if (m.register) v.register = m.register
  if (m.funFact) v.funFact = m.funFact
  if (Array.isArray(m.meanings) && m.meanings.length) v.meanings = m.meanings
  if (m.confusablePair) v.confusablePair = m.confusablePair
  if (Array.isArray(m.duplicateIds) && m.duplicateIds.length) v.duplicateIds = m.duplicateIds
  return v
}

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
    const content = stableStringify(list.map(toVocabularyEntry))
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
