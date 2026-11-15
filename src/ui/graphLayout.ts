import type { AgentInfo } from '../model/state.js';
import { isReviewer } from '../role.js';

export type GraphLayout = {
  boxes: { key: string; x: number; y: number; w: number; h: number; runs?: number; tokens?: number }[];
  // aliases: the other runs merged into this card (their keys and tool_use ids), so their dots use this wire
  wires: { from: string; to: string; cells: [number, number][]; toolUseId?: string; aliases?: string[] }[];
};

export const MAIN_H = 5;
export const CARD_H = 6;
const ADVISOR_W = 24;
const MAIN_W = 30;
const CARD_W = 22;
export const FOLD_AFTER_MS = 5_000;

const isFinished = (a: AgentInfo) => a.status === 'done' || a.status === 'failed';

/** Which cards fit: unfinished ones first, then the newest finished ones. Spawn order is kept. */
function pickCards(subs: AgentInfo[], fit: number): AgentInfo[] {
  if (subs.length <= fit) return subs;
  const ranked = subs.map((a, i) => ({ a, i }));
  const live = ranked.filter((r) => !isFinished(r.a));
  const finished = ranked.filter((r) => isFinished(r.a)).reverse();
  return [...live, ...finished].slice(0, fit).sort((p, q) => p.i - q.i).map((r) => r.a);
}

export function layoutGraph(agents: AgentInfo[], width: number, height: number, nowMs: number = Date.now(), taskNo?: number): GraphLayout {
  // wide enough to read its labels whenever the graph is a normal size
  const advW = Math.min(ADVISOR_W, Math.max(width >= 60 ? 20 : 8, Math.floor(width / 4)));
  const advH = Math.max(MAIN_H, height);
  const areaX = advW + 2;
  const areaW = Math.max(1, width - areaX);
  const mainW = Math.min(MAIN_W, areaW);
  const mainX = areaX + Math.floor((areaW - mainW) / 2);
  const mainCx = mainX + Math.floor(mainW / 2);
  const mainBottom = MAIN_H;

  const boxes: GraphLayout['boxes'] = [
    { key: 'advisor', x: 0, y: 0, w: advW, h: advH },
    { key: 'main', x: mainX, y: 0, w: mainW, h: MAIN_H },
  ];
  const wires: GraphLayout['wires'] = [];

  const advCells: [number, number][] = [];
  const midY = Math.floor(MAIN_H / 2);
  for (let x = advW; x < mainX; x++) advCells.push([x, midY]);
  if (advCells.length) wires.push({ from: 'main', to: 'advisor', cells: advCells });

  // The reviewer is drawn as the advisor panel, not as a card of its own.
  // Live agents and the just finished (so their ✓ shows) get their own card; older finished runs fold into one card per role.
  const helpers = agents.filter((a) => a.key !== 'main' && !isReviewer(a.role));
  const folds = (a: AgentInfo) => isFinished(a) && !(nowMs - Date.parse(a.finishedAt ?? '') < FOLD_AFTER_MS);
  const folded = new Map<string, AgentInfo[]>();
  for (const a of helpers) if (folds(a)) folded.set(a.role, [...(folded.get(a.role) ?? []), a]);
  const runsOf = new Map<string, AgentInfo[]>();
  for (const [role, runs] of folded) {
    const hidden = taskNo !== undefined && !runs.some((r) => r.taskNo === undefined || r.taskNo === taskNo)
      && !helpers.some((a) => a.role === role && !isFinished(a));
    if (!hidden) runsOf.set(runs[runs.length - 1].key, runs);
  }
  const subs = helpers.filter((a) => !folds(a) || runsOf.has(a.key));
  const cardW = Math.min(CARD_W, areaW);
  const fit = Math.max(1, Math.floor((areaW + 1) / (cardW + 1)));
  const shown = pickCards(subs, fit);
  const rowW = shown.length * cardW + Math.max(0, shown.length - 1);
  const rowX = areaX + Math.max(0, Math.floor((areaW - rowW) / 2));
  const busY = mainBottom + 1;
  const cardY = busY + 2;

  shown.forEach((a, i) => {
    const x = rowX + i * (cardW + 1);
    const runs = runsOf.get(a.key) ?? [a];
    const fold = runsOf.has(a.key) ? { runs: runs.length, tokens: runs.reduce((n, r) => n + r.tokens, 0) } : {};
    boxes.push({ key: a.key, x, y: cardY, w: cardW, h: CARD_H, ...fold });
    const aliases = runs.filter((r) => r !== a).flatMap((r) => [r.key, ...(r.toolUseId ? [r.toolUseId] : [])]);
    const cx = x + Math.floor(cardW / 2);
    const cells: [number, number][] = [];
    for (let y = mainBottom; y <= busY; y++) cells.push([mainCx, y]);
    const step = cx >= mainCx ? 1 : -1;
    for (let px = mainCx + step; px !== cx + step && cx !== mainCx; px += step) cells.push([px, busY]);
    cells.push([cx, cardY - 1]);
    wires.push({ from: 'main', to: a.key, cells, ...(a.toolUseId ? { toolUseId: a.toolUseId } : {}), ...(aliases.length ? { aliases } : {}) });
  });

  return { boxes, wires };
}
