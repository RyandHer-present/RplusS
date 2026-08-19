// Generates the stored form of a PIN: `saltHex:hashHex`.
//
// Run locally, paste the OUTPUT into the database. The PIN itself never leaves
// this machine and the output is useless without a live login endpoint sitting
// behind rate limiting.
//
//   node scripts/hash-pin.mjs 1234

import { webcrypto as crypto } from 'node:crypto'

const PBKDF2_ITERATIONS = 210_000

const pin = process.argv[2]
if (!/^\d{4}$/.test(pin ?? '')) {
  console.error('Usage: node scripts/hash-pin.mjs <4-digit-pin>')
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
  'deriveBits',
])
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
  key,
  256,
)

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
console.log(`${hex(salt)}:${hex(bits)}`)
