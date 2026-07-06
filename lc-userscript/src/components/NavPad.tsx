import { h } from 'preact';
import type { Direction, DirectionOption } from '@/utils/domExtract';

export interface NavPadProps {
  directions: DirectionOption[];
}

const DIR_LABELS: Record<Direction, string> = {
  north: 'É',
  south: 'D',
  east: 'K',
  west: 'Ny',
};

function DirCell({ dir, option }: { dir: Direction; option: DirectionOption | undefined }) {
  if (!option) return <div class="lc-navpad-cell lc-navpad-empty" aria-hidden="true" />;
  return (
    <button
      class="lc-navpad-btn"
      aria-label={dir}
      onClick={() => option.trigger()}
    >
      {DIR_LABELS[dir]}
    </button>
  );
}

export function NavPad({ directions }: NavPadProps) {
  const find = (d: Direction) => directions.find(opt => opt.dir === d);
  return (
    <div class="lc-navpad lc-section">
      <div class="lc-navpad-grid">
        {/* Row 1: empty, north, empty */}
        <div class="lc-navpad-cell" />
        <DirCell dir="north" option={find('north')} />
        <div class="lc-navpad-cell" />
        {/* Row 2: west, centre, east */}
        <DirCell dir="west" option={find('west')} />
        <div class="lc-navpad-cell lc-navpad-centre" />
        <DirCell dir="east" option={find('east')} />
        {/* Row 3: empty, south, empty */}
        <div class="lc-navpad-cell" />
        <DirCell dir="south" option={find('south')} />
        <div class="lc-navpad-cell" />
      </div>
    </div>
  );
}
