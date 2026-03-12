export type TileId = string;
export type Suit = 'pin' | 'sou' | 'man' | 'wind' | 'dragon';
export type GameLevel = 'basic' | 'moderate' | 'difficult';

export interface GameResult {
  won: boolean;
  pattern: string | null;
  patternDisplay: { en: string; zh_hant: string; zh_hans: string } | null;
}

export interface GeneratedHand {
  hand: TileId[];
  choices: TileId[];
  winningIndex: number;
}

const BASE_URL = 'https://pfgtnrlgetomfmrzbxgb.supabase.co/storage/v1/object/public/mahjong/';

export const ALL_TILES: TileId[] = [
  'Pin1', 'Pin2', 'Pin3', 'Pin4', 'Pin5', 'Pin6', 'Pin7', 'Pin8', 'Pin9',
  'Sou1', 'Sou2', 'Sou3', 'Sou4', 'Sou5', 'Sou6', 'Sou7', 'Sou8', 'Sou9',
  'Man1', 'Man2', 'Man3', 'Man4', 'Man5', 'Man6', 'Man7', 'Man8', 'Man9',
  'Ton', 'Nan', 'Shaa', 'Pei',
  'Chun', 'Hatsu', 'Haku',
];

export const TILE_NAMES: Record<string, { en: string; zh_hant: string; zh_hans: string }> = {
  Pin1: { en: '1 Dot', zh_hant: '一筒', zh_hans: '一筒' },
  Pin2: { en: '2 Dot', zh_hant: '二筒', zh_hans: '二筒' },
  Pin3: { en: '3 Dot', zh_hant: '三筒', zh_hans: '三筒' },
  Pin4: { en: '4 Dot', zh_hant: '四筒', zh_hans: '四筒' },
  Pin5: { en: '5 Dot', zh_hant: '五筒', zh_hans: '五筒' },
  Pin6: { en: '6 Dot', zh_hant: '六筒', zh_hans: '六筒' },
  Pin7: { en: '7 Dot', zh_hant: '七筒', zh_hans: '七筒' },
  Pin8: { en: '8 Dot', zh_hant: '八筒', zh_hans: '八筒' },
  Pin9: { en: '9 Dot', zh_hant: '九筒', zh_hans: '九筒' },
  Sou1: { en: '1 Bamboo', zh_hant: '一索', zh_hans: '一索' },
  Sou2: { en: '2 Bamboo', zh_hant: '二索', zh_hans: '二索' },
  Sou3: { en: '3 Bamboo', zh_hant: '三索', zh_hans: '三索' },
  Sou4: { en: '4 Bamboo', zh_hant: '四索', zh_hans: '四索' },
  Sou5: { en: '5 Bamboo', zh_hant: '五索', zh_hans: '五索' },
  Sou6: { en: '6 Bamboo', zh_hant: '六索', zh_hans: '六索' },
  Sou7: { en: '7 Bamboo', zh_hant: '七索', zh_hans: '七索' },
  Sou8: { en: '8 Bamboo', zh_hant: '八索', zh_hans: '八索' },
  Sou9: { en: '9 Bamboo', zh_hant: '九索', zh_hans: '九索' },
  Man1: { en: '1 Character', zh_hant: '一萬', zh_hans: '一万' },
  Man2: { en: '2 Character', zh_hant: '二萬', zh_hans: '二万' },
  Man3: { en: '3 Character', zh_hant: '三萬', zh_hans: '三万' },
  Man4: { en: '4 Character', zh_hant: '四萬', zh_hans: '四万' },
  Man5: { en: '5 Character', zh_hant: '五萬', zh_hans: '五万' },
  Man6: { en: '6 Character', zh_hant: '六萬', zh_hans: '六万' },
  Man7: { en: '7 Character', zh_hant: '七萬', zh_hans: '七万' },
  Man8: { en: '8 Character', zh_hant: '八萬', zh_hans: '八万' },
  Man9: { en: '9 Character', zh_hant: '九萬', zh_hans: '九万' },
  Ton: { en: 'East Wind', zh_hant: '東', zh_hans: '东' },
  Nan: { en: 'South Wind', zh_hant: '南', zh_hans: '南' },
  Shaa: { en: 'West Wind', zh_hant: '西', zh_hans: '西' },
  Pei: { en: 'North Wind', zh_hant: '北', zh_hans: '北' },
  Chun: { en: 'Red Dragon', zh_hant: '中', zh_hans: '中' },
  Hatsu: { en: 'Green Dragon', zh_hant: '發', zh_hans: '发' },
  Haku: { en: 'White Dragon', zh_hant: '白', zh_hans: '白' },
};

