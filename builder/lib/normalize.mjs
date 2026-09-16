import { buildEntryKey, normalizeLemma } from './entryKey.mjs'

/** Склеивает списки словоформ: без пустых, без дублей (регистр не важен, сохраняется первое написание). */
export function unionWordForms(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const s = String(raw ?? '').trim()
      if (!s) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
  }
  return out
}

/**
 * Единственное каноническое место словоформ — metadata.wordForms.
 * Корневой wordForms (легаси) вливается туда и удаляется.
 */
export function foldWordFormsIntoMetadata(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const forms = unionWordForms(raw.metadata?.wordForms, raw.wordForms)
  const { wordForms: _drop, ...rest } = raw
  const metadata = { ...(raw.metadata ?? {}) }
  if (forms.length) metadata.wordForms = forms
  else delete metadata.wordForms
  const out = { ...rest }
  if (Object.keys(metadata).length) out.metadata = metadata
  else delete out.metadata
  return out
}

/** Приводит запись source к каноничному виду и гарантирует entryKey/normalizedLemma. */
export function normalizeSourceEntry(raw, lang = 'pl', type = 'lemma') {
  const folded = foldWordFormsIntoMetadata(raw ?? {})
  const lemma = String(folded.lemma ?? '').trim()
  const normalizedLemma = normalizeLemma(lemma)
  const entryKey = folded.entryKey || buildEntryKey(lang, type, lemma)
  return {
    entryKey,
    language: folded.language || lang,
    lemma,
    normalizedLemma,
    translations: Array.isArray(folded.translations)
      ? folded.translations.map((t) => (typeof t === 'string' ? { text: t } : t))
      : folded.ru
        ? [{ text: String(folded.ru) }]
        : [],
    partOfSpeech: folded.partOfSpeech,
    examples: folded.examples,
    collocations: folded.collocations,
    synonyms: folded.synonyms,
    pronunciation: folded.pronunciation,
    frequency: folded.frequency,
    metadata: folded.metadata,
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
