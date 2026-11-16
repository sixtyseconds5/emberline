// A small seeded random generator (mulberry32), so a screenshot seed always
// plays the same run and the game can be replayed exactly.

/** Make a generator from a 32-bit seed. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    /** A float in [0, 1). */
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** A float in [min, max). */
    range(min, max) {
      return min + this.next() * (max - min);
    },
    /** An integer in [min, max]. */
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    /** Pick one entry of an array. */
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}
