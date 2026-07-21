import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeState, HomeItem } from '@/utils/homeExtract';
import { CapacityMeter } from '@/components/CapacityMeter';
import { InventoryList } from '@/components/InventoryList';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';

export interface HomeProps {
  state: HomeState;
}

type Tab = 'haz' | 'bag' | 'gen';

export function Home({ state }: HomeProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('haz');
  const [dbOpen, setDbOpen] = useState(false);
  const [dbName, setDbName] = useState<string | undefined>(undefined);

  const openDetail = (it: HomeItem): void => { setDbName(it.name); setDbOpen(true); };
  const active = tab === 'bag' ? state.backpack : state.house;

  return (
    <div class="lc-page">
      <div class="lc-home-tabs">
        <button class={`lc-home-tab${tab === 'haz' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('haz')}>
          Otthon <span class="lc-home-count">{state.house.items.length}</span>
        </button>
        <button class={`lc-home-tab${tab === 'bag' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('bag')}>
          Hátizsák <span class="lc-home-count">{state.backpack.items.length}</span>
        </button>
        <button class={`lc-home-tab${tab === 'gen' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('gen')}>
          Általános
        </button>
      </div>

      {tab !== 'gen' && (
        <CapacityMeter
          label={tab === 'bag' ? 'Hátizsák & test' : 'Ház telítettsége'}
          icon={tab === 'bag' ? '🎒' : '⌂'}
          used={active.used}
          max={active.max}
        />
      )}

      {tab === 'haz' && (
        <InventoryList
          items={state.house.items}
          moveGlyph="🎒"
          moveTitle="Hátizsákba"
          onMove={(it, qty) => state.house.move(it, qty)}
          onOpenDetail={openDetail}
        />
      )}

      {tab === 'bag' && (
        <InventoryList
          items={state.backpack.items}
          moveGlyph="⌂"
          moveTitle="Házba"
          onMove={(it, qty) => state.backpack.move(it, qty)}
          onOpenDetail={openDetail}
        />
      )}

      {tab === 'gen' && (
        <div class="lc-home-general">
          <CapacityMeter label="Ház" icon="⌂" used={state.house.used} max={state.house.max} />
          <CapacityMeter label="Hátizsák & test" icon="🎒" used={state.backpack.used} max={state.backpack.max} />

          <div class="lc-home-actions">
            {state.actions.everythingToBackpack && (
              <button class="lc-home-act lc-home-act--wide" onClick={() => state.actions.everythingToBackpack!.trigger()}>
                Mindent a hátizsákba
              </button>
            )}
            {state.actions.magicChair && (
              <button class="lc-home-act" onClick={() => state.actions.magicChair!.trigger()}>Varázsszék</button>
            )}
            {state.actions.recoverLost && (
              <button class="lc-home-act" onClick={() => state.actions.recoverLost!.trigger()}>Elveszett tárgyak</button>
            )}
            {state.actions.settings && (
              <button class="lc-home-act" onClick={() => state.actions.settings!.trigger()}>Beállítások</button>
            )}
            {state.actions.exit && (
              <button class="lc-home-act lc-home-act--wide" onClick={() => state.actions.exit!.trigger()}>
                Kilépés az épületből
              </button>
            )}
          </div>

          {state.traps.map((trap, i) => (
            <div key={i} class="lc-home-trap">
              <span>{trap.label}</span>
              {trap.strength != null && <span class="lc-home-trap-str">erősség: {trap.strength}</span>}
              <button class="lc-inv-move-btn" onClick={() => trap.leszerel()}>Leszerel</button>
            </div>
          ))}
        </div>
      )}

      <DatabaseOverlay open={dbOpen} initialItemName={dbName} onClose={() => setDbOpen(false)} />
    </div>
  );
}
