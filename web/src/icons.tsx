// Era (grade) emblems and lane badges built on Lucide icons (ISC).
import { BadgeCheck, Compass, Cog, Crown, Database, FileText, Hammer, Landmark, LibraryBig, Network, ShieldCheck, Sparkles, Terminal, Wrench, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Key } from './i18n';

export const GRADE_ICONS: Record<string, LucideIcon> = { S0: Terminal, G0: Sparkles, G1: Hammer, G2: Cog, G3: LibraryBig, G4: Network, G5: ShieldCheck, G6: Crown };
// Era number by grade order; internal codes (S0, G0…) are not shown in the UI.
export const GRADE_EPOCH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Era emblem: an icon in a double gold frame with rays. State sets the color via CSS.
export function Emblem({ grade, size = 72 }: { grade: string; size?: number }) {
  const Icon = GRADE_ICONS[grade] ?? Sparkles;
  return (
    <span className="emblem" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx={50} cy={50} r={46} className="emblem-ring" />
        <circle cx={50} cy={50} r={39} className="emblem-ring thin" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6; const r1 = 41, r2 = 44.5;
          return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1} x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2} className="emblem-tick" />;
        })}
      </svg>
      <Icon size={size * 0.42} strokeWidth={1.75} className="emblem-icon" />
    </span>
  );
}

export type LaneId = 'core' | 'tools' | 'data' | 'arch' | 'quality' | 'product' | 'choice';
// The lane name is taken from the UI dictionary by the title key.
export const LANES: { id: LaneId; title: Key; areas: string[]; Icon: LucideIcon }[] = [
  { id: 'core', title: 'lane.core', areas: [], Icon: Sparkles },
  { id: 'tools', title: 'lane.tools', areas: ['R1', 'R2', 'R3'], Icon: Wrench },
  { id: 'data', title: 'lane.data', areas: ['R4', 'R12'], Icon: Database },
  { id: 'arch', title: 'lane.arch', areas: ['R5', 'R6'], Icon: Landmark },
  { id: 'quality', title: 'lane.quality', areas: ['R7', 'R8'], Icon: BadgeCheck },
  { id: 'product', title: 'lane.product', areas: ['R9', 'R10', 'R11'], Icon: FileText },
  { id: 'choice', title: 'lane.choice', areas: ['R0'], Icon: Compass },
];
export const laneOfArea = (area: string): LaneId => LANES.find((l) => l.areas.includes(area))?.id ?? 'tools';

export const LaneIcon = ({ id, size = 16 }: { id: LaneId; size?: number }): ReactNode => {
  const L = LANES.find((l) => l.id === id)!;
  return <L.Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
};

// Small lane emblem for the level card: an icon in a brass ring.
export function LaneEmblem({ id, size = 40 }: { id: LaneId; size?: number }) {
  return (
    <span className="lane-emblem" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"><circle cx={50} cy={50} r={46} className="emblem-ring" /><circle cx={50} cy={50} r={38} className="emblem-ring thin" /></svg>
      <LaneIcon id={id} size={size * 0.46} />
    </span>
  );
}
