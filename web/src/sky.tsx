// Starry sky: background of the whole hub, purely decorative, not clickable.
// One tile map (a background of random stars + seven constellations per era shaped like real constellations) is wrapped into a torus
// and drifts right-down, one full loop in 10 minutes. Stars = topics: brightness grows with progress, a gap = variable star.
import { useEffect, useRef } from 'react';
import { gradeTopics, isUnlocked, useStore } from './store';
import type { Grade, Pack, State, Topic } from './types';

type Fig = { stars: [number, number][]; segs: [number, number][] };
// Figures in the unit square, based on atlas stick figures.
const FIG: Record<string, Fig> = {
  orion: { stars: [[.5,.1],[.3,.3],[.7,.32],[.38,.58],[.5,.55],[.62,.52],[.33,.88],[.72,.92],[.2,.14],[.26,.0]], segs: [[0,1],[0,2],[1,3],[2,5],[3,4],[4,5],[3,6],[5,7],[1,8],[8,9]] },
  gemini: { stars: [[.3,.08],[.52,.1],[.32,.28],[.3,.45],[.27,.62],[.2,.78],[.12,.9],[.54,.3],[.56,.48],[.53,.63],[.6,.8],[.66,.92],[.4,.7],[.15,.5],[.7,.55]], segs: [[0,2],[2,3],[3,4],[4,5],[5,6],[1,7],[7,8],[8,9],[9,10],[10,11],[2,7],[4,12],[3,13],[8,14]] },
  scorpius: { stars: [[.9,.14],[.93,.24],[.9,.34],[.96,.19],[.76,.4],[.68,.5],[.6,.6],[.5,.7],[.42,.8],[.4,.9],[.48,.96],[.58,.93],[.62,.85],[.66,.79]], segs: [[0,1],[1,2],[3,1],[1,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13]] },
  ursa: { stars: [[.05,.35],[.17,.3],[.28,.28],[.38,.3],[.4,.45],[.55,.48],[.53,.3],[.66,.24],[.8,.19],[.88,.27],[.6,.62],[.63,.76],[.78,.55],[.84,.62],[.35,.6],[.3,.75],[.25,.82],[.72,.33],[.9,.4]], segs: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3],[6,7],[7,8],[8,9],[9,18],[5,10],[10,11],[7,12],[12,13],[4,14],[14,15],[15,16],[7,17]] },
  hercules: { stars: [[.45,.3],[.55,.28],[.57,.45],[.43,.47],[.3,.2],[.2,.12],[.65,.15],[.75,.08],[.35,.62],[.3,.78],[.2,.88],[.68,.6],[.72,.75],[.8,.85],[.5,.1],[.62,.37]], segs: [[0,1],[1,2],[2,3],[3,0],[0,4],[4,5],[1,6],[6,7],[3,8],[8,9],[9,10],[2,11],[11,12],[12,13],[1,14],[2,15]] },
  leo: { stars: [[.35,.66],[.33,.5],[.4,.38],[.5,.3],[.6,.28],[.62,.4],[.8,.45],[.78,.62],[.95,.6]], segs: [[0,1],[1,2],[2,3],[3,4],[4,5],[2,6],[0,7],[6,8],[7,8],[6,7]] },
  draco: { stars: [[.85,.2],[.9,.3],[.8,.32],[.78,.22],[.7,.4],[.62,.55],[.55,.68],[.45,.72],[.35,.62],[.28,.5],[.2,.42],[.12,.5],[.06,.6],[.03,.72]], segs: [[0,1],[1,2],[2,3],[3,0],[2,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13]] },
};
// Layout of eras on the 1600×900 tile (sketch), eras in order G0..G6.
const PLACE = [
  { fig: 'orion', cx: 300, cy: 660, s: 300 }, { fig: 'gemini', cx: 300, cy: 260, s: 300 }, { fig: 'scorpius', cx: 1330, cy: 640, s: 340 },
  { fig: 'ursa', cx: 1250, cy: 230, s: 400 }, { fig: 'hercules', cx: 870, cy: 240, s: 320 }, { fig: 'leo', cx: 880, cy: 680, s: 300 }, { fig: 'draco', cx: 590, cy: 470, s: 290 },
];
const TILE_W = 1600, TILE_H = 900;

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

type StarStatus = 'locked' | 'open' | 'progress' | 'gap' | 'done';
function statusOf(t: Topic, unlocked: boolean, state: State | null): StarStatus {
  const s = state?.topics[t.key]?.status;
  if (s === 'learned') return 'done';
  if (!unlocked) return 'locked';
  return s === 'gap' ? 'gap' : s === 'in_progress' ? 'progress' : 'open';
}

