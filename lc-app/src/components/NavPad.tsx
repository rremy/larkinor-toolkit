import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import type { Direction, DirectionOption, BuildingOption } from '@/utils/domExtract';

export interface NavPadProps {
  directions: DirectionOption[];
  /** Monster-engage action, rendered icon-only in the centre of the D-pad. */
  attack?: BuildingOption | null;
  /** Icon floated in the top-left corner of the section (e.g. settings). */
  cornerLeft?: BuildingOption | null;
  /** Icon floated in the top-right corner of the section (e.g. rest). */
  cornerRight?: BuildingOption | null;
  /** Extra content rendered below the D-pad, inside the section (e.g. hotkeys). */
  children?: ComponentChildren;
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

function CornerButton({ side, option }: { side: 'left' | 'right'; option: BuildingOption }) {
  return (
    <button
      class={`lc-navpad-corner lc-navpad-corner--${side}`}
      title={option.label}
      aria-label={option.label}
      onClick={() => option.trigger()}
    >
      <img class="lc-navpad-corner-icon" src={option.iconUrl} alt="" />
    </button>
  );
}

export function NavPad({ directions, attack, cornerLeft, cornerRight, children }: NavPadProps) {
  const find = (d: Direction) => directions.find(opt => opt.dir === d);
  return (
    <div class="lc-navpad lc-section">
      {cornerLeft && <CornerButton side="left" option={cornerLeft} />}
      {cornerRight && <CornerButton side="right" option={cornerRight} />}
      <div class="lc-navpad-grid">
        {/* Row 1: empty, north, empty */}
        <div class="lc-navpad-cell" />
        <DirCell dir="north" option={find('north')} />
        <div class="lc-navpad-cell" />
        {/* Row 2: west, centre (attack when in an encounter), east */}
        <DirCell dir="west" option={find('west')} />
        {attack ? (
          <button class="lc-navpad-attack" aria-label={attack.label} onClick={() => attack.trigger()}>
            <img class="lc-navpad-attack-icon" src={attack.iconUrl} alt="" />
          </button>
        ) : (
          <div class="lc-navpad-cell lc-navpad-centre" />
        )}
        <DirCell dir="east" option={find('east')} />
        {/* Row 3: empty, south, empty */}
        <div class="lc-navpad-cell" />
        <DirCell dir="south" option={find('south')} />
        <div class="lc-navpad-cell" />
      </div>
      {children}
    </div>
  );
}
