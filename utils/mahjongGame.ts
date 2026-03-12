export type TileId = string;
export type Suit = 'dot' | 'bam' | 'wan' | 'wind' | 'dragon';
export type GameLevel = 'basic' | 'moderate' | 'difficult';
export type GameResult = {
  won: boolean;
  pattern: string | null;
  patternDisplay: string | null;
};

export const ALL_TILES: TileId[] = [
  'dot_1', 'dot_2', 'dot_3', 'dot_4', 'dot_5', 'dot_6', 'dot_7', 'dot_8', 'dot_9',
  'bam_1', 'bam_2', 'bam_3', 'bam_4', 'bam_5', 'bam_6', 'bam_7', 'bam_8', 'bam_9',
  'wan_1', 'wan_2', 'wan_3', 'wan_4', 'wan_5', 'wan_6', 'wan_7', 'wan_8', 'wan_9',
  'wind_east', 'wind_south', 'wind_west', 'wind_north',
  'dragon_red', 'dragon_green', 'dragon_white',
];

export const SUIT_MAP: Record<TileId, { suit: Suit; number: number | null }> = {};
ALL_TILES.forEach((tile) => {
  const parts = tile.split('_');
  const suit = parts[0] as Suit;
  const num = parseInt(parts[1], 10);
  SUIT_MAP[tile] = { suit, number: isNaN(num) ? null : num };
});

export function getSuit(tile: TileId): Suit {
  return SUIT_MAP[tile]?.suit ?? (tile.split('_')[0] as Suit);
}

export function getNumber(tile: TileId): number | null {
  return SUIT_MAP[tile]?.number ?? null;
}

export function isNumberTile(tile: TileId): boolean {
  const suit = getSuit(tile);
  return suit === 'dot' || suit === 'bam' || suit === 'wan';
}

export function countTile(hand: TileId[], tile: TileId): number {
  return hand.filter((t) => t === tile).length;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function numberTilesOfSuit(suit: 'dot' | 'bam' | 'wan'): TileId[] {
  return Array.from({ length: 9 }, (_, i) => `${suit}_${i + 1}`);
}

const NUMBER_SUITS: ('dot' | 'bam' | 'wan')[] = ['dot', 'bam', 'wan'];
const HONOUR_TILES: TileId[] = [
  'wind_east', 'wind_south', 'wind_west', 'wind_north',
  'dragon_red', 'dragon_green', 'dragon_white',
];

function generateBasicHand(): { hand: TileId[]; choices: TileId[]; winningIndex: number } {
  const hand: TileId[] = [];
  const pairTiles: TileId[] = [];

  const shuffledNumberSuits = shuffle(NUMBER_SUITS);
  for (let i = 0; i < 3; i++) {
    const suit = shuffledNumberSuits[i % 3];
    const tiles = numberTilesOfSuit(suit);
    const tile = pickRandom(tiles);
    hand.push(tile, tile);
    pairTiles.push(tile);
  }

  const shuffledHonours = shuffle(HONOUR_TILES);
  const honourPair = shuffledHonours[0];
  hand.push(honourPair, honourPair);
  pairTiles.push(honourPair);

  while (hand.length < 13) {
    const allNumber = NUMBER_SUITS.flatMap(numberTilesOfSuit);
    const candidate = pickRandom(allNumber);
    if (!pairTiles.includes(candidate)) {
      hand.push(candidate);
    }
  }

  const winningTile = pickRandom(pairTiles);

  const usedSet = new Set(hand);
  const nonMatchingTiles = ALL_TILES.filter(
    (t) => !usedSet.has(t) && countTile(hand, t) === 0
  );
  const shuffledNon = shuffle(nonMatchingTiles);
  const losers = shuffledNon.slice(0, 2);

  const winningIndex = Math.floor(Math.random() * 3);
  const choices: TileId[] = [];
  let loserIdx = 0;
  for (let i = 0; i < 3; i++) {
    if (i === winningIndex) {
      choices.push(winningTile);
    } else {
      choices.push(losers[loserIdx++]);
    }
  }

  console.log('[MahjongGame] Generated BASIC hand:', { hand: shuffle(hand), choices, winningIndex, winningTile });
  return { hand: shuffle(hand), choices, winningIndex };
}

function canFormSequenceWith(hand: TileId[], tile: TileId): boolean {
  if (!isNumberTile(tile)) return false;
  const suit = getSuit(tile);
  const num = getNumber(tile)!;
  const suitNums = hand.filter((t) => getSuit(t) === suit).map((t) => getNumber(t)!).sort((a, b) => a - b);
  const numSet = new Set(suitNums);

  if (numSet.has(num - 1) && numSet.has(num - 2)) return true;
  if (numSet.has(num - 1) && numSet.has(num + 1)) return true;
  if (numSet.has(num + 1) && numSet.has(num + 2)) return true;
  return false;
}

function generateModerateHand(): { hand: TileId[]; choices: TileId[]; winningIndex: number } {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const hand: TileId[] = [];
    const partialSequences: { suit: 'dot' | 'bam' | 'wan'; a: number; b: number; need: number }[] = [];

    const suits = shuffle(NUMBER_SUITS);
    for (let i = 0; i < 3; i++) {
      const suit = suits[i % 3];
      const start = 1 + Math.floor(Math.random() * 7);
      const a = start;
      const b = start + 1;
      hand.push(`${suit}_${a}`, `${suit}_${b}`);

      const needs: number[] = [];
      if (a > 1) needs.push(a - 1);
      if (b < 9) needs.push(b + 1);
      if (needs.length > 0) {
        partialSequences.push({ suit, a, b, need: pickRandom(needs) });
      }
    }

    while (hand.length < 13) {
      const suit = pickRandom(NUMBER_SUITS);
      const num = 1 + Math.floor(Math.random() * 9);
      hand.push(`${suit}_${num}`);
    }

    if (partialSequences.length === 0) continue;

    const chosenPartial = pickRandom(partialSequences);
    const winningTile: TileId = `${chosenPartial.suit}_${chosenPartial.need}`;

    const losers: TileId[] = [];
    const candidates = shuffle(ALL_TILES.filter((t) => {
      if (t === winningTile) return false;
      if (!isNumberTile(t)) return true;
      return !canFormSequenceWith(hand, t);
    }));

    if (candidates.length < 2) continue;
    losers.push(candidates[0], candidates[1]);

    const winningIndex = Math.floor(Math.random() * 3);
    const choices: TileId[] = [];
    let loserIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (i === winningIndex) {
        choices.push(winningTile);
      } else {
        choices.push(losers[loserIdx++]);
      }
    }

    console.log('[MahjongGame] Generated MODERATE hand:', { hand: shuffle(hand), choices, winningIndex, winningTile });
    return { hand: shuffle(hand), choices, winningIndex };
  }

  console.warn('[MahjongGame] Moderate generation fell back to basic');
  return generateBasicHand();
}

