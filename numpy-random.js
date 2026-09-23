// NumPy 2.3.5-compatible SeedSequence / PCG64 / small choice-without-replacement.
// Adapted algorithms and notices: THIRD_PARTY_NOTICES.txt. Only used for features;
// actual game replies use browser cryptographic randomness.
const MASK64 = (1n << 64n) - 1n;
const MASK128 = (1n << 128n) - 1n;
const MULT = (2549297995355413924n << 64n) | 4865540595714422341n;

export function seedWords(seed) {
  const entropy = [];
  do { entropy.push(Number(seed & 0xffffffffn)); seed >>= 32n; } while (seed);
  let hash = 0x43b0d7e5;
  const hashmix = value => {
    value = (value ^ hash) >>> 0;
    hash = Math.imul(hash, 0x931e8875) >>> 0;
    value = Math.imul(value, hash) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
  };
  const mix = (a, b) => {
    const v = (Math.imul(0xca01f9dd, a) - Math.imul(0x4973f715, b)) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
  };
  const pool = Array.from({length: 4}, (_, i) => hashmix(entropy[i] ?? 0));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (i !== j) pool[j] = mix(pool[j], hashmix(pool[i]));
  }
  for (let i = 4; i < entropy.length; i++) for (let j = 0; j < 4; j++) {
    pool[j] = mix(pool[j], hashmix(entropy[i]));
  }
  hash = 0x8b51f9dd;
  const words = Array.from({length: 8}, (_, i) => {
    let v = (pool[i % 4] ^ hash) >>> 0;
    hash = Math.imul(hash, 0x58f38ded) >>> 0;
    v = Math.imul(v, hash) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
  });
  return Array.from({length: 4}, (_, i) => BigInt(words[2*i]) | (BigInt(words[2*i+1]) << 32n));
}

export class PCG64 {
  constructor(seed) {
    const w = seedWords(BigInt(seed));
    const initial = (w[0] << 64n) | w[1];
    this.increment = ((((w[2] << 64n) | w[3]) << 1n) | 1n) & MASK128;
    this.state = this.increment;
    this.state = ((this.state + initial) * MULT + this.increment) & MASK128;
    this.buffer = null;
  }
  next64() {
    this.state = (this.state * MULT + this.increment) & MASK128;
    const x = ((this.state >> 64n) ^ this.state) & MASK64;
    const rotation = this.state >> 122n;
    return ((x >> rotation) | (x << ((64n - rotation) & 63n))) & MASK64;
  }
  next32() {
    if (this.buffer !== null) { const x = this.buffer; this.buffer = null; return x; }
    const x = this.next64(); this.buffer = Number(x >> 32n);
    return Number(x & 0xffffffffn);
  }
  bounded(max) {
    if (max === 0) return 0;
    const range = max + 1;
    // Our largest range is 30240; this product is exactly representable in a double.
    let m = this.next32() * range;
    const threshold = (0xffffffff - max) % range;
    while ((m >>> 0) < threshold) m = this.next32() * range;
    return Math.floor(m / 4294967296);
  }
  choice(population, size) {
    if (size < 0 || size > population || size > 256) throw new Error('Unsupported probe sample');
    const seen = new Set(), out = [];
    for (let j = population-size; j < population; j++) {
      const value = this.bounded(j);
      const selected = seen.has(value) ? j : value;
      seen.add(selected); out.push(selected);
    }
    for (let i = size-1; i > 0; i--) {
      const j = this.bounded(i); [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
