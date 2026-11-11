import type { AgentInfo } from '../model/state.js';
import { isReviewer } from '../role.js';

export type GraphLayout = {
  boxes: { key: string; x: number; y: number; w: number; h: number; runs?: number }[];
  // aliases: the other runs merged into this card (their keys and tool_use ids), so their dots use this wire
  wires: { from: string; to: string; cells: [number, number][]; toolUseId?: string; aliases?: string[] }[];
};

export const MAIN_H = 5;
export const CARD_H = 6;
const ADVISOR_W = 24;
const MAIN_W = 30;
const CARD_W = 22;

const isFinished = (a: AgentInfo) => a.status === 'done' || a.status === 'failed';

/** Which cards fit: unfinished ones first, then the newest finished ones. Spawn order is kept. */
function pickCards(subs: AgentInfo[], fit: number): AgentInfo[] {
  if (subs.length <= fit) return subs;
  const ranked = subs.map((a, i) => ({ a, i }));
  const live = ranked.filter((r) => !isFinished(r.a));
  const finished = ranked.filter((r) => isFinished(r.a)).reverse();
  return [...live, ...finished].slice(0, fit).sort((p, q) => p.i - q.i).map((r) => r.a);
}

export function layoutGraph(agents: AgentInfo[], width: number, height: number): GraphLayout {
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

  // the reviewer is drawn as the advisor panel, not as a card of its own
  // The same job run again (same role, same task) reuses its card: the live run, else the latest one.
  const groups = new Map<string, AgentInfo[]>();
  for (const a of agents) {
    if (a.key === 'main' || isReviewer(a.role)) continue;
    const id = `${a.role}|${a.title}`;
    groups.set(id, [...(groups.get(id) ?? []), a]);
  }
  const runsOf = new Map<string, AgentInfo[]>();
  const subs = [...groups.values()].map((runs) => {
    const shown = [...runs].reverse().find((r) => !isFinished(r)) ?? runs[runs.length - 1];
    runsOf.set(shown.key, runs);
    return shown;
  });
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
    boxes.push({ key: a.key, x, y: cardY, w: cardW, h: CARD_H, ...(runs.length > 1 ? { runs: runs.length } : {}) });
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
