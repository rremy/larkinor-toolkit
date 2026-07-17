import { h, type VNode } from 'preact';
import { DISTRICT_SWATCHES, POI_LEGEND } from './mapMeta';

interface LegendProps {
  /** Currently active POI filter (`data-poi` value), or null when none. */
  activeFilter: string | null;
  /** Toggle the filter for a POI key. */
  onToggleFilter: (poi: string) => void;
}

/**
 * Map legend: a static district colour key plus a clickable POI list that
 * filters/highlights matching cells. Ported from the `aside.legend` block in
 * explorer.html:237-269 (`bindFilters`/`applyFilter`).
 */
export function Legend(props: LegendProps): VNode {
  const { activeFilter, onToggleFilter } = props;
  return (
    <aside class="legend">
      <h2>Negyedek</h2>
      <ul>
        {DISTRICT_SWATCHES.map((d) => (
          <li key={d.cls}>
            <span class={`swatch ${d.cls}`} />
            {d.label}
          </li>
        ))}
      </ul>
      <h2>POI ikonok</h2>
      <ul>
        {POI_LEGEND.map((p) => (
          <li
            key={p.poi}
            class={`filterable${p.poi === activeFilter ? ' active' : ''}`}
            onClick={() => onToggleFilter(p.poi)}
          >
            <span class={`poi${p.clan ? ' clan' : ''}`}>{p.emoji}</span>
            {p.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
