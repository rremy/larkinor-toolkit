import { h, type VNode } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataLoader, LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { buildMonsterDatabase } from '@/shared/data';
import { matchesSearch } from '@/shared/text';
import { QuestGrid } from './QuestGrid';
import { QuestKeyLegend } from './QuestKeyLegend';
import { QuestCellDetail } from './QuestCellDetail';
import { locksIn } from './questMeta';

interface QuestViewProps {
  loader: DataLoader;
  /** Routed quest id (`#quests/<id>`); null falls back to the first quest. */
  questId: number | null;
  onSelectQuest(id: number): void;
  onJumpToMonster(id: number): void;
}

const TILE_SIZES = [40, 56, 72];
const DEFAULT_TILE = 56;

export function QuestView(props: QuestViewProps): VNode {
  const { loader, questId, onSelectQuest, onJumpToMonster } = props;
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [monsters, setMonsters] = useState<MonsterDatabase>(() => buildMonsterDatabase([]));
  const [search, setSearch] = useState('');
  const [selectedCell, setSelectedCell] = useState<QuestCell | null>(null);
  const [highlightLock, setHighlightLock] = useState<LockType | null>(null);
  const [tileSize, setTileSize] = useState(DEFAULT_TILE);

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

  const filtered = useMemo(() => {
    if (!quests) return [];
    if (!search.trim()) return quests;
    return quests.filter((q) => matchesSearch(`${q.id} ${q.description} ${q.reward}`, search));
  }, [quests, search]);

  if (!quests) {
    return <div class="quest-view"><div class="quest-stats">Betöltés…</div></div>;
  }

  const quest = quests.find((q) => q.id === questId) ?? quests[0] ?? null;
  if (!quest) {
    return <div class="quest-view"><div class="quest-stats">Nincs küldetés.</div></div>;
  }

  const monsterCount = quest.cells.filter((c) => c.monsterId != null).length;
  const keyCount = quest.cells.filter((c) => c.key).length;
  const questionCount = quest.cells.filter((c) => c.question).length;
  const trapCount = quest.cells.filter((c) => c.trap).length;
  const lockCount = locksIn(quest).length;

  return (
    <div class="quest-view">
      <div class="quest-layout">
        <div class="quest-picker">
          <div class="field search quest-search">
            <label for="quest-search-input">Keresés</label>
            <input
              id="quest-search-input"
              type="text"
              value={search}
              placeholder="küldetés…"
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          </div>
          <ul class="list">
            {filtered.map((q) => (
              <li
                key={q.id}
                class={`quest-pick${q.id === quest.id ? ' active' : ''}`}
                onClick={() => onSelectQuest(q.id)}
              >
                <span class="quest-pick-id">{q.id}.</span> {q.description}
              </li>
            ))}
          </ul>
        </div>

        <div class="quest-main">
          <div class="quest-header">
            <h2>{quest.id}. küldetés</h2>
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
                onChange={(e) => setTileSize(Number((e.target as HTMLSelectElement).value))}
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
