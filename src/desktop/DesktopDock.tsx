import { h, type JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import type { QuestSet } from '@/shared/data';
import { partitionHotkeys } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';
import { getDockCollapsed, setDockCollapsed, getPanelOpen, setPanelOpen, DB_OPEN_KEY, INVENTORY_OPEN_KEY, MARKET_OPEN_KEY } from '@/utils/config';
import { HotkeyRow } from '@/components/HotkeyRow';
import { MonsterCard } from '@/components/MonsterCard';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { hasOpenPanel } from '@/components/DockedPanel';
import { enhanceNarration } from '@/desktop/enhanceNarration';
import { useKeyboardShortcuts } from '@/desktop/useKeyboardShortcuts';
import { InventoryPanel } from '@/desktop/InventoryPanel';
import { MarketPanel } from '@/desktop/MarketPanel';
import type { HomeState } from '@/utils/homeExtract';
import type { MarketState } from '@/utils/marketExtract';

export interface DesktopDockProps {
  /** The live game document — narration enhancement and key bindings target it. */
  doc: Document;
  /** Free-move state, or null on pages where we only offer the DB button. */
  state: FreeMoveState | null;
  db: MonsterDatabase | null;
  /**
   * Home-page inventory state, when we are on it. A second optional field rather
   * than a discriminated union over the page type: with two pages the union buys
   * nothing but churn. Convert if a third page needs its own state.
   */
  homeState?: HomeState | null;
  /** Market state, when we are on the market page. */
  marketState?: MarketState | null;
  /** Name of the monster being fought, when we are on the battle screen. */
  battleMonsterName?: string | null;
  /** Force the minimal (config + database) form regardless of state. */
  dbButtonOnly?: boolean;
  /**
   * True on the dungeon page. Quest walkthroughs are only useful while
   * actually in a dungeon, so the dock offers a dedicated shortcut there
   * straight to the database's quests view — everywhere else this is false
   * and nothing about the dock changes.
   */
  inDungeon?: boolean;
  /**
   * Nonce that opens the database on the quests view when it increases.
   *
   * The pub's "quest recognised" note lives in the game's own DOM, outside
   * this Preact tree, so it cannot call `openQuests` directly. Boot bumps
   * this instead and re-renders. A counter rather than a boolean for the same
   * reason `initialTabKey` is one: pressing the note twice must re-navigate
   * even if the overlay is already showing quests. Starts at 0, which never
   * fires — only an increase does.
   */
  openQuestsSignal?: number;
  /**
   * Which quest `openQuestsSignal` should land on. Named explicitly rather
   * than left to the quest tab's remembered selection, which a caller that
   * has just written that selection cannot rely on — see DatabaseApp's
   * `initialQuest`.
   */
  openQuestTarget?: { set: QuestSet; id: string } | null;
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
export function DesktopDock({ doc, state, db, homeState = null, marketState = null, battleMonsterName = null, dbButtonOnly = false, inDungeon = false, openQuestsSignal = 0, openQuestTarget = null }: DesktopDockProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(() => getDockCollapsed());
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  // Persisted: every action reloads the game page, which would otherwise close
  // the panel the action was taken from. The database keeps its route too — see
  // DatabaseOverlay — so a reload restores the tab that was showing.
  const [dbOpen, setDbOpen] = useState(() => getPanelOpen(DB_OPEN_KEY));
  const [dbItemId, setDbItemId] = useState<number | null>(null);
  // Which button opened the overlay, when that button wants a specific
  // landing tab rather than whatever route the overlay remembers. Cleared
  // by every opener (including the plain Adatbázis button), so it never
  // leaks from one open to the next.
  //
  // `seq` is bumped on every press rather than the tab alone driving
  // navigation: DatabaseApp's landing effect depends on this value, and with
  // only the tab literal to depend on, a second press while already showing
  // 'quests' would be a no-op state update (same value in, same value out) —
  // exactly the bug where pressing the dungeon shortcut a second time after
  // navigating away inside the overlay did nothing.
  const [dbInitialTab, setDbInitialTab] = useState<{ tab: 'quests'; seq: number; quest: { set: QuestSet; id: string } | null } | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(() => getPanelOpen(INVENTORY_OPEN_KEY));
  const [marketOpen, setMarketOpen] = useState(() => getPanelOpen(MARKET_OPEN_KEY));
  const { enabled, configOpen, openConfig, closeConfig, toggleHotkey } = useHotkeyConfig();

  // No actions to offer means nothing but the DB button is useful: either the
  // page genuinely has none, or the game markup changed under us.
  const minimal = dbButtonOnly || !state || state.actions.length === 0;
  const { hotkeyActions, buttonActions } = minimal
    ? { hotkeyActions: [], buttonActions: [] }
    : partitionHotkeys(state.actions, enabled);
  const attack = minimal ? null : state.attack;

  // The monster we are fighting, once the database has arrived. Its stats and
  // drops are what the battle screen does not show.
  const battleMonster = battleMonsterName && db ? db.getByName(battleMonsterName) ?? null : null;

  // A name the database does not know is worth saying out loud: it means either a
  // gap in the data or a mismatch, and the button would just be missing.
  useEffect(() => {
    if (!db || !battleMonsterName || battleMonster) return;
    console.warn(`[Larkinor UI] Battle monster "${battleMonsterName}" is not in the database.`);
  }, [db, battleMonsterName, battleMonster]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setDockCollapsed(next);
  };

  const setDatabase = (open: boolean) => {
    setDbOpen(open);
    setPanelOpen(DB_OPEN_KEY, open);
  };

  const openDatabase = () => {
    setDbItemId(null);
    setDbInitialTab(null);
    setDatabase(true);
  };

  // The dungeon-only shortcut: open straight on the quests view, with no
  // quest id, so the overlay's own "remember the last selected quest"
  // behaviour restores whichever quest the player last had open. Bumping
  // `seq` on every press (rather than just setting the 'quests' literal)
  // is what makes a second press re-navigate even if the overlay is already
  // showing quests and was then clicked away from — see the state comment.
  // `quest` names a specific target when the caller has one (the pub's
  // quest-offer note); null keeps the dungeon button's "restore whatever was
  // last open" behaviour.
  const openQuests = (quest: { set: QuestSet; id: string } | null = null) => {
    setDbItemId(null);
    setDbInitialTab((prev) => ({ tab: 'quests', seq: (prev?.seq ?? 0) + 1, quest }));
    setDatabase(true);
  };

  // Drive `openQuests` from outside the tree — see `openQuestsSignal`. Guarded
  // on > 0 so the initial render never opens the overlay by itself.
  useEffect(() => {
    if (openQuestsSignal > 0) openQuests(openQuestTarget);
    // openQuests is recreated every render; depending on it would fire this
    // on every render instead of only when the signal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openQuestsSignal]);

  const setInventory = (open: boolean) => {
    setInventoryOpen(open);
    setPanelOpen(INVENTORY_OPEN_KEY, open);
  };

  const setMarket = (open: boolean) => {
    setMarketOpen(open);
    setPanelOpen(MARKET_OPEN_KEY, open);
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

  const modalOpen = selectedMonster !== null || configOpen || dbOpen || inventoryOpen || marketOpen;

  /**
   * Closes the topmost drawer. Panels are not handled here: DockedPanel owns
   * Escape for those and closes the innermost, which is the only place that
   * knows about a panel opened from *inside* another one (an inventory item
   * opening the database). Panels also paint above the drawers, so when one is
   * open it is the top layer and nothing here should act.
   */
  const closeTopModal = () => {
    if (hasOpenPanel()) return;
    if (configOpen) closeConfig();
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
            {battleMonster && (
              <button
                class="lc-dock-btn lc-dock-monster"
                title={`${battleMonster.name} — adatlap`}
                onClick={() => setSelectedMonster(battleMonster)}
              >
                Adatlap
              </button>
            )}
            {homeState && (
              <button class="lc-dock-btn lc-dock-inventory" onClick={() => setInventory(true)}>
                Készlet
              </button>
            )}
            {marketState && (
              <button class="lc-dock-btn lc-dock-market" onClick={() => setMarket(true)}>
                Piac
              </button>
            )}
            <button
              class="lc-dock-btn lc-dock-config"
              aria-label="Beállítások"
              title="Beállítások"
              onClick={openConfig}
            >
              ⚙
            </button>
            {inDungeon && (
              <button class="lc-dock-btn lc-dock-quests" onClick={() => openQuests(null)}>
                Küldetések
              </button>
            )}
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
        onItemClick={(id) => { setSelectedMonster(null); setDbItemId(id); setDbInitialTab(null); setDatabase(true); }}
      />

      {configOpen && (
        <ConfigDrawer
          enabled={enabled}
          variant="modal"
          onToggle={toggleHotkey}
          onClose={closeConfig}
        />
      )}

      {/* minimizable only here: docking beside the game needs desktop's spare
          width, which the mobile viewport does not have. */}
      <DatabaseOverlay
        open={dbOpen}
        minimizable
        initialItemId={dbItemId ?? undefined}
        initialTab={dbInitialTab?.tab}
        initialTabKey={dbInitialTab?.seq}
        initialQuest={dbInitialTab?.quest ?? null}
        onClose={() => setDatabase(false)}
      />

      {homeState && (
        <InventoryPanel open={inventoryOpen} state={homeState} onClose={() => setInventory(false)} />
      )}

      {marketState && (
        <MarketPanel open={marketOpen} state={marketState} onClose={() => setMarket(false)} />
      )}
    </div>
  );
}
