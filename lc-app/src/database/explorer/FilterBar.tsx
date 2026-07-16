import { h, type VNode } from 'preact';
import type { FilterDef, FilterState } from './filters';

interface FiltersProps {
  defs: FilterDef[];
  state: FilterState;
  onChange: (next: FilterState) => void;
}

export function Filters(props: FiltersProps): VNode {
  const { defs, state, onChange } = props;

  const set = (key: string, value: string) => {
    const next = { ...state };
    if (value === '') delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <div class="filters">
      {defs.map((f) => {
        if (f.type === 'search') {
          return (
            <div class="field search" key={f.key}>
              <label>{f.label}</label>
              <input
                type="text"
                placeholder="kezdj el írni…"
                value={state[f.key] ?? ''}
                onInput={(e) => set(f.key, (e.target as HTMLInputElement).value)}
              />
            </div>
          );
        }
        if (f.type === 'range') {
          return (
            <div class="field range" key={f.key}>
              <label>{f.label}</label>
              <input
                type="number"
                placeholder="min"
                value={state[`${f.key}_min`] ?? ''}
                onInput={(e) => set(`${f.key}_min`, (e.target as HTMLInputElement).value)}
              />
              <input
                type="number"
                placeholder="max"
                value={state[`${f.key}_max`] ?? ''}
                onInput={(e) => set(`${f.key}_max`, (e.target as HTMLInputElement).value)}
              />
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <div class="field" key={f.key}>
              <label>{f.label}</label>
              <select
                value={state[f.key] ?? ''}
                onChange={(e) => set(f.key, (e.target as HTMLSelectElement).value)}
              >
                {(f.options ?? []).map((opt) => (
                  <option value={opt} key={opt}>{opt === '' ? '— bármi —' : opt}</option>
                ))}
              </select>
            </div>
          );
        }
        // tri
        return (
          <div class="field" key={f.key}>
            <label>{f.label}</label>
            <select
              value={state[f.key] ?? ''}
              onChange={(e) => set(f.key, (e.target as HTMLSelectElement).value)}
            >
              <option value="">— bármi —</option>
              <option value="yes">Igen</option>
              <option value="no">Nem</option>
            </select>
          </div>
        );
      })}
      <button type="button" class="clear" onClick={() => onChange({})}>Szűrők törlése</button>
    </div>
  );
}
