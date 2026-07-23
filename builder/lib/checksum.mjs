import { createHash } from 'node:crypto'

/** SHA-256 в hex — контроль целостности артефактов релиза (FR-025). */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
