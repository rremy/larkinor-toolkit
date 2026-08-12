import { h, type JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import { partitionHotkeys } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';
import { getDockCollapsed, setDockCollapsed } from '@/utils/config';
import { HotkeyRow } from '@/components/HotkeyRow';
import { MonsterCard } from '@/components/MonsterCard';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { enhanceNarration } from '@/desktop/enhanceNarration';
import { useKeyboardShortcuts } from '@/desktop/useKeyboardShortcuts';

export interface DesktopDockProps {
  /** The live game document — narration enhancement and key bindings target it. */
  doc: Document;
  /** Free-move state, or null on pages where we only offer the DB button. */
  state: FreeMoveState | null;
  db: MonsterDatabase | null;
  /** Force the minimal (config + database) form regardless of state. */
  dbButtonOnly?: boolean;
}

/**
 * Fixed, collapsible companion bar for desktop. Unlike the mobile pages this
 * adds to the game UI rather than replacing it, so it renders only the
 * affordances the desktop page lacks: one-click quick actions (the game needs a
 * select plus a separate submit for each) and the config/database entry points.
 *
 * Deliberately absent: stats, navigation, and the encounter attack button. The
 * page already presents all three as single clicks, so repeating them here would
 * be duplication rather than help. `attack` is still consumed — by the keyboard
 * shortcuts, where Space is an affordance the page genuinely lacks.
 *
 * It also owns every desktop modal, because the narration links added by
 * enhanceNarration and the keyboard shortcuts both open them.
 */
export function DesktopDock({ doc, state, db, dbButtonOnly = false }: DesktopDockProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(() => getDockCollapsed());
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [dbOpen, setDbOpen] = useState(false);
  const [dbItemId, setDbItemId] = useState<number | null>(null);
  const { enabled, configOpen, openConfig, closeConfig, toggleHotkey } = useHotkeyConfig();

  // No actions to offer means nothing but the DB button is useful: either the
  // page genuinely has none, or the game markup changed under us.
  const minimal = dbButtonOnly || !state || state.actions.length === 0;
  const { hotkeyActions, buttonActions } = minimal
    ? { hotkeyActions: [], buttonActions: [] }
    : partitionHotkeys(state.actions, enabled);
  const attack = minimal ? null : state.attack;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setDockCollapsed(next);
  };

  const openDatabase = () => {
    setDbItemId(null);
    setDbOpen(true);
  };

  // The narration lives in the game's own DOM, so this is a side effect on an
  // external document rather than something Preact renders. enhanceNarration is
  // idempotent (data-lc-enhanced), so re-running on a db change is harmless.
  // A failure here must cost only the links, never the game page.
  useEffect(() => {
    if (!db) return;
    try {
      enhanceNarration(doc, db, setSelectedMonster);
    } catch (err) {
      console.warn('[Larkinor UI] Narration enhancement failed:', err);
    }
  }, [doc, db]);

  const modalOpen = selectedMonster !== null || configOpen || dbOpen;

  /** Closes the topmost modal — database over config over the monster card. */
  const closeTopModal = () => {
    if (dbOpen) setDbOpen(false);
    else if (configOpen) closeConfig();
    else if (selectedMonster) setSelectedMonster(null);
  };

  // `directions`/`hotkeyActions` (fresh arrays each render) and the two
  // handlers below are intentionally left unmemoized. useKeyboardShortcuts
  // re-subscribes its listener whenever any of these change, so this does
  // cause listener churn on every render — but memoizing them (e.g. with
  // useCallback closing over `dbOpen`/`configOpen`/`selectedMonster`) would
  // reintroduce the exact stale-closure bug this dependency list avoids:
  // closeTopModal and onOpenDatabase must always see the current modal state.
  useKeyboardShortcuts({
    doc,
    directions: state?.directions ?? [],
    attack,
    hotkeyActions,
    modalOpen,
    onOpenDatabase: openDatabase,
    onCloseModal: closeTopModal,
  });

  return (
    <div class={`lc-dock${collapsed ? ' lc-dock--collapsed' : ''}`}>
      <button
        class="lc-dock-toggle"
        aria-label={collapsed ? 'Panel kinyitása' : 'Panel becsukása'}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
      >
        {collapsed ? '⌃' : '⌄'}
      </button>

      {!collapsed && (
        <>
          {hotkeyActions.length > 0 && (
            <div class="lc-dock-row">
              <HotkeyRow actions={hotkeyActions} />
            </div>
          )}

          {buttonActions.length > 0 && (
            <div class="lc-dock-row lc-dock-row--wrap">
              {buttonActions.map((action, i) => (
                <button key={`act${i}`} class="lc-dock-btn" onClick={() => action.trigger()}>
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* No attack button: the game page already offers the encounter
              attack as a single click, so duplicating it in the dock adds
              nothing. `attack` is still threaded to the keyboard shortcuts,
              where Space *is* an affordance the page lacks. */}

          <div class="lc-dock-row">
            <button
              class="lc-dock-btn lc-dock-config"
              aria-label="Beállítások"
              title="Beállítások"
              onClick={openConfig}
            >
              ⚙
            </button>
            <button class="lc-dock-btn lc-dock-db" onClick={openDatabase}>
              Adatbázis
            </button>
          </div>
        </>
      )}

      <MonsterCard
        monster={selectedMonster}
        variant="modal"
        onClose={() => setSelectedMonster(null)}
        onItemClick={(id) => { setSelectedMonster(null); setDbItemId(id); setDbOpen(true); }}
      />

      {configOpen && (
        <ConfigDrawer
          enabled={enabled}
          variant="modal"
          onToggle={toggleHotkey}
          onClose={closeConfig}
        />
      )}

      <DatabaseOverlay open={dbOpen} initialItemId={dbItemId ?? undefined} onClose={() => setDbOpen(false)} />
    </div>
  );
}
