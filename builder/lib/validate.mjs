// Валидация без внешних зависимостей — источник истины для intake и тестов.
// Соответствует schema/contribution.schema.json и schema/source-entry.schema.json.

const CONTRIBUTION_TYPES = new Set([
  'new_lemma',
  'translation_fix',
  'new_example',
  'new_collocation',
])

/** Возвращает массив ошибок (пустой = валидно). */
export function validateContribution(c) {
  const errors = []
  if (!c || typeof c !== 'object') return ['not an object']
  if (!CONTRIBUTION_TYPES.has(c.type)) errors.push('bad type')
  const p = c.payload || {}
  if ((c.type === 'translation_fix' || c.type === 'new_example') && !c.entryKey)
    errors.push('entryKey required')
  if (c.type === 'new_lemma' && !p.lemma) errors.push('payload.lemma required')
  if (c.type === 'new_collocation' && !p.collocation) errors.push('payload.collocation required')
  if (c.type === 'translation_fix' && !p.translation) errors.push('payload.translation required')
  if (c.type === 'new_example' && !p.example) errors.push('payload.example required')
  return errors
}

/** Валидация записи source/*.jsonl. */
export function validateSourceEntry(x) {
  const errors = []
  if (!x || typeof x !== 'object') return ['not an object']
  for (const f of ['entryKey', 'language', 'lemma', 'normalizedLemma']) {
    if (!x[f]) errors.push(`${f} required`)
  }
  if (!Array.isArray(x.translations) || x.translations.length === 0)
    errors.push('translations required')
  return errors
}