const SUIT_ORDER: Record<Suit, number> = { pin: 0, sou: 1, man: 2, wind: 3, dragon: 4 };
const WIND_ORDER: Record<string, number> = { Ton: 0, Nan: 1, Shaa: 2, Pei: 3 };
const DRAGON_ORDER: Record<string, number> = { Chun: 0, Hatsu: 1, Haku: 2 };

export function getSuit(tile: TileId): Suit {
  if (tile.startsWith('Pin')) return 'pin';
  if (tile.startsWith('Sou')) return 'sou';
  if (tile.startsWith('Man')) return 'man';
  if (tile === 'Ton' || tile === 'Nan' || tile === 'Shaa' || tile === 'Pei') return 'wind';
  return 'dragon';
}

export function getNumber(tile: TileId): number | null {
  const suit = getSuit(tile);
  if (suit === 'wind' || suit === 'dragon') return null;
  const num = parseInt(tile.replace(/^(Pin|Sou|Man)/, ''), 10);
  return isNaN(num) ? null : num;
}

export function isNumberTile(tile: TileId): boolean {
  const suit = getSuit(tile);
  return suit === 'pin' || suit === 'sou' || suit === 'man';
}

export function countTile(hand: TileId[], tile: TileId): number {
  return hand.filter(t => t === tile).length;
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

function getSuitPrefix(suit: Suit): string {
  if (suit === 'pin') return 'Pin';
  if (suit === 'sou') return 'Sou';
  return 'Man';
}

const NUMBER_SUITS: Suit[] = ['pin', 'sou', 'man'];
const HONOUR_TILES: TileId[] = ['Ton', 'Nan', 'Shaa', 'Pei', 'Chun', 'Hatsu', 'Haku'];

function canFormSequenceWith(hand: TileId[], tile: TileId): boolean {
  if (!isNumberTile(tile)) return false;
  const suit = getSuit(tile);
  const num = getNumber(tile)!;
  const samesuit = hand.filter(t => getSuit(t) === suit);
  const nums = samesuit.map(t => getNumber(t)!);
  if (nums.includes(num - 1) && nums.includes(num - 2)) return true;
  if (nums.includes(num - 1) && nums.includes(num + 1)) return true;
  if (nums.includes(num + 1) && nums.includes(num + 2)) return true;
  return false;
}

function generateBasicHand(): GeneratedHand {
  const pairCount = 2 + Math.floor(Math.random() * 2);
  const allShuffled = shuffle(ALL_TILES);
  const pairTiles: TileId[] = [];
  const used = new Set<TileId>();

  for (const tile of allShuffled) {
    if (pairTiles.length >= pairCount) break;
    if (!used.has(tile)) {
      pairTiles.push(tile);
      used.add(tile);
    }
  }

  const hand: TileId[] = [];
  for (const tile of pairTiles) {
    hand.push(tile, tile);
  }

  const remaining = ALL_TILES.filter(t => !used.has(t));
  const shuffledRemaining = shuffle(remaining);
  let idx = 0;
  while (hand.length < 13 && idx < shuffledRemaining.length) {
    const tile = shuffledRemaining[idx];
    if (countTile(hand, tile) === 0) {
      hand.push(tile);
    }
    idx++;
  }

  const winningTile = pickRandom(pairTiles);

  const loserPool = ALL_TILES.filter(t => !pairTiles.includes(t) && countTile(hand, t) === 0);
  const shuffledLosers = shuffle(loserPool);
  const losers = shuffledLosers.slice(0, 2);

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

  console.log('[MahjongGame] Basic hand generated, pairs:', pairTiles, 'winning:', winningTile);
  return { hand: sortHand(hand), choices, winningIndex };
}

function generateModerateHand(): GeneratedHand {
  const hand: TileId[] = [];
  const seqCount = 2 + Math.floor(Math.random() * 2);

  interface PartialSeq { suit: Suit; a: number; b: number; missing: number }
  const partials: PartialSeq[] = [];

  const usedSuits = shuffle(NUMBER_SUITS).slice(0, Math.min(seqCount, 3));

  for (let i = 0; i < seqCount; i++) {
    const suit = usedSuits[i % usedSuits.length];
    const prefix = getSuitPrefix(suit);
    let a: number, b: number, missing: number;

    const startOptions = shuffle([1, 2, 3, 4, 5, 6, 7]);
    let found = false;
    for (const start of startOptions) {
      const end = start + 1;
      const possibleMissing = [start - 1, start + 2].filter(n => n >= 1 && n <= 9);
      if (possibleMissing.length > 0) {
        a = start;
        b = end;
        missing = pickRandom(possibleMissing);
        const tileA = `${prefix}${a}` as TileId;
        const tileB = `${prefix}${b}` as TileId;
        if (countTile(hand, tileA) < 3 && countTile(hand, tileB) < 3) {
          hand.push(tileA, tileB);
          partials.push({ suit, a, b, missing });
          found = true;
          break;
        }
      }
    }
    if (!found) break;
  }

  const nonAdjacentTiles = shuffle([...HONOUR_TILES, ...ALL_TILES.filter(t => {
    if (!isNumberTile(t)) return false;
    const num = getNumber(t)!;
    const suit = getSuit(t);
    return !partials.some(p => p.suit === suit && Math.abs(num - p.a) <= 2 && Math.abs(num - p.b) <= 2);
  })]);

  let fillIdx = 0;
  while (hand.length < 13 && fillIdx < nonAdjacentTiles.length) {
    const t = nonAdjacentTiles[fillIdx];
    if (countTile(hand, t) < 3) {
      hand.push(t);
    }
    fillIdx++;
  }

  while (hand.length < 13) {
    hand.push(pickRandom(HONOUR_TILES));
  }

  const chosenPartial = pickRandom(partials);
  const winningTile = `${getSuitPrefix(chosenPartial.suit)}${chosenPartial.missing}` as TileId;

  const losers: TileId[] = [];
  const loserCandidates = shuffle(ALL_TILES.filter(t => {
    if (t === winningTile) return false;
    return !canFormSequenceWith(hand, t);
  }));

  for (const c of loserCandidates) {
    if (losers.length >= 2) break;
    losers.push(c);
  }

  while (losers.length < 2) {
    losers.push(pickRandom(HONOUR_TILES));
  }

  const winningIndex = Math.floor(Math.random() * 3);
  const choices: TileId[] = [];
  let li = 0;
  for (let i = 0; i < 3; i++) {
    if (i === winningIndex) {
      choices.push(winningTile);
    } else {
      choices.push(losers[li++]);
    }
  }

  console.log('[MahjongGame] Moderate hand generated, partials:', partials, 'winning:', winningTile);
  return { hand: sortHand(hand), choices, winningIndex };
}

function generateDifficultHand(): GeneratedHand {
  const hand14: TileId[] = [];

  const suits = shuffle(NUMBER_SUITS);
  for (let m = 0; m < 3; m++) {
    const suit = suits[m % suits.length];
    const prefix = getSuitPrefix(suit);
    const n = 1 + Math.floor(Math.random() * 9);
    hand14.push(`${prefix}${n}` as TileId, `${prefix}${n}` as TileId, `${prefix}${n}` as TileId);
  }

  const seqSuit = pickRandom(NUMBER_SUITS);
  const seqPrefix = getSuitPrefix(seqSuit);
  const seqStart = 1 + Math.floor(Math.random() * 7);
  hand14.push(
    `${seqPrefix}${seqStart}` as TileId,
    `${seqPrefix}${seqStart + 1}` as TileId,
    `${seqPrefix}${seqStart + 2}` as TileId,
  );

  const pairTile = pickRandom(shuffle(ALL_TILES));
  hand14.push(pairTile, pairTile);

  const removeIdx = Math.floor(Math.random() * 14);
  const winningTile = hand14[removeIdx];
  const hand13 = [...hand14];
  hand13.splice(removeIdx, 1);

  const losers: TileId[] = [];
  const loserCandidates = shuffle(ALL_TILES.filter(t => {
    if (t === winningTile) return false;
    const test14 = [...hand13, t];
    return !isWinningHand(test14);
  }));

  for (const c of loserCandidates) {
    if (losers.length >= 2) break;
    losers.push(c);
  }

  while (losers.length < 2) {
    const fallback = shuffle(ALL_TILES.filter(t => t !== winningTile));
    losers.push(fallback[losers.length]);
  }

  const winningIndex = Math.floor(Math.random() * 3);
  const choices: TileId[] = [];
  let li = 0;
  for (let i = 0; i < 3; i++) {
    if (i === winningIndex) {
      choices.push(winningTile);
    } else {
      choices.push(losers[li++]);
    }
  }

  console.log('[MahjongGame] Difficult hand generated, winning:', winningTile);
  return { hand: sortHand(hand13), choices, winningIndex };
}

export function generateHand(level: GameLevel): GeneratedHand {
  console.log('[MahjongGame] Generating hand for level:', level);
  if (level === 'basic') return generateBasicHand();
  if (level === 'moderate') return generateModerateHand();
  return generateDifficultHand();
}

export function checkResult(hand: TileId[], pickedTile: TileId, level: GameLevel): GameResult {
  console.log('[MahjongGame] Checking result, level:', level, 'picked:', pickedTile);

  if (level === 'basic') {
    const count = countTile(hand, pickedTile);
    if (count >= 3) {
      return {
        won: true,
        pattern: 'kong',
        patternDisplay: { en: 'Kong!', zh_hant: '槓得到！', zh_hans: '杠得到！' },
      };
    }
    if (count >= 2) {
      return {
        won: true,
        pattern: 'pong',
        patternDisplay: { en: 'Pong!', zh_hant: '碰得到！', zh_hans: '碰得到！' },
      };
    }
    return { won: false, pattern: null, patternDisplay: null };
  }

  if (level === 'moderate') {
    if (canFormSequenceWith(hand, pickedTile)) {
      return {
        won: true,
        pattern: 'chi',
        patternDisplay: { en: 'Chi!', zh_hant: '上得到！', zh_hans: '上得到！' },
      };
    }
    return { won: false, pattern: null, patternDisplay: null };
  }

  const full = [...hand, pickedTile];
  if (isWinningHand(full)) {
    return {
      won: true,
      pattern: 'hu',
      patternDisplay: { en: 'Hu! You win!', zh_hant: '食糊！', zh_hans: '食胡！' },
    };
  }
  return { won: false, pattern: null, patternDisplay: null };
}

function tileToSortKey(tile: TileId): number {
  const suit = getSuit(tile);
  const base = SUIT_ORDER[suit] * 100;
  if (suit === 'wind') return base + (WIND_ORDER[tile] ?? 0);
  if (suit === 'dragon') return base + (DRAGON_ORDER[tile] ?? 0);
  return base + (getNumber(tile) ?? 0);
}

export function isWinningHand(tiles: TileId[]): boolean {
  if (tiles.length !== 14) return false;
  const sorted = [...tiles].sort((a, b) => tileToSortKey(a) - tileToSortKey(b));
  return canDecompose(sorted, false);
}

function canDecompose(tiles: TileId[], hasPair: boolean): boolean {
  if (tiles.length === 0) return hasPair;

  const first = tiles[0];

  if (!hasPair && countTile(tiles, first) >= 2) {
    const remaining = removeTiles(tiles, first, 2);
    if (canDecompose(remaining, true)) return true;
  }

  if (countTile(tiles, first) >= 3) {
    const remaining = removeTiles(tiles, first, 3);
    if (canDecompose(remaining, hasPair)) return true;
  }

  if (isNumberTile(first)) {
    const suit = getSuit(first);
    const num = getNumber(first)!;
    const prefix = getSuitPrefix(suit);
    const next1 = `${prefix}${num + 1}` as TileId;
    const next2 = `${prefix}${num + 2}` as TileId;
    if (tiles.includes(next1) && tiles.includes(next2)) {
      const remaining = removeOneTile(removeOneTile(removeOneTile(tiles, first), next1), next2);
      if (canDecompose(remaining, hasPair)) return true;
    }
  }

  return false;
}

function removeTiles(tiles: TileId[], tile: TileId, count: number): TileId[] {
  const result = [...tiles];
  let removed = 0;
  for (let i = result.length - 1; i >= 0 && removed < count; i--) {
    if (result[i] === tile) {
      result.splice(i, 1);
      removed++;
    }
  }
  return result;
}

function removeOneTile(tiles: TileId[], tile: TileId): TileId[] {
  const idx = tiles.indexOf(tile);
  if (idx === -1) return tiles;
  const result = [...tiles];
  result.splice(idx, 1);
  return result;
}

export function sortHand(hand: TileId[]): TileId[] {
  return [...hand].sort((a, b) => tileToSortKey(a) - tileToSortKey(b));
}

export function getTileImageUrl(tileId: TileId): string {
  return `${BASE_URL}${tileId}.svg`;
}

export function getBackImageUrl(): string {
  return `${BASE_URL}Back.svg`;
}

export function getTableBgUrl(): string {
  return `${BASE_URL}table_bg.svg`;
}
