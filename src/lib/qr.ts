/**
 * A QR encoder, in about two hundred lines and no dependencies.
 *
 * There is a perfectly good npm package for this. It is not used, for one practical reason
 * and one structural one. The practical: the same encoder has to run in the phone app, which
 * deliberately carries no native modules, and having two different encoders behind one
 * printed poster is how you end up with a code that works on the website and not in the app.
 * The structural: this is forty lines of specification and the rest is arithmetic, and
 * arithmetic that can be tested exhaustively is cheaper to own than a dependency to track.
 *
 * Byte mode, error-correction level M, versions 1-10. That covers any address this platform
 * puts on a poster with room to spare - version 10 at level M holds 213 bytes.
 *
 * Level M rather than L is a deliberate trade: it costs about a fifth of the capacity and buys
 * back roughly 15% damage tolerance. These codes end up printed on paper, taped to windows and
 * photographed at an angle in daylight, which is exactly the case error correction is for.
 *
 * Verified against an independent encoder over every version and a wide spread of payloads:
 * the module matrix is identical, mask choice included. Worth saying, because a QR that is
 * subtly wrong still looks exactly like a QR. You find out when somebody holds up a phone in
 * front of a shop and nothing happens.
 */

/** Error-correction bytes per block, and the block layout, for level M. */
const BLOCKS: Record<number, [number, [number, number][]]> = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
  5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};

/** Row/column centres of the alignment patterns, per version. */
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** GF(256) with the QR primitive polynomial. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      // poly is descending, so index j is x^(deg-j): multiplying by x keeps the index and
      // multiplying by the root moves it one along. Swap these two lines and the generator's
      // leading coefficient stops being 1 - every correction byte comes out wrong while the
      // data bytes stay perfect, which reads as "nearly working".
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecc(data: number[], n: number): number[] {
  const gen = generator(n);
  const out = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    if (factor !== 0) {
      for (let i = 0; i < gen.length - 1; i++) out[i] ^= mul(gen[i + 1], factor);
    }
  }
  return out;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(
      0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
      0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f),
    );
  }
  return bytes;
}

function penalty(g: number[][], size: number): number {
  let score = 0;
  const RUN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const RUN_REVERSED = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // rule 1, both directions
      if (c === 0 || g[r][c] !== g[r][c - 1]) {
        let run = 1;
        while (c + run < size && g[r][c + run] === g[r][c]) run++;
        if (run >= 5) score += run - 2;
      }
      if (r === 0 || g[r][c] !== g[r - 1][c]) {
        let run = 1;
        while (r + run < size && g[r + run][c] === g[r][c]) run++;
        if (run >= 5) score += run - 2;
      }
      // rule 2
      if (r + 1 < size && c + 1 < size &&
          g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) {
        score += 3;
      }
      // rule 3
      if (c + 11 <= size) {
        let a = true;
        let b = true;
        for (let k = 0; k < 11; k++) {
          if (g[r][c + k] !== RUN[k]) a = false;
          if (g[r][c + k] !== RUN_REVERSED[k]) b = false;
        }
        if (a || b) score += 40;
      }
      if (r + 11 <= size) {
        let a = true;
        let b = true;
        for (let k = 0; k < 11; k++) {
          if (g[r + k][c] !== RUN[k]) a = false;
          if (g[r + k][c] !== RUN_REVERSED[k]) b = false;
        }
        if (a || b) score += 40;
      }
    }
  }

  // rule 4
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += g[r][c];
  const percent = (dark * 100) / (size * size);
  return score + Math.floor(Math.abs(percent - 50) / 5) * 10;
}

function formatBits(mask: number): number {
  const data = (0x00 << 3) | mask; // level M is 00
  let value = data << 10;
  for (let i = 14; i >= 10; i--) if ((value >> i) & 1) value ^= 0x537 << (i - 10);
  return ((data << 10) | value) ^ 0x5412;
}

/**
 * The module grid for `text`: `matrix[row][col]` is 1 for a dark module.
 *
 * Throws only when the payload will not fit a version-10 code, which for this platform means
 * somebody has put something other than a link in it.
 */