export type Pt = { x: number; y: number; main: boolean; topic: Topic };
export type Constellation = { grade: Grade; pts: Pt[]; segs: [number, number][] };
// Era constellation: the figure's anchor stars + faint stars along the longest lines if there are more topics.
export function buildConstellations(pack: Pack): Constellation[] {
  const grades = [...pack.grades].sort((a, b) => a.order - b.order);
  return grades.map((g, gi) => {
    const p = PLACE[gi % PLACE.length]; const f = FIG[p.fig];
    const topics = gradeTopics(g).slice().sort((a, b) => a.seq - b.seq);
    const pts: Pt[] = f.stars.map(([x, y], i) => ({ x: p.cx + (x - 0.5) * p.s, y: p.cy + (y - 0.5) * p.s, main: true, topic: topics[i] }));
    const segs: [number, number][] = f.segs.map(([a, b]) => [a, b]);
    const len = (s: [number, number]) => Math.hypot(pts[s[0]].x - pts[s[1]].x, pts[s[0]].y - pts[s[1]].y);
    let k = 0;
    while (pts.length < topics.length) {
      segs.sort((a, b) => len(b) - len(a));
      const [a, b] = segs.shift()!; const t = 0.45 + hash(g.id + k++) * 0.1;
      const mi = pts.push({ x: pts[a].x + (pts[b].x - pts[a].x) * t, y: pts[a].y + (pts[b].y - pts[a].y) * t, main: false, topic: topics[pts.length] }) - 1;
      segs.push([a, mi], [mi, b]);
    }
    return { grade: g, pts: pts.slice(0, topics.length).map((pt, i) => ({ ...pt, topic: topics[i] })), segs: segs.filter(([a, b]) => a < topics.length && b < topics.length) };
  });
}

