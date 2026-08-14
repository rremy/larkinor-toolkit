import { h, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DataLoader, LockType, MonsterDatabase, Quest, QuestCell, QuestSet } from '@/shared/data';
import { buildMonsterDatabase } from '@/shared/data';
import { LEGACY_QUEST_SELECTED_PREF_KEY, QUEST_SET_PREF_KEY, QUEST_TILE_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import type { PrefStore } from '../DatabaseApp';
import { QuestGrid } from './QuestGrid';
import { QuestKeyLegend } from './QuestKeyLegend';
import { QuestCellDetail } from './QuestCellDetail';
import { DEFAULT_TILE, SZEL_LABEL, TILE_SIZES, hasSzelEdges, locksIn } from './questMeta';

interface QuestViewProps {
  loader: DataLoader;
  /** Routed quest set (`#quests/<set>/…`); null falls back to the stored set. */
  questSet: QuestSet | null;
  /** Routed quest id; null falls back to the stored selection for the set. */
  questId: string | null;
  /**
   * Optional persistence for the zoom (`tileSize`) and the set/selection, so
   * they survive the reload the game performs on every action. Absent in
   * tests and wherever the host doesn't wire one up — everything then just
   * resets to its default on every remount, exactly as it did before this
   * store existed.
   */
  prefStore?: PrefStore;
  onSelectQuest(set: QuestSet, id: string | null): void;
  onJumpToMonster(id: number): void;
}

const SET_LABELS: Record<QuestSet, string> = { royal: 'Királyi', tavern: 'Kocsmai' };
const SETS: QuestSet[] = ['royal', 'tavern'];

function isQuestSet(value: string | null): value is QuestSet {
  return value === 'royal' || value === 'tavern';
}

/**
 * Parse a stored zoom back into a valid tile size. Anything not in
 * `TILE_SIZES` — missing, corrupt, or a size this build no longer offers —
 * degrades to the default rather than being applied, so a stale value can
 * never hand the grid an unusable size.
 */
function parseTileSize(raw: string | null): number {
  const n = raw != null ? Number(raw) : NaN;
  return TILE_SIZES.includes(n) ? n : DEFAULT_TILE;
}

export function QuestView(props: QuestViewProps): VNode {
  const { loader, questSet, questId, prefStore, onSelectQuest, onJumpToMonster } = props;
  // The active set falls back to the stored one, then to royal. Read once at
  // mount: later navigation supplies `questSet` explicitly.
  const [fallbackSet] = useState<QuestSet>(() => {
    const stored = prefStore?.read(QUEST_SET_PREF_KEY) ?? null;
    return isQuestSet(stored) ? stored : 'royal';
  });
  const activeSet = questSet ?? fallbackSet;

  const [bySet, setBySet] = useState<Partial<Record<QuestSet, Quest[]>>>({});
  const quests = bySet[activeSet] ?? null;
  // Set by a failed `changeSet` click; cleared on the next attempt. The
  // switcher is the only feedback surface for this failure — `changeSet`'s
  // own rejection would otherwise be an unhandled promise rejection and the
  // button would appear to silently do nothing.
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [monsters, setMonsters] = useState<MonsterDatabase>(() => buildMonsterDatabase([]));
  const [selectedCell, setSelectedCell] = useState<QuestCell | null>(null);
  const [highlightLock, setHighlightLock] = useState<LockType | null>(null);
  const [tileSize, setTileSize] = useState(() => parseTileSize(prefStore?.read(QUEST_TILE_PREF_KEY) ?? null));
  // Guards the restore-from-store effect below so it fires at most once per
  // active set, regardless of how many times its other dependencies change.
  const restoredQuestRef = useRef(false);
  /**
   * Monotonically bumped whenever the routed `questSet`/`questId` actually
   * change (an external navigation landing — whether the resolution of a
   * previous `changeSet` call, a direct chip click, or a deep link) *and*
   * once synchronously at the start of every `changeSet` call. `changeSet`
   * captures the value before its (possibly async) work and compares it
   * afterwards: if it moved on, some other navigation already won this race
   * and applying this one now would silently yank the user away from
   * wherever they've since gone. See `changeSet` and `fetchSet` below.
   */
  const navGenerationRef = useRef(0);
  useEffect(() => { navGenerationRef.current += 1; }, [questSet, questId]);
  /**
   * In-flight fetch per set, shared between the effect below and `changeSet`,
   * so concurrent callers requesting the same uncached set — two rapid clicks
   * on the same switcher button, or a click racing this effect — share one
   * fetch instead of issuing two ~1.2–1.5MB requests.
   */
  const inFlightRef = useRef<Partial<Record<QuestSet, Promise<Quest[]>>>>({});

  function changeTileSize(next: number) {
    setTileSize(next);
    prefStore?.write(QUEST_TILE_PREF_KEY, String(next));
  }

  function fetchSet(set: QuestSet): Promise<Quest[]> {
    const pending = inFlightRef.current[set];
    if (pending) return pending;
    const promise = set === 'tavern' ? loader.loadTavernQuests() : loader.loadQuests();
    inFlightRef.current[set] = promise;
    // Once settled this promise is no longer "in flight" — later callers
    // should ask the loader again rather than reuse a result nobody kept
    // (e.g. one discarded below because its switch was superseded).
    // `.finally()` returns its own derived promise that rejects right along
    // with `promise` — nothing here awaits or returns it, so a rejection
    // must still be caught on this fork specifically, independent of
    // whatever handling the caller of `fetchSet` attaches to `promise`
    // itself, or it surfaces as an unhandled rejection regardless.
    promise.finally(() => {
      if (inFlightRef.current[set] === promise) delete inFlightRef.current[set];
    }).catch(() => {});
    return promise;
  }

  // Fetch each set at most once, on demand — the royal and tavern data files
  // are ~1.5MB and ~1.2MB, so loading both up front would double the tab's
  // cost for no benefit when the user never switches sets.
  useEffect(() => {
    let cancelled = false;
    if (bySet[activeSet]) return;
    fetchSet(activeSet).then((q) => {
      if (!cancelled) setBySet((prev) => ({ ...prev, [activeSet]: q }));
    }).catch(() => {
      // Leaves `bySet[activeSet]` unset, so the view stays on the
      // "Betöltés…" state — but the switcher (rendered even there, see
      // `questSetSwitcher` below) still lets the user reach the other set
      // instead of an unhandled rejection wedging this one silently.
      if (!cancelled) setSwitchError(`Nem sikerült betölteni: ${SET_LABELS[activeSet]}`);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, activeSet, bySet]);

  useEffect(() => {
    let cancelled = false;
    loader.loadMonsters().then((m) => { if (!cancelled) setMonsters(m); });
    return () => { cancelled = true; };
  }, [loader]);

  // A different quest means the previous cell selection is meaningless.
  useEffect(() => { setSelectedCell(null); setHighlightLock(null); }, [questId]);

  // Computed unconditionally (not after the early returns below) so it can be
  // used as a dependency of the hooks that follow — hooks must run in the same
  // order on every render.
  const quest = quests ? (quests.find((q) => q.id === questId) ?? quests[0] ?? null) : null;
  const selectedQuestId = quest?.id ?? null;

  /**
   * Restore the stored set and selection when navigation cleared them —
   * switching tabs, or a bare `#quests` route. The set is restored first and
   * the selection looked up *within it*, so a stale id falls back to the first
   * quest of the set the user was in rather than to royal quest 1.
   */
  useEffect(() => {
    if (restoredQuestRef.current) return;
    if (questId != null || !quests || !prefStore) return;
    restoredQuestRef.current = true;
    const stored = prefStore.read(questSelectedKey(activeSet))
      // One-time seed: the pre-switcher key held a royal quest number.
      ?? (activeSet === 'royal' ? prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY) : null);
    const target = stored && quests.some((q) => q.id === stored) ? stored : quests[0]?.id;
    if (target) onSelectQuest(activeSet, target);
  }, [questId, quests, prefStore, activeSet, onSelectQuest]);

  // The restore guard above must reset when the set changes, so switching
  // sets can restore within the new set rather than staying latched from the
  // previous one. This cannot loop: it only flips the ref back to false when
  // `activeSet` itself changes, and the restore effect it guards only ever
  // calls `onSelectQuest` while `questId` is still null — once that call's
  // resulting navigation supplies a non-null `questId`, the restore effect's
  // own guard clause stops it regardless of this ref's value.
  useEffect(() => { restoredQuestRef.current = false; }, [activeSet]);

  /** Remember whichever set and quest end up shown. */
  useEffect(() => {
    if (selectedQuestId == null || !prefStore) return;
    prefStore.write(QUEST_SET_PREF_KEY, activeSet);
    prefStore.write(questSelectedKey(activeSet), selectedQuestId);
  }, [selectedQuestId, activeSet, prefStore]);

  /**
   * Switch the active set. Hands the parent a concrete quest id so the route
   * stays complete on the very first navigation, rather than a null id that
   * relies on the restore effect above to fill in later — that effect only
   * fires while the routed `questId` is null, which a deep link into a
   * specific quest (e.g. this same component reused with an explicit
   * `questId`) would never be. If the target set's data was already fetched
   * (or the user has visited it before, so `prefStore` remembers a
   * selection), this resolves synchronously; otherwise it fetches on demand
   * via `fetchSet` — the whole point of not preloading both ~1.5MB/~1.2MB
   * sets up front — and caches the result in `bySet` once fetched, so a
   * repeat switch (even one racing this one) never re-fetches.
   *
   * The `navGenerationRef` claim/check below guards a slow fetch here from
   * clobbering a navigation the user has since moved on to: claiming a
   * generation at the start marks *this* call the current authority, and any
   * later claim — another `changeSet` call, or the routed props actually
   * changing (a direct chip click's `onSelectQuest`, or a deep link) —
   * invalidates it. A superseded call makes neither the `setBySet` nor the
   * `onSelectQuest` call below; its fetched data (if any) is simply dropped,
   * not cached, so a later switch to the same set fetches fresh rather than
   * risking stale-looking reuse of a result nobody ever displayed.
   *
   * The generation is claimed *before* the same-set early return below, on
   * purpose: clicking back to the set already showing must still invalidate
   * whatever switch-away is in flight, or that slow fetch resolves after this
   * call returns and still navigates the user to the set they just clicked
   * away from. Swapping the two lines would silently reintroduce that race.
   */
  async function changeSet(next: QuestSet) {
    const generation = ++navGenerationRef.current;
    if (next === activeSet) return;
    let list = bySet[next];
    if (!list) {
      list = await fetchSet(next);
      if (navGenerationRef.current !== generation) return;
      setBySet((prev) => ({ ...prev, [next]: list as Quest[] }));
    }
    if (navGenerationRef.current !== generation) return;
    const stored = prefStore?.read(questSelectedKey(next)) ?? null;
    const target = (stored && list.some((q) => q.id === stored) ? stored : list[0]?.id) ?? null;
    onSelectQuest(next, target);
  }

  /**
   * `onClick` handler for a switcher button. `changeSet` is `async` and its
   * rejection (a failed `fetchSet`) would otherwise be an unhandled promise
   * rejection with no visible effect — the button would appear to silently
   * do nothing. Catching it here and setting `switchError` surfaces the
   * failure instead.
   */
  function handleSetClick(next: QuestSet) {
    setSwitchError(null);
    changeSet(next).catch(() => {
      setSwitchError(`Nem sikerült betölteni: ${SET_LABELS[next]}`);
    });
  }

  /**
   * Rendered above both the loading and empty early returns below, and
   * unconditionally in the main render, so it is always reachable — a user
   * whose stored set fails to load (or resolves empty) still has a way back
   * to the other set from inside this view, rather than being wedged on a
   * dead "Betöltés…"/"Nincs küldetés." screen. This matters more in-game,
   * where the overlay remounts on every action and would otherwise re-derive
   * the same stuck set on every reopen.
   */
  const questSetSwitcher = (
    <div class="quest-sets" role="group" aria-label="Küldetés típus">
      {SETS.map((s) => (
        <button
          key={s}
          type="button"
          class={`quest-set-btn${s === activeSet ? ' active' : ''}`}
          aria-pressed={s === activeSet}
          onClick={() => handleSetClick(s)}
        >
          {SET_LABELS[s]}
        </button>
      ))}
      {switchError && <p class="quest-set-error" role="alert">{switchError}</p>}
    </div>
  );

  if (!quests) {
    return <div class="quest-view">{questSetSwitcher}<div class="quest-stats">Betöltés…</div></div>;
  }
  if (!quest) {
    return <div class="quest-view">{questSetSwitcher}<div class="quest-stats">Nincs küldetés.</div></div>;
  }

  const monsterCount = quest.cells.filter((c) => c.monsterId != null).length;
  const keyCount = quest.cells.filter((c) => c.key).length;
  // hasQuestion (image-derived), not question !== null (parse success) — see
  // QuestCell.hasQuestion; otherwise this stat undercounts exactly like the
  // marker did before task 18.
  const questionCount = quest.cells.filter((c) => c.hasQuestion).length;
  const trapCount = quest.cells.filter((c) => c.trap).length;
  const lockCount = locksIn(quest).length;

  return (
    <div class="quest-view">
      {questSetSwitcher}

      <div class="quest-strip" role="group" aria-label="Küldetés választó">
        {quests.map((q) => (
          <button
            key={q.id}
            type="button"
            class={`quest-chip${q.id === quest.id ? ' active' : ''}`}
            title={q.description}
            aria-pressed={q.id === quest.id}
            onClick={() => onSelectQuest(quest.set, q.id)}
          >
            {q.title}
          </button>
        ))}
      </div>

      <div class="quest-layout">
        <div class="quest-main">
          <div class="quest-header">
            <h2>{quest.set === 'royal' ? `${quest.title}. küldetés` : quest.title}</h2>
            <p class="quest-description">{quest.description}</p>
            <p class="quest-reward"><strong>Jutalom:</strong> {quest.reward}</p>
            <div class="quest-stats">
              {quest.rows}×{quest.cols} · {monsterCount} szörny · {keyCount} kulcs ·{' '}
              {lockCount} zártípus · {questionCount} kérdés · {trapCount} csapda
            </div>
            <div class="field quest-zoom">
              <label for="quest-zoom-select">Méret</label>
              <select
                id="quest-zoom-select"
                value={String(tileSize)}
                onChange={(e) => changeTileSize(Number((e.target as HTMLSelectElement).value))}
              >
                {TILE_SIZES.map((s) => <option key={s} value={String(s)}>{s}px</option>)}
              </select>
            </div>
          </div>

          <div class="quest-grid-wrap">
            <QuestGrid
              quest={quest}
              monsters={monsters}
              selected={selectedCell}
              onSelect={setSelectedCell}
              highlightLock={highlightLock}
              onProbeLock={setHighlightLock}
              tileSize={tileSize}
            />
          </div>
          {hasSzelEdges(quest) && (
            <p class="quest-szel-note">
              <span class="quest-lock-swatch szel" /> {SZEL_LABEL} — a rács szélét
              vagy egy kitöltő üres mezőt jelöl, sosem valódi termet; nem
              játékbeli akadály.
            </p>
          )}
        </div>

        <div class="quest-side">
          <QuestCellDetail cell={selectedCell} monsters={monsters} onJumpToMonster={onJumpToMonster} />
          <QuestKeyLegend
            quest={quest}
            monsters={monsters}
            activeLock={highlightLock}
            onHoverLock={setHighlightLock}
            onSelectCell={setSelectedCell}
          />
        </div>
      </div>
    </div>
  );
}
