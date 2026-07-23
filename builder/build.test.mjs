// Тесты Dictionary Builder (feature 016, US4). Запуск:
//   node --test dictionary/builder/build.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDictionary } from './build.mjs'

const baseSources = {
  lemmas: [
    { lemma: 'czytać', ru: 'читать' },
    { lemma: 'dom', ru: 'дом' },
  ],
  examples: [{ entryKey: 'pl:lemma:czytać', example: 'Czytam książkę.' }],
  collocations: [],
  synonyms: [],
}

test('сборка присваивает entryKey и dictionaryId, прикрепляет примеры', () => {
  const { entries, manifest } = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  const czytac = entries.find((e) => e.entryKey === 'pl:lemma:czytać')
  assert.ok(czytac)
  assert.ok(czytac.dictionaryId)
  assert.deepEqual(czytac.examples, ['Czytam książkę.'])
  assert.equal(manifest.version, 'v1')
  assert.equal(manifest.bundles.length, 1)
})

test('детерминизм: две сборки дают идентичные бандлы и checksum', () => {
  const a = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  const b = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  assert.equal(a.bundles[0].content, b.bundles[0].content)
  assert.equal(a.manifest.checksum, b.manifest.checksum)
})

test('стабильность id (INV-ID-1): новая запись не меняет id существующих', () => {
  const first = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  const prevEntries = first.entries
  const withNew = {
    ...baseSources,
    lemmas: [...baseSources.lemmas, { lemma: 'kot', ru: 'кот' }],
  }
  const second = buildDictionary(withNew, { version: 'v2', generatedAt: 'T', prevEntries })

  const idOf = (entries, key) => entries.find((e) => e.entryKey === key)?.dictionaryId
  assert.equal(idOf(second.entries, 'pl:lemma:czytać'), idOf(prevEntries, 'pl:lemma:czytać'))
  assert.equal(idOf(second.entries, 'pl:lemma:dom'), idOf(prevEntries, 'pl:lemma:dom'))
  // Новая запись получила новый id, отличный от существующих.
  const newId = idOf(second.entries, 'pl:lemma:kot')
  assert.ok(newId)
  assert.notEqual(newId, idOf(prevEntries, 'pl:lemma:czytać'))
})

test('remap записывается в манифест', () => {
  const remap = [{ from: 'pl:lemma:stary', to: 'pl:lemma:nowy', sinceVersion: 'v2' }]
  const { manifest } = buildDictionary(baseSources, { version: 'v2', generatedAt: 'T', remap })
  assert.deepEqual(manifest.remap, remap)
})

test('невалидный source приводит к ошибке сборки', () => {
  assert.throws(() => buildDictionary({ lemmas: [{ ru: 'без леммы' }] }, { version: 'v1' }))
})
