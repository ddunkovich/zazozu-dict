// Одноразовая нормализация source/pl/lemmas.jsonl:
// корневой wordForms вливается в metadata.wordForms и удаляется.
// Строки без корневого поля не переписываются (байт-в-байт).
//   node builder/fold-wordforms.mjs [--apply]

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { foldWordFormsIntoMetadata } from './lib/normalize.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATH = join(ROOT, 'source', 'pl', 'lemmas.jsonl')

const text = await readFile(PATH, 'utf8')
let changed = 0
const out = []
for (const line of text.split('\n')) {
  if (!line.trim()) {
    out.push(line)
    continue
  }
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    out.push(line)
    continue
  }
  if (!Object.prototype.hasOwnProperty.call(obj, 'wordForms')) {
    out.push(line)
    continue
  }
  out.push(JSON.stringify(foldWordFormsIntoMetadata(obj)))
  changed++
}

console.log(`строк с корневым wordForms: ${changed}`)
if (process.argv.includes('--apply')) {
  await writeFile(PATH, out.join('\n'), 'utf8')
  console.log(`записано ${PATH}`)
} else {
  console.log('dry-run: файл не изменён. Запустите с --apply.')
}
