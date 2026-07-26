// Тесты Dictionary Builder (feature 016, US4). Запуск:
//   node --test dictionary/builder/build.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDictionary, frequencyTier } from './build.mjs'

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

test('бандл в формате VocabularyEntry (обратный маппинг для клиента)', () => {
  const { bundles } = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  const list = JSON.parse(bundles[0].content)
  const czytac = list.find((w) => w.pl === 'czytać')
  assert.ok(czytac)
  assert.equal(czytac.ru, 'читать') // translations[0].text → ru
  assert.equal(typeof czytac.id, 'string') // dictionaryId → id
  assert.equal(typeof czytac.frequencyRank, 'number') // из metadata
  assert.equal(czytac.entryKey, undefined) // клиентский формат без entryKey
  assert.ok('isPhrase' in czytac && 'wordForms' in czytac && 'level' in czytac)
})

test('стабильность id, когда prev — бандл VocabularyEntry (путь runCli)', () => {
  const first = buildDictionary(baseSources, { version: 'v1', generatedAt: 'T' })
  const prevEntries = JSON.parse(first.bundles[0].content) // VocabularyEntry[], без entryKey
  const withNew = { ...baseSources, lemmas: [...baseSources.lemmas, { lemma: 'kot', ru: 'кот' }] }
  const second = buildDictionary(withNew, { version: 'v2', generatedAt: 'T', prevEntries })
  const idOf = (entries, key) => entries.find((e) => e.entryKey === key)?.dictionaryId
  assert.equal(idOf(second.entries, 'pl:lemma:czytać'), idOf(first.entries, 'pl:lemma:czytać'))
  assert.equal(idOf(second.entries, 'pl:lemma:dom'), idOf(first.entries, 'pl:lemma:dom'))
})

test('remap записывается в манифест', () => {
  const remap = [{ from: 'pl:lemma:stary', to: 'pl:lemma:nowy', sinceVersion: 'v2' }]
  const { manifest } = buildDictionary(baseSources, { version: 'v2', generatedAt: 'T', remap })
  assert.deepEqual(manifest.remap, remap)
})

test('невалидный source приводит к ошибке сборки', () => {
  assert.throws(() => buildDictionary({ lemmas: [{ ru: 'без леммы' }] }, { version: 'v1' }))
})

test('frequencyRank: канонический плотный ранг по сигналу, source не нужен глобально', () => {
  const sources = {
    lemmas: [
      { lemma: 'rzadkie', ru: 'редкое', metadata: { frequencyRank: 9000 } },
      { lemma: 'czeste', ru: 'частое', metadata: { frequencyRank: 5 } },
      { lemma: 'srednie', ru: 'среднее', metadata: { frequencyRank: 250 } },
      { lemma: 'bezsignala', ru: 'без сигнала' }, // нет frequencyRank → в конец
    ],
    examples: [], collocations: [], synonyms: [],
  }
  const { entries } = buildDictionary(sources, { version: 'v1', generatedAt: 'T' })
  const meta = (key) => entries.find((e) => e.entryKey === key)?.metadata
  // Плотный ранг 1..N в порядке сигнала (5 < 250 < 9000 < ∞).
  assert.equal(meta('pl:lemma:czeste').frequencyRank, 1)
  assert.equal(meta('pl:lemma:czeste').frequencyTier, 'top100')
  assert.equal(meta('pl:lemma:srednie').frequencyRank, 2)
  assert.equal(meta('pl:lemma:srednie').frequencyTier, 'top100')
  assert.equal(meta('pl:lemma:rzadkie').frequencyRank, 3)
  assert.equal(meta('pl:lemma:bezsignala').frequencyRank, 4) // без сигнала — последним
  assert.equal(frequencyTier(100), 'top100')
  assert.equal(frequencyTier(101), 'top300')
  assert.equal(frequencyTier(5000), 'rest')
})

test('frequencyRank детерминирован: тай-брейк по entryKey', () => {
  const sources = {
    lemmas: [
      { lemma: 'beta', ru: 'бета', metadata: { frequencyRank: 10 } },
      { lemma: 'alfa', ru: 'альфа', metadata: { frequencyRank: 10 } }, // тот же сигнал
    ],
    examples: [], collocations: [], synonyms: [],
  }
  const a = buildDictionary(sources, { version: 'v1', generatedAt: 'T' })
  const b = buildDictionary(sources, { version: 'v1', generatedAt: 'T' })
  assert.equal(a.bundles[0].content, b.bundles[0].content)
  const rank = (res, key) => res.entries.find((e) => e.entryKey === key).metadata.frequencyRank
  // alfa < beta по entryKey при равном сигнале → alfa=1, beta=2.
  assert.equal(rank(a, 'pl:lemma:alfa'), 1)
  assert.equal(rank(a, 'pl:lemma:beta'), 2)
})