function sortTiles(tiles: TileId[]): TileId[] {
  const suitOrder: Record<Suit, number> = { dot: 0, bam: 1, wan: 2, wind: 3, dragon: 4 };
  return [...tiles].sort((a, b) => {
    const sa = suitOrder[getSuit(a)];
    const sb = suitOrder[getSuit(b)];
    if (sa !== sb) return sa - sb;
    const na = getNumber(a) ?? 0;
    const nb = getNumber(b) ?? 0;
    return na - nb;
  });
}

function canDecomposeToMelds(tiles: TileId[], meldCount: number): boolean {
  if (tiles.length === 0 && meldCount === 0) return true;
  if (tiles.length === 0 || meldCount === 0) return tiles.length === 0 && meldCount === 0;
  if (tiles.length !== meldCount * 3) return false;

  const sorted = sortTiles(tiles);
  const first = sorted[0];

  if (countTile(sorted, first) >= 3) {
    const remaining = [...sorted];
    for (let r = 0; r < 3; r++) {
      const idx = remaining.indexOf(first);
      remaining.splice(idx, 1);
    }
    if (canDecomposeToMelds(remaining, meldCount - 1)) return true;
  }

  if (isNumberTile(first)) {
    const suit = getSuit(first);
    const num = getNumber(first)!;
    const t2 = `${suit}_${num + 1}`;
    const t3 = `${suit}_${num + 2}`;
    const remaining = [...sorted];
    const i1 = remaining.indexOf(first);
    if (i1 === -1) return false;
    remaining.splice(i1, 1);
    const i2 = remaining.indexOf(t2);
    if (i2 === -1) return false;
    remaining.splice(i2, 1);
    const i3 = remaining.indexOf(t3);
    if (i3 === -1) return false;
    remaining.splice(i3, 1);
    if (canDecomposeToMelds(remaining, meldCount - 1)) return true;
  }

  return false;
}