export function Sky() {
  const { pack, state, sky } = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ pack, state, sky });
  live.current = { pack, state, sky };

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let W = 0, H = 0, dpr = 1, scale = 1, tw = TILE_W, th = TILE_H, raf = 0, last = 0;
    let px = Math.random(), py = Math.random(); // start from a random tile point on every load
    let tile: HTMLCanvasElement | null = null;
    let cons: Constellation[] = []; let consPack: Pack | null = null;

    // The background tile is drawn once: 1500 random stars of varying brightness (a real generator, no banding).
    const makeTile = () => {
      tile = document.createElement('canvas'); tile.width = Math.round(tw * dpr); tile.height = Math.round(th * dpr);
      const c = tile.getContext('2d')!; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rnd = mulberry32(20261022); const tints = ['#cfd8ff', '#e8edff', '#ffe9c4', '#ffffff', '#b9c6f2'];
      for (let i = 0; i < 1500; i++) {
        const mag = Math.pow(rnd(), 3); const x = rnd() * tw, y = rnd() * th; const r = (0.35 + mag * 1.5) * scale;
        c.globalAlpha = 0.08 + mag * 0.55; c.fillStyle = tints[Math.floor(rnd() * tints.length)];
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
    };
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      // tile is one and a half screens, sketch proportions are preserved
      scale = Math.max((1.5 * W) / TILE_W, (1.5 * H) / TILE_H, 1);
      tw = TILE_W * scale; th = TILE_H * scale;
      makeTile();
    };
    fit();
    window.addEventListener('resize', fit);

    // Flashes: every 2–6 s a random unstudied constellation star smoothly brightens and fades over 6 s; several run at once.
    const flashes = new Map<string, number>(); let nextFlash = 0; const frnd = mulberry32(7);
    let visible: string[] = []; let visibleNow: string[] = []; // stars in view on the previous frame: flashes only among them
    const spawnFlash = (time: number) => {
      const { sky } = live.current;
      if (sky.flashes && flashes.size < sky.concurrent) {
        const pool = visible.filter((k) => !flashes.has(k));
        if (pool.length) flashes.set(pool[Math.floor(frnd() * pool.length)], time);
      }
      nextFlash = time + 0.15 + frnd() * 0.5; // staggered starts so phases do not coincide
    };
    const drawConstellations = (ox: number, oy: number, time: number) => {
      const { pack, state, sky } = live.current; const FLASH = sky.flash;
      if (!pack) return;
      if (consPack !== pack) { cons = buildConstellations(pack); consPack = pack; }
      if (time >= nextFlash) spawnFlash(time);
      for (const [k, t0] of flashes) if (time - t0 > FLASH) flashes.delete(k);
      for (const c of cons) {
        const unlocked = isUnlocked(pack, c.grade.id, state); // the server's lock rule, once per era and frame
        const st = c.pts.map((p) => statusOf(p.topic, unlocked, state));
        const X = (p: Pt) => ox + p.x * scale, Y = (p: Pt) => oy + p.y * scale;
        // lines: dim, bright between two studied stars
        for (const [a, b] of c.segs) {
          const lit = st[a] === 'done' && st[b] === 'done';
          ctx.strokeStyle = lit ? 'rgba(230,236,255,0.85)' : 'rgba(125,137,179,0.35)'; ctx.lineWidth = lit ? 1.3 : 1;
          ctx.beginPath(); ctx.moveTo(X(c.pts[a]), Y(c.pts[a])); ctx.lineTo(X(c.pts[b]), Y(c.pts[b])); ctx.stroke();
        }
        c.pts.forEach((p, i) => {
          const x = X(p), y = Y(p); const base = p.main ? 1 : 0.7; const s = st[i];
          if (s !== 'done' && s !== 'gap' && x > 20 && x < W - 20 && y > 20 && y < H - 20) visibleNow.push(p.topic.key);
          if (s === 'done') {
            const halo = ctx.createRadialGradient(x, y, 0, x, y, 16 * base);
            halo.addColorStop(0, 'rgba(255,255,255,0.65)'); halo.addColorStop(0.45, 'rgba(223,230,255,0.24)'); halo.addColorStop(1, 'rgba(223,230,255,0)');
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 16 * base, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 3.4 * base, 0, Math.PI * 2); ctx.fill();
          } else if (s === 'gap') {
            // variable star: ring, dashed outer ring, pulsing core
            ctx.globalAlpha = 0.22; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.95; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.stroke();
            const ph = (Math.sin((time / 2.4) * Math.PI * 2) + 1) / 2; // 0..1 over 2.4 s
            ctx.globalAlpha = 0.15 + 0.85 * ph; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 1.2 + 1.2 * ph, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            const t0 = flashes.get(p.topic.key); const f = t0 === undefined ? 0 : Math.sin(Math.PI * Math.min(1, (time - t0) / FLASH)); // 0 → 1 → 0 over 6 s
            const r0 = (s === 'progress' ? 2.8 : s === 'open' ? 2.1 : 1.6) * base; const a0 = s === 'progress' ? 0.95 : s === 'open' ? 0.7 : 0.45;
            if (f > 0.03) {
              const g = ctx.createRadialGradient(x, y, 0, x, y, 22 * f + 2);
              g.addColorStop(0, `rgba(255,255,255,${0.7 * f})`); g.addColorStop(0.4, `rgba(223,230,255,${0.25 * f})`); g.addColorStop(1, 'rgba(223,230,255,0)');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22 * f + 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = a0 + (1 - a0) * f;
            ctx.fillStyle = f > 0.5 ? '#ffffff' : s === 'progress' ? '#f2f5ff' : s === 'open' ? '#c8d2f0' : '#9aa6c9';
            ctx.beginPath(); ctx.arc(x, y, r0 * (1 + 1.6 * f) + 1.2 * f, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          }
        });
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.visibilityState === 'hidden') { last = now; return; }
      if (now - last < 33) return; // ~30 fps
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const { sky } = live.current;
      // drift: period in seconds and direction in degrees (0 = right, 90 = down); coordinates modulo the tile
      const a = (sky.angle * Math.PI) / 180; const v = dt / Math.max(10, sky.period);
      px = (px + Math.cos(a) * v + 1) % 1; py = (py + Math.sin(a) * v + 1) % 1;
      const time = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createRadialGradient(W * 0.6, H * 0.2, 0, W * 0.6, H * 0.2, Math.max(W, H) * 1.1);
      bg.addColorStop(0, '#141c3a'); bg.addColorStop(0.55, '#0a0f22'); bg.addColorStop(1, '#070a14');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // offset right-down; torus: four tile copies, we draw the visible ones
      visibleNow = [];
      if (!sky.enabled) return;
      const ox0 = px * tw, oy0 = py * th;
      for (const i of [-1, 0]) for (const j of [-1, 0]) {
        const ox = ox0 + i * tw, oy = oy0 + j * th;
        if (ox > W || oy > H || ox + tw < 0 || oy + th < 0) continue;
        if (tile) ctx.drawImage(tile, ox, oy, tw, th);
        drawConstellations(ox, oy, time);
      }
      visible = visibleNow;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, []);

  return <canvas ref={ref} className="sky-canvas" aria-hidden="true" />;
}
