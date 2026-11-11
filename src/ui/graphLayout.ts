import type { AgentInfo } from '../model/state.js';

export type GraphLayout = {
  boxes: { key: string; x: number; y: number; w: number; h: number }[];
  wires: { from: string; to: string; cells: [number, number][]; toolUseId?: string }[];
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
  const advW = Math.min(ADVISOR_W, Math.max(8, Math.floor(width / 4)));
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

  const subs = agents.filter((a) => a.key !== 'main');
  const cardW = Math.min(CARD_W, areaW);
  const fit = Math.max(1, Math.floor((areaW + 1) / (cardW + 1)));
  const shown = pickCards(subs, fit);
  const rowW = shown.length * cardW + Math.max(0, shown.length - 1);
  const rowX = areaX + Math.max(0, Math.floor((areaW - rowW) / 2));
  const busY = mainBottom + 1;
  const cardY = busY + 2;

  shown.forEach((a, i) => {
    const x = rowX + i * (cardW + 1);
    boxes.push({ key: a.key, x, y: cardY, w: cardW, h: CARD_H });
    const cx = x + Math.floor(cardW / 2);
    const cells: [number, number][] = [];
    for (let y = mainBottom; y <= busY; y++) cells.push([mainCx, y]);
    const step = cx >= mainCx ? 1 : -1;
    for (let px = mainCx + step; px !== cx + step && cx !== mainCx; px += step) cells.push([px, busY]);
    cells.push([cx, cardY - 1]);
    wires.push({ from: 'main', to: a.key, cells, ...(a.toolUseId ? { toolUseId: a.toolUseId } : {}) });
  });

  return { boxes, wires };
}
