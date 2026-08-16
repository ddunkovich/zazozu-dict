// Тесты валидации (feature 016, US3). Запуск:
//   node --test dictionary/schema/schema.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateContribution, validateSourceEntry } from '../builder/lib/validate.mjs'
import { processBatch, normalizeContribution } from '../builder/intake.mjs'

test('валидные предложения всех 4 типов проходят', () => {
  assert.deepEqual(validateContribution({ type: 'new_lemma', payload: { lemma: 'kot', language: 'pl' } }), [])
  assert.deepEqual(validateContribution({ type: 'translation_fix', entryKey: 'pl:lemma:czytać', payload: { translation: 'читать' } }), [])
  assert.deepEqual(validateContribution({ type: 'new_example', entryKey: 'pl:lemma:czytać', payload: { example: 'Czytam.' } }), [])
  assert.deepEqual(validateContribution({ type: 'new_collocation', payload: { collocation: 'na pewno', language: 'pl' } }), [])
})

test('translation_fix без entryKey невалиден', () => {
  const e = validateContribution({ type: 'translation_fix', payload: { translation: 'x' } })
  assert.ok(e.includes('entryKey required'))
})

test('source-entry требует обязательные поля', () => {
  assert.deepEqual(validateSourceEntry({ entryKey: 'pl:lemma:kot', language: 'pl', lemma: 'kot', normalizedLemma: 'kot', translations: [{ text: 'кот' }] }), [])
  const e = validateSourceEntry({ lemma: 'kot' })
  assert.ok(e.length >= 3)
})

test('normalizeContribution вычисляет entryKey для new_lemma', () => {
  const c = normalizeContribution({ type: 'new_lemma', payload: { lemma: 'Czytać', language: 'pl' } })
  assert.equal(c.entryKey, 'pl:lemma:czytać')
})

test('processBatch: классифицирует новое/существующее/конфликт и строит отчёт', () => {
  const source = new Map([['pl:lemma:czytać', { translations: [{ text: 'читать' }] }]])
  const batch = {
    contributions: [
      { type: 'new_lemma', payload: { lemma: 'przeterminowany', language: 'pl' } },
      { type: 'translation_fix', entryKey: 'pl:lemma:czytać', payload: { translation: 'просматривать' } },
    ],
  }
  const res = processBatch(batch, source)
  assert.equal(res.ok, true)
  assert.equal(res.report.newEntries.length, 1)
  assert.equal(res.report.existingEntries.length, 1)
  assert.equal(res.report.conflicts.length, 1) // 'просматривать' конфликтует с 'читать'
})

test('processBatch: невалидный пакет возвращает ошибки', () => {
  const res = processBatch({ contributions: [{ type: 'bogus', payload: {} }] })
  assert.equal(res.ok, false)
})

test('validateContribution: delete_from_base с entryKey валидно', () => {
  assert.deepEqual(
    validateContribution({ type: 'delete_from_base', entryKey: 'pl:lemma:certyfikować_systemy', payload: {} }),
    [],
  )
})

test('validateContribution: delete_from_base без entryKey невалидно', () => {
  const e = validateContribution({ type: 'delete_from_base', payload: {} })
  assert.ok(e.some((s) => s.includes('entryKey')))
})
