// Тесты валидации (feature 016, US3). Запуск:
//   node --test dictionary/schema/schema.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateContribution, validateSourceEntry } from '../builder/lib/validate.mjs'
import { applyContributionUpdate, foldWordFormsIntoMetadata } from '../builder/lib/normalize.mjs'
import { processBatch, normalizeContribution } from '../builder/intake.mjs'
import { buildDictionary } from '../builder/build.mjs'

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

test('update с entryKey валиден, без entryKey — нет', () => {
  assert.deepEqual(
    validateContribution({ type: 'update', entryKey: 'pl:lemma:mieć', payload: { wordForms: ['miej'] } }),
    [],
  )
  const e = validateContribution({ type: 'update', payload: { wordForms: ['miej'] } })
  assert.ok(e.includes('entryKey required'))
})

test('processBatch: update существующей леммы не валит пакет', () => {
  const source = new Map([
    ['pl:lemma:mieć', { translations: [{ text: 'иметь' }], metadata: { wordForms: ['mam'] } }],
  ])
  const res = processBatch(
    {
      contributions: [
        {
          type: 'update',
          entryKey: 'pl:lemma:mieć',
          payload: { lemma: 'mieć', translation: 'иметь, обладать', wordForms: ['mam', 'miej'] },
        },
      ],
    },
    source,
  )
  assert.equal(res.ok, true)
  assert.equal(res.report.updates.length, 1)
  assert.deepEqual(res.report.updates[0].addedWordForms, ['miej'])
  assert.equal(res.report.existingEntries.length, 1)
  assert.equal(res.report.conflicts.length, 1)
})

test('applyContributionUpdate дописывает словоформы и не затирает перевод', () => {
  const entry = {
    entryKey: 'pl:lemma:mieć',
    lemma: 'mieć',
    translations: [{ text: 'иметь', source: 'base' }],
    examples: ['Mam psa.'],
    metadata: { wordForms: ['mam', 'masz'], level: 'A1' },
  }
  const next = applyContributionUpdate(entry, {
    translation: 'иметь, обладать',
    wordForms: ['masz', 'miej'],
    examples: ['Mam psa.', 'Masz rację?'],
  })
  assert.deepEqual(next.translations, entry.translations)
  assert.equal(next.metadata.level, 'A1')
  assert.deepEqual(next.metadata.wordForms, ['mam', 'masz', 'miej'])
  assert.deepEqual(next.examples, ['Mam psa.', 'Masz rację?'])
  assert.equal('wordForms' in next, false)
})

test('foldWordFormsIntoMetadata сливает корневой wordForms в metadata и удаляет корень', () => {
  const folded = foldWordFormsIntoMetadata({
    lemma: 'aberracja',
    metadata: { wordForms: ['aberracja', 'aberracji'] },
    wordForms: ['aberracjach', 'aberracji'],
  })
  assert.equal('wordForms' in folded, false)
  assert.deepEqual(folded.metadata.wordForms, ['aberracja', 'aberracji', 'aberracjach'])

  const { bundles } = buildDictionary(
    {
      lemmas: [
        {
          lemma: 'aberracja',
          ru: 'аберрация',
          metadata: { wordForms: ['aberracja'] },
          wordForms: ['aberracjach'],
        },
      ],
    },
    { version: 'v1', generatedAt: 'T' },
  )
  const list = JSON.parse(bundles[0].content)
  assert.deepEqual(list[0].wordForms, ['aberracja', 'aberracjach'])
})
