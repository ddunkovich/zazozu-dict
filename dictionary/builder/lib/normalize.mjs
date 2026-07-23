import { buildEntryKey, normalizeLemma } from './entryKey.mjs'

/** Приводит запись source к каноничному виду и гарантирует entryKey/normalizedLemma. */
export function normalizeSourceEntry(raw, lang = 'pl', type = 'lemma') {
  const lemma = String(raw.lemma ?? '').trim()
  const normalizedLemma = normalizeLemma(lemma)
  const entryKey = raw.entryKey || buildEntryKey(lang, type, lemma)
  return {
    entryKey,
    language: raw.language || lang,
    lemma,
    normalizedLemma,
    translations: Array.isArray(raw.translations)
      ? raw.translations.map((t) => (typeof t === 'string' ? { text: t } : t))
      : raw.ru
        ? [{ text: String(raw.ru) }]
        : [],
    partOfSpeech: raw.partOfSpeech,
    examples: raw.examples,
    collocations: raw.collocations,
    synonyms: raw.synonyms,
    pronunciation: raw.pronunciation,
    frequency: raw.frequency,
    metadata: raw.metadata,
  }
}

/** Детерминированная сериализация объекта с сортировкой ключей (для воспроизводимости). */
export function stableStringify(value) {
  return JSON.stringify(value, sortedReplacer(value))
}

function sortedReplacer() {
  return (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce((acc, k) => {
          acc[k] = val[k]
          return acc
        }, {})
    }
    return val
  }
}
