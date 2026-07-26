// Обработка входящего пакета предложений (feature 016, US3): validate → normalize
// → dedup → find entryKey → detect conflicts → review-report. НЕ меняет source
// (INV-ADMIN): результат — материал для PR, который создаёт workflow.

import { buildEntryKey } from './lib/entryKey.mjs'
import { validateContribution } from './lib/validate.mjs'

/** Нормализует событие: гарантирует entryKey для new_lemma/new_collocation. */
export function normalizeContribution(c) {
  if (c.entryKey) return { ...c }
  if (c.type === 'new_lemma' && c.payload?.lemma)
    return { ...c, entryKey: buildEntryKey(c.payload.language || 'pl', 'lemma', c.payload.lemma) }
  if (c.type === 'new_collocation' && c.payload?.collocation)
    return { ...c, entryKey: buildEntryKey(c.payload.language || 'pl', 'collocation', c.payload.collocation) }
  return { ...c }
}

/**
 * @param batch { contributions: [...] }
 * @param sourceByEntryKey Map<entryKey, sourceEntry> — текущий словарь
 * @returns { ok, errors? , report? }
 */
export function processBatch(batch, sourceByEntryKey = new Map()) {
  const items = Array.isArray(batch?.contributions) ? batch.contributions : []
  if (items.length === 0) return { ok: false, errors: [{ i: -1, es: ['empty batch'] }] }

  // 1) Validate
  const errors = []
  items.forEach((c, i) => {
    const es = validateContribution(c)
    if (es.length) errors.push({ i, es })
  })
  if (errors.length) return { ok: false, errors }

  // 2) Normalize
  const normalized = items.map(normalizeContribution)

  // 3) Dedup (внутри пакета) по (type, entryKey, payload)
  const seen = new Set()
  const deduped = []
  for (const c of normalized) {
    const key = `${c.type}|${c.entryKey || ''}|${JSON.stringify(c.payload)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }

  // 4) Find existing entryKey + 5) detect conflicts
  const newEntries = []
  const existingEntries = []
  const conflicts = []
  for (const c of deduped) {
    const exists = c.entryKey && sourceByEntryKey.has(c.entryKey)
    if (!exists && (c.type === 'new_lemma' || c.type === 'new_collocation')) {
      newEntries.push(c)
    } else if (exists) {
      existingEntries.push(c)
      if (c.type === 'translation_fix') {
        const src = sourceByEntryKey.get(c.entryKey)
        const known = new Set((src.translations ?? []).map((t) => t.text))
        if (known.size > 0 && !known.has(c.payload.translation)) {
          conflicts.push({ entryKey: c.entryKey, proposed: c.payload.translation, existing: [...known] })
        }
      }
    } else {
      // правка для несуществующей записи — тоже конфликт/аномалия
      conflicts.push({ entryKey: c.entryKey, reason: 'entry_not_found', type: c.type })
    }
  }

  // 6) Review report
  const contributorsByKey = {}
  for (const c of deduped) {
    const k = c.entryKey || c.payload?.lemma || c.payload?.collocation || 'unknown'
    contributorsByKey[k] = (contributorsByKey[k] ?? 0) + 1
  }

  return {
    ok: true,
    report: {
      total: deduped.length,
      dedupedCount: normalized.length - deduped.length,
      newEntries,
      existingEntries,
      conflicts,
      contributorsByKey,
    },
    normalized: deduped,
  }
}

/** Формирует markdown-отчёт для тела PR (FR-021). */
export function renderReport(report) {
  const lines = [
    '## Обзор вклада в словарь',
    '',
    `- Всего предложений (после дедупа): **${report.total}** (удалено дублей: ${report.dedupedCount})`,
    `- Новых записей: **${report.newEntries.length}**`,
    `- Правок существующих: **${report.existingEntries.length}**`,
    `- Конфликтов: **${report.conflicts.length}**`,
    '',
  ]
  if (report.conflicts.length) {
    lines.push('### ⚠️ Конфликты (требуют ручного решения)')
    for (const c of report.conflicts) {
      lines.push(`- \`${c.entryKey}\`: ${c.reason ?? `предложено «${c.proposed}» при существующих ${JSON.stringify(c.existing)}`}`)
    }
    lines.push('')
  }
  if (report.newEntries.length) {
    lines.push('### 📝 Новые леммы')
    lines.push(
      `Обогащённые (с переводом) добавлены в \`source/pl/lemmas.jsonl\` как предложение к мержу. ` +
      `Слова без перевода (оффлайн) — в \`source/pl/proposed-lemmas.jsonl\` (builder не потребляет); ` +
      `админ дозаполняет перевод и переносит их в lemmas.jsonl (FR-024).`,
    )
    lines.push('')
  }
  lines.push('> Автоматически подготовлено; изменения source/** требуют ручного ревью (INV-ADMIN).')
  return lines.join('\n')
}
