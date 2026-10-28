import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { PalaceQuestState } from '@/utils/buildingExtract';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { DatabaseButton } from '@/components/DatabaseButton';
import { ControlButton } from '@/components/BuildingControls';

// The palace's quest room as a phone page: the quest on offer — its number, the
// king's brief and the reward — with a way into its maze in the database, then
// the room's three buttons.

export interface PalaceQuestProps {
  state: PalaceQuestState;
}

export function PalaceQuest({ state }: PalaceQuestProps): JSX.Element {
  const { offer } = state;
  // A nonce rather than a flag, as on the free-move page: the database lands on
  // the quest only when this changes, so each press must change it.
  const [questOpen, setQuestOpen] = useState(0);
  const [showQuest, setShowQuest] = useState(false);
  // Whether this open should land on the offered quest; the plain database
  // button opens wherever the database was last left.
  const [landOnQuest, setLandOnQuest] = useState(false);
  const openQuest = (): void => {
    setQuestOpen((n) => n + 1);
    setLandOnQuest(true);
    setShowQuest(true);
  };
  const openDatabase = (): void => {
    setLandOnQuest(false);
    setShowQuest(true);
  };
  const questTarget = landOnQuest && offer?.questId ? offer.questId : null;

  return (
    <div class="lc-page">
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

      <div class="lc-mkt-stats">
        <span class="lc-shop-title">Küldetésterem</span>
        <DatabaseButton onClick={openDatabase} />
      </div>

      <div class="lc-mkt-body">
        {offer && (
          <section class="lc-bld-section">
            <h3>Küldetés{offer.questId !== null && ` #${offer.questId}`}</h3>
            {offer.brief.split('\n').map((p, i) => <p key={i} class="lc-bld-text">{p}</p>)}
            {offer.reward && <p class="lc-bld-reward"><b>Jutalom:</b> {offer.reward}</p>}
            {offer.questId !== null && (
              <button class="lc-home-act lc-home-act--wide" onClick={openQuest}>
                📜 Labirintus megnyitása az adatbázisban
              </button>
            )}
          </section>
        )}

        <div class="lc-mkt-actions">
          <ControlButton option={state.accept} wide label="Vállalod a küldetést" />
          <ControlButton option={state.claimReward} wide label="Jelentkezel jutalomért" />
          <ControlButton option={state.exit} wide />
        </div>
      </div>

      <DatabaseOverlay
        open={showQuest}
        initialTab={questTarget ? 'quests' : undefined}
        initialTabKey={questOpen}
        initialQuest={questTarget ? { set: 'royal', id: questTarget } : null}
        onClose={() => setShowQuest(false)}
      />
    </div>
  );
}
