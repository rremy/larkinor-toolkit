import { h, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DataLoader, LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { buildMonsterDatabase } from '@/shared/data';
import { LEGACY_QUEST_SELECTED_PREF_KEY, QUEST_TILE_PREF_KEY } from '@/shared/prefKeys';
import type { PrefStore } from '../DatabaseApp';
import { QuestGrid } from './QuestGrid';
import { QuestKeyLegend } from './QuestKeyLegend';
import { QuestCellDetail } from './QuestCellDetail';
import { DEFAULT_TILE, SZEL_LABEL, TILE_SIZES, hasSzelEdges, locksIn } from './questMeta';

interface QuestViewProps {
  loader: DataLoader;
  /** Routed quest id (`#quests/<id>`); null falls back to the first quest. */
  questId: string | null;
  /**
   * Optional persistence for the zoom (`tileSize`), so it survives the reload
   * the game performs on every action. Absent in tests and wherever the host
   * doesn't wire one up — the zoom then just resets to `DEFAULT_TILE` on
   * every remount, exactly as it did before this store existed.
   */
  prefStore?: PrefStore;
  onSelectQuest(id: string): void;
  onJumpToMonster(id: number): void;
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
  const { loader, questId, prefStore, onSelectQuest, onJumpToMonster } = props;
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [monsters, setMonsters] = useState<MonsterDatabase>(() => buildMonsterDatabase([]));
  const [selectedCell, setSelectedCell] = useState<QuestCell | null>(null);
  const [highlightLock, setHighlightLock] = useState<LockType | null>(null);
  const [tileSize, setTileSize] = useState(() => parseTileSize(prefStore?.read(QUEST_TILE_PREF_KEY) ?? null));
  // Guards the restore-from-store effect below so it fires at most once per
  // mount, regardless of how many times its dependencies otherwise change.
  const restoredQuestRef = useRef(false);

  function changeTileSize(next: number) {
    setTileSize(next);
    prefStore?.write(QUEST_TILE_PREF_KEY, String(next));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([loader.loadQuests(), loader.loadMonsters()]).then(([q, m]) => {
      if (cancelled) return;
      setQuests(q);
      setMonsters(m);
    });
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
   * Restore the last-selected quest when navigation cleared the id — switching
   * tabs and back, or a bare `#quests` route, both hand this component a null
   * `questId` (see task 19). Without this, that null would fall back to
   * `quests[0]` every time, silently discarding whatever the user was looking
   * at. Runs once quest data is loaded and only while `questId` is still null;
   * `restoredQuestRef` additionally ensures it can never fire a second time —
   * `onSelectQuest` triggers a route change that re-renders this component
   * with a new (non-null) `questId`, but guarding on that alone would still
   * leave a window for an unrelated parent re-render (a fresh `onSelectQuest`
   * closure, same null `questId`) to call it again.
   */
  useEffect(() => {
    if (restoredQuestRef.current) return;
    if (questId != null || !quests || !prefStore) return;
    restoredQuestRef.current = true;
    const storedId = prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY);
    if (storedId && quests.some((q) => q.id === storedId)) {
      onSelectQuest(storedId);
    }
  }, [questId, quests, prefStore, onSelectQuest]);

  /**
   * Remember whichever quest ends up shown — including the default landed on
   * when nothing was stored yet, or an explicit deep link — so the next
   * null-`questId` visit restores it. An explicit route always wins over the
   * store (the effect above never fires while `questId` is non-null), and
   * this write is what lets that explicit selection overwrite a stale stored
   * one rather than the store silently outliving it.
   */
  useEffect(() => {
    if (selectedQuestId == null || !prefStore) return;
    prefStore.write(LEGACY_QUEST_SELECTED_PREF_KEY, selectedQuestId);
  }, [selectedQuestId, prefStore]);

  if (!quests) {
    return <div class="quest-view"><div class="quest-stats">Betöltés…</div></div>;
  }
  if (!quest) {
    return <div class="quest-view"><div class="quest-stats">Nincs küldetés.</div></div>;
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
      <div class="quest-strip" role="group" aria-label="Küldetés választó">
        {quests.map((q) => (
          <button
            key={q.id}
            type="button"
            class={`quest-chip${q.id === quest.id ? ' active' : ''}`}
            title={q.description}
            aria-pressed={q.id === quest.id}
            onClick={() => onSelectQuest(q.id)}
          >
            {q.id}
          </button>
        ))}
      </div>

      <div class="quest-layout">
        <div class="quest-main">
          <div class="quest-header">
            <h2>{quest.title}. küldetés</h2>
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
