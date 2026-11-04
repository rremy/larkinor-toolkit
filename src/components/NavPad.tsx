import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import type { Direction, DirectionOption, BuildingOption } from '@/utils/domExtract';
import { HINT_ICON, type Compass, type DirectionHint } from '@/utils/directionHints';

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
  /**
   * What the narration says lies in a direction (see directionHints.ts): a
   * diagonal is drawn in the corner cell between its arrows, a cardinal as a
   * badge on its arrow.
   */
  hints?: DirectionHint[];
}

const DIR_LABELS: Record<Direction, string> = {
  north: 'É',
  south: 'D',
  east: 'K',
  west: 'Ny',
};

const COMPASS_OF: Record<Direction, Compass> = { north: 'N', south: 'S', east: 'E', west: 'W' };

/** One hint's icon, titled with what is there. */
function HintGlyph({ hint }: { hint: DirectionHint }) {
  const icon = HINT_ICON[hint.kind];
  const cls = `lc-dir-hint lc-dir-hint--${hint.kind}`;
  return 'image' in icon
    ? <img class={cls} src={icon.image} alt={hint.label} title={hint.label} />
    : <span class={cls} title={hint.label}>{icon.emoji}</span>;
}

/** The icons for the hints pointing one way, each titled with what is there. */
function HintIcons({ hints }: { hints: DirectionHint[] }) {
  return (
    <span class="lc-dir-hints">
      {hints.map((hint, i) => (
        <HintGlyph key={i} hint={hint} />
      ))}
    </span>
  );
}

function DirCell({ dir, option, hints }: { dir: Direction; option: DirectionOption | undefined; hints: DirectionHint[] }) {
  const icons = hints.length > 0 && <HintIcons hints={hints} />;
  if (!option) {
    // A closed side still says what lies beyond it.
    return <div class="lc-navpad-cell lc-navpad-empty" aria-hidden={hints.length === 0}>{icons}</div>;
  }
  return (
    <button
      class="lc-navpad-btn"
      aria-label={dir}
      onClick={() => option.trigger()}
    >
      {DIR_LABELS[dir]}
      {icons}
    </button>
  );
}

/** A corner of the grid: empty, or the hints pointing that diagonal. */
function CornerCell({ hints }: { hints: DirectionHint[] }) {
  return <div class="lc-navpad-cell lc-navpad-diagonal">{hints.length > 0 && <HintIcons hints={hints} />}</div>;
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

export function NavPad({ directions, attack, cornerLeft, cornerRight, children, hints = [] }: NavPadProps) {
  const find = (d: Direction) => directions.find(opt => opt.dir === d);
  const toward = (dir: Compass) => hints.filter((hint) => hint.dir === dir);
  const dirCell = (dir: Direction) => <DirCell dir={dir} option={find(dir)} hints={toward(COMPASS_OF[dir])} />;
  return (
    <div class="lc-navpad lc-section">
      {cornerLeft && <CornerButton side="left" option={cornerLeft} />}
      {cornerRight && <CornerButton side="right" option={cornerRight} />}
      <div class="lc-navpad-grid">
        {/* Row 1: north-west, north, north-east */}
        <CornerCell hints={toward('NW')} />
        {dirCell('north')}
        <CornerCell hints={toward('NE')} />
        {/* Row 2: west, centre (attack when in an encounter), east */}
        {dirCell('west')}
        {attack ? (
          <button class="lc-navpad-attack" aria-label={attack.label} onClick={() => attack.trigger()}>
            <img class="lc-navpad-attack-icon" src={attack.iconUrl} alt="" />
          </button>
        ) : (
          <div class="lc-navpad-cell lc-navpad-centre" />
        )}
        {dirCell('east')}
        {/* Row 3: south-west, south, south-east */}
        <CornerCell hints={toward('SW')} />
        {dirCell('south')}
        <CornerCell hints={toward('SE')} />
      </div>
      {children}
    </div>
  );
}
