import { h } from 'preact';
import { render, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestGrid } from '@/database/quests/QuestGrid';
import { buildMonsterDatabase } from '@/shared/data';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, hasQuestion: false, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif',
  level: 1, hp: 6, mp: 4, attackType: '', debuff: '', magicWeapon: false,
  location: 'Larkinor', drops: [],
}]);

const quest: Quest = {
  id: '1', set: 'royal', title: '1', description: 'd', reward: 'r', rows: 2, cols: 2,
  cells: [
    cell({ row: 0, col: 0, portal: 'entrance' }),
    cell({ row: 0, col: 1, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' }, N: { kind: 'wall' } } }),
    cell({ row: 1, col: 0, monsterId: 1, monsterName: 'Vérszomjas moszkitóraj' }),
    cell({ row: 1, col: 1, key: 'vas', hasQuestion: true, question: { prompt: 'Mit teszel?', choices: [] } }),
  ],
};

describe('QuestGrid', () => {
  it('renders one tile per cell without using a table', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-cell')).toHaveLength(4);
    expect(container.querySelector('table')).toBeNull();
  });

  it('marks walls and doors as edge modifiers', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-edge.N.wall')).toBeTruthy();
    expect(container.querySelector('.quest-edge.E.door.lock-vas')).toBeTruthy();
  });

  it('marks a szel edge and labels it as the edge of the maze, not a passage', () => {
    const szelQuest: Quest = {
      ...quest,
      cells: [
        ...quest.cells.slice(0, 3),
        cell({ row: 1, col: 1, edges: { ...openEdges(), E: { kind: 'szel' } } }),
      ],
    };
    const { container } = render(
      <QuestGrid quest={szelQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const edge = container.querySelector('.quest-edge.E.szel');
    expect(edge).toBeTruthy();
    expect(edge?.getAttribute('title')).toBe('labirintus széle');
  });

  it('makes doors focusable so the key hint is keyboard-reachable', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const door = container.querySelector('.quest-edge.door') as HTMLElement;
    expect(door.getAttribute('tabindex')).toBe('0');
  });

  it('renders the monster sprite from the live asset host', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const img = container.querySelector('img.quest-sprite') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://l2.larkinor.hu/szornyk/moszkitoraj_k.gif');
    expect(img.getAttribute('alt')).toBe('Vérszomjas moszkitóraj');
  });

  it('badges key and entrance cells', () => {
    // The fixture's question cell also carries a key (row 1, col 1), so its
    // corner question badge is superseded by the big icon (see the
    // "big trap/question icon" suite below) — only the key badge survives.
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-badge.key')).toBeTruthy();
    expect(container.querySelector('.quest-badge.entrance')).toBeTruthy();
  });

  it('reports the clicked cell', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(container.querySelectorAll('.quest-cell')[2]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ row: 1, col: 0 }));
  });

  it('marks the selected cell and cells holding a highlighted lock key', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={quest.cells[0]}
                 onSelect={() => {}} highlightLock="vas" />,
    );
    expect(container.querySelectorAll('.quest-cell.selected')).toHaveLength(1);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
  });

  describe('void filler tiles', () => {
    it('does not paint a real cell as void filler just because it has no narration', () => {
      // Shaped like a tavern question tile: parseTavernTitle empties
      // `narration` and puts everything into `question`, so `narration === ''`
      // alone cannot tell a real room from empty filler on that set.
      const tavernShapedQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({
            row: 1, col: 1, narration: '', hasQuestion: true,
            question: { prompt: 'Mit teszel?', choices: [] },
          }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={tavernShapedQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const questionCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(questionCell.classList.contains('void')).toBe(false);
    });

    it('still paints an actually-empty filler cell as void', () => {
      const emptyQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, narration: '' }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={emptyQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const emptyCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(emptyCell.classList.contains('void')).toBe(true);
    });
  });

  describe('big trap/question icon', () => {
    it('renders a trap cell with the large centred icon, not the corner badge', () => {
      const trapQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, trap: true }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={trapQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const trapCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(trapCell.querySelector('.quest-big-icon.trap')).toBeTruthy();
      expect(trapCell.querySelector('.quest-badge.trap')).toBeNull();
    });

    it('renders a question cell with the large centred icon, not the corner badge', () => {
      // `quest.cells[3]` already has a question, with no trap.
      const { container } = render(
        <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const questionCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(questionCell.querySelector('.quest-big-icon.question')).toBeTruthy();
      expect(questionCell.querySelector('.quest-badge.question')).toBeNull();
    });

    it('suppresses the death and entrance badges on a big-icon tile, but keeps the quest-item badge', () => {
      const clutteredQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({
            row: 1, col: 1, trap: true, questItem: true, death: true, portal: 'entrance',
          }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={clutteredQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const trapCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(trapCell.querySelector('.quest-badge.death')).toBeNull();
      expect(trapCell.querySelector('.quest-badge.entrance')).toBeNull();
      expect(trapCell.querySelector('.quest-badge.quest-item')).toBeTruthy();
    });

    it('shows the quest-item badge on a big-icon tile that is also the objective, so it is not hidden (quest 27, cell 1,1)', () => {
      // Real case: kerdes_kt_labikibe.jpg is simultaneously the question, the
      // quest objective and the exit. Suppressing the objective badge here
      // would silently hide the one item the player is there to collect —
      // the same argument that already keeps key/exit/boss on a big-icon tile.
      const objectiveQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, hasQuestion: true, question: { prompt: 'Mit teszel?', choices: [] }, questItem: true, portal: 'exit' }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={objectiveQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const objectiveCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(objectiveCell.querySelector('.quest-big-icon.question')).toBeTruthy();
      expect(objectiveCell.querySelector('.quest-badge.quest-item')).toBeTruthy();
      expect(objectiveCell.querySelector('.quest-badge.exit')).toBeTruthy();
    });

    it('regression guard: a question+key cell still shows the key badge, so the door-to-key lookup keeps working', () => {
      // 10 real cells (e.g. kerdes_aranykulcs.jpg) pair a question with a key;
      // the key legend depends on this badge surviving the big-icon change.
      const { container } = render(
        <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const questionKeyCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(questionKeyCell.querySelector('.quest-big-icon.question')).toBeTruthy();
      expect(questionKeyCell.querySelector('.quest-badge.key.lock-vas')).toBeTruthy();
    });

    it('a trap+exit cell still shows the exit badge, so the way out stays findable', () => {
      // Real case: quest 29, cell (2,2), csapda_labikibe_j.jpg.
      const trapExitQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, trap: true, portal: 'exit' }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={trapExitQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const trapExitCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(trapExitCell.querySelector('.quest-big-icon.trap')).toBeTruthy();
      expect(trapExitCell.querySelector('.quest-badge.exit')).toBeTruthy();
    });

    it('a trap+question cell shows the trap icon, since a trap is the more dangerous fact', () => {
      const bothQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, trap: true, hasQuestion: true, question: { prompt: 'Mit teszel?', choices: [] } }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={bothQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const bothCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(bothCell.querySelector('.quest-big-icon.trap')).toBeTruthy();
      expect(bothCell.querySelector('.quest-big-icon.question')).toBeNull();
    });

    it('renders the big icon from hasQuestion even when the title never parsed into a question', () => {
      // Task 18: the marker must come from the image, not from `question !==
      // null`, so a parse miss can never make it disappear.
      const unparsedQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({ row: 1, col: 1, hasQuestion: true, question: null }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={unparsedQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const unparsedCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(unparsedCell.querySelector('.quest-big-icon.question')).toBeTruthy();
    });

    it('keeps the boss badge on a question+boss cell', () => {
      // Real case: quest 27, cell (1,2), tolvajkepzoboss_kerdes.jpg — also the
      // only trap/question cell that resolves to a monster.
      const bossQuest: Quest = {
        ...quest,
        cells: [
          ...quest.cells.slice(0, 3),
          cell({
            row: 1, col: 1, hasQuestion: true, question: { prompt: 'Mit teszel?', choices: [] }, boss: true,
          }),
        ],
      };
      const { container } = render(
        <QuestGrid quest={bossQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
      );
      const bossCell = container.querySelector('[data-row="1"][data-col="1"]') as HTMLElement;
      expect(bossCell.querySelector('.quest-big-icon.question')).toBeTruthy();
      expect(bossCell.querySelector('.quest-badge.boss')).toBeTruthy();
    });
  });
});
