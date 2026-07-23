// Стабильная идентичность словаря — ЗЕРКАЛО frontend/src/services/dictionary/entryKey.ts.
// Алгоритм ДОЛЖЕН совпадать байт-в-байт (общие фикстуры проверяют согласованность).

export function normalizeLemma(lemma) {
  return String(lemma).trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildEntryKey(lang, type, lemma) {
  let norm = normalizeLemma(lemma)
  if (type === 'collocation') norm = norm.replace(/ /g, '_')
  return `${lang}:${type}:${norm}`
}

export function parseEntryKey(key) {
  const first = key.indexOf(':')
  const second = key.indexOf(':', first + 1)
  return {
    lang: key.slice(0, first),
    type: key.slice(first + 1, second),
    normalizedLemma: key.slice(second + 1),
  }
}