export function qrMatrix(text: string): number[][] {
  const utf8 = utf8Bytes(text);

  let version = 0;
  let dataCapacity = 0;
  for (let v = 1; v <= 10; v++) {
    const [, groups] = BLOCKS[v];
    const capacity = groups.reduce((sum, [count, size]) => sum + count * size, 0);
    const header = 4 + (v < 10 ? 8 : 16);
    if (utf8.length * 8 + header <= capacity * 8) {
      version = v;
      dataCapacity = capacity;
      break;
    }
  }
  if (!version) throw new Error('That is too long for a QR code this size.');

  const [ecLen, groups] = BLOCKS[version];

  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(4, 4);                                   // byte mode
  push(utf8.length, version < 10 ? 8 : 16);
  for (const byte of utf8) push(byte, 8);
  for (let i = 0; i < 4 && bits.length < dataCapacity * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  for (let i = 0; bytes.length < dataCapacity; i++) bytes.push(i % 2 === 0 ? 0xec : 0x11);

  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const block = bytes.slice(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      eccBlocks.push(ecc(block, ecLen));
    }
  }

  const finalBytes: number[] = [];
  const longest = Math.max(...dataBlocks.map(block => block.length));
  for (let i = 0; i < longest; i++) for (const block of dataBlocks) if (i < block.length) finalBytes.push(block[i]);
  for (let i = 0; i < ecLen; i++) for (const block of eccBlocks) finalBytes.push(block[i]);

  const size = version * 4 + 17;
  const m: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));

  const finder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                   (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                   (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        m[r][c] = on ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Exactly three combinations are skipped - the ones that would sit on a finder. Testing
  // "is the centre already taken?" instead looks equivalent and is not: from version 7 the
  // alignment patterns at (6, x) land on the timing line, which is already drawn, so that
  // test silently drops real patterns and every code from v7 up comes out unscannable.
  const align = ALIGN[version];
  const last = align.length - 1;
  for (let a = 0; a <= last; a++) {
    for (let b = 0; b <= last; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) continue;
      const r = align[a];
      const c = align[b];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
        }
      }
    }
  }

  m[size - 8][8] = 1; // the dark module

  const reserved: [number, number][] = [];
  for (let i = 0; i < 9; i++) reserved.push([8, i], [i, 8]);
  for (let i = 0; i < 8; i++) reserved.push([8, size - 1 - i], [size - 1 - i, 8]);
  for (const [r, c] of reserved) if (m[r][c] === null) m[r][c] = 0;

  if (version >= 7) {
    let value = version << 12;
    for (let i = 17; i >= 12; i--) if ((value >> i) & 1) value ^= 0x1f25 << (i - 12);
    const info = (version << 12) | value;
    for (let i = 0; i < 18; i++) {
      const bit = (info >> i) & 1;
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }

  const free = m.map(row => row.map(cell => cell === null));
  let bitIndex = 0;
  let upward = true;
  const nextBit = () => {
    const byteIndex = bitIndex >> 3;
    const bit = byteIndex < finalBytes.length ? (finalBytes[byteIndex] >> (7 - (bitIndex & 7))) & 1 : 0;
    bitIndex++;
    return bit;
  };
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) if (free[row][c]) m[row][c] = nextBit();
    }
    upward = !upward;
  }

  const drawn = m as number[][];
  let best: number[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = drawn.map(row => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (free[r][c] && MASKS[mask](r, c)) g[r][c] ^= 1;
    }
    const fmt = formatBits(mask);
    // Two copies, and both are written column-then-row: the first runs down column 8 and
    // along row 8 by the finder; the second along row 8 on the right and down column 8 at the
    // bottom. Transpose either and you get something that still looks like a QR and scans as
    // nothing at all.
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> i) & 1;
      if (i < 6) g[i][8] = bit;
      else if (i === 6) g[7][8] = bit;
      else if (i === 7) g[8][8] = bit;
      else if (i === 8) g[8][7] = bit;
      else g[8][14 - i] = bit;

      if (i < 8) g[8][size - 1 - i] = bit;
      else g[size - 15 + i][8] = bit;
    }
    g[size - 8][8] = 1;

    const score = penalty(g, size);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }

  return best!;
}

/**
 * The same code as one SVG path, ready to drop into a page.
 *
 * SVG rather than a canvas because these get printed. A canvas is a bitmap at whatever size it
 * was drawn, and a QR resampled by a printer is a QR with soft edges; a path is exact at any
 * size, on paper or on a phone.
 *
 * The quiet zone is four modules and is not optional - a QR with no margin around it is
 * routinely unreadable, and it is the single most common way a home-made code fails.
 */
export function qrSvgPath(matrix: number[][], quiet = 4): { path: string; extent: number } {
  const n = matrix.length;
  const extent = n + quiet * 2;
  const parts: string[] = [];

  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!matrix[r][c]) { c++; continue; }
      // Runs, not squares: one rect per horizontal run keeps the path short enough to inline
      // in a page without the file being mostly QR.
      let run = 1;
      while (c + run < n && matrix[r][c + run]) run++;
      parts.push(`M${c + quiet} ${r + quiet}h${run}v1h-${run}z`);
      c += run;
    }
  }

  return { path: parts.join(''), extent };
}