function isWinningHand(tiles: TileId[]): boolean {
  if (tiles.length !== 14) return false;
  const sorted = sortTiles(tiles);
  const uniqueTiles = [...new Set(sorted)];

  for (const pairTile of uniqueTiles) {
    if (countTile(sorted, pairTile) < 2) continue;
    const remaining = [...sorted];
    let idx = remaining.indexOf(pairTile);
    remaining.splice(idx, 1);
    idx = remaining.indexOf(pairTile);
    remaining.splice(idx, 1);
    if (canDecomposeToMelds(remaining, 4)) return true;
  }
  return false;
}

function generateDifficultHand(): { hand: TileId[]; choices: TileId[]; winningIndex: number } {
  let attempts = 0;
  while (attempts < 200) {
    attempts++;
    const fullHand: TileId[] = [];

    for (let m = 0; m < 3; m++) {
      const suit = pickRandom(NUMBER_SUITS);
      const num = 1 + Math.floor(Math.random() * 9);
      fullHand.push(`${suit}_${num}`, `${suit}_${num}`, `${suit}_${num}`);
    }

    const seqSuit = pickRandom(NUMBER_SUITS);
    const seqStart = 1 + Math.floor(Math.random() * 7);
    fullHand.push(`${seqSuit}_${seqStart}`, `${seqSuit}_${seqStart + 1}`, `${seqSuit}_${seqStart + 2}`);

    const pairPool = shuffle([...ALL_TILES.filter((t) => isNumberTile(t)), ...HONOUR_TILES]);
    const pairTile = pairPool[0];
    fullHand.push(pairTile, pairTile);

    if (fullHand.length !== 14) continue;
    if (!isWinningHand(fullHand)) continue;

    const removeIdx = Math.floor(Math.random() * 14);
    const winningTile = fullHand[removeIdx];
    const hand = [...fullHand];
    hand.splice(removeIdx, 1);

    if (hand.length !== 13) continue;

    const losers: TileId[] = [];
    const candidateLosers = shuffle(ALL_TILES.filter((t) => {
      if (t === winningTile) return false;
      const testHand = [...hand, t];
      return !isWinningHand(testHand);
    }));

    if (candidateLosers.length < 2) continue;
    losers.push(candidateLosers[0], candidateLosers[1]);

    const winningIndex = Math.floor(Math.random() * 3);
    const choices: TileId[] = [];
    let loserIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (i === winningIndex) {
        choices.push(winningTile);
      } else {
        choices.push(losers[loserIdx++]);
      }
    }

    console.log('[MahjongGame] Generated DIFFICULT hand:', { hand: shuffle(hand), choices, winningIndex, winningTile });
    return { hand: shuffle(hand), choices, winningIndex };
  }

  console.warn('[MahjongGame] Difficult generation fell back to moderate');
  return generateModerateHand();
}

export function generateHand(level: GameLevel): { hand: TileId[]; choices: TileId[]; winningIndex: number } {
  console.log('[MahjongGame] Generating hand for level:', level);
  switch (level) {
    case 'basic':
      return generateBasicHand();
    case 'moderate':
      return generateModerateHand();
    case 'difficult':
      return generateDifficultHand();
    default:
      return generateBasicHand();
  }
}

export function checkResult(hand: TileId[], pickedTile: TileId, level: GameLevel): GameResult {
  console.log('[MahjongGame] Checking result:', { pickedTile, level, handSize: hand.length });

  if (level === 'basic') {
    const count = countTile(hand, pickedTile);
    if (count >= 3) {
      return { won: true, pattern: 'kong', patternDisplay: '槓得到！' };
    }
    if (count >= 2) {
      return { won: true, pattern: 'pong', patternDisplay: '碰得到！' };
    }
    return { won: false, pattern: null, patternDisplay: null };
  }

  if (level === 'moderate') {
    if (canFormSequenceWith(hand, pickedTile)) {
      return { won: true, pattern: 'chi', patternDisplay: '上得到！' };
    }
    return { won: false, pattern: null, patternDisplay: null };
  }

  if (level === 'difficult') {
    const fullHand = [...hand, pickedTile];
    if (isWinningHand(fullHand)) {
      return { won: true, pattern: 'hu', patternDisplay: '食糊！' };
    }
    return { won: false, pattern: null, patternDisplay: null };
  }

  return { won: false, pattern: null, patternDisplay: null };
}

const SUPABASE_BASE_URL = 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/mahjong/';

export function getTileImageUrl(tileId: TileId): string {
  return `${SUPABASE_BASE_URL}${tileId}.svg`;
}

export function getBackImageUrl(): string {
  return `${SUPABASE_BASE_URL}tile_back.svg`;
}

export function getTableBgUrl(): string {
  return `${SUPABASE_BASE_URL}table_bg.svg`;
}
