import { h } from 'preact';
import type { Monster } from '@/shared/data/monsters';
import { backdropClass, type DrawerVariant } from '@/components/drawer';
import { FavouriteButton } from '@/components/FavouriteButton';
import { isFavourite } from '@/shared/favouriteMonsters';
import type { FavouriteMonsters } from '@/hooks/useFavouriteMonsters';

export interface MonsterCardProps {
  monster: Monster | null;
  onClose: () => void;
  /** When set, drops with a real id become links that open the DB on that entity. */
  onItemClick?: (id: number) => void;
  /** 'sheet' (mobile bottom drawer) or 'modal' (desktop centered dialog). */
  variant?: DrawerVariant;
  /** The favourite monsters; without them (or without a store) the card shows no heart. */
  favourites?: FavouriteMonsters;
}

const ASSET_BASE = 'https://l2.larkinor.hu';

/**
 * Resolves a monster's DB image path to its live URL. The database stores
 * paths like `/pic/szornyk/NAME_k.gif`, but the live server serves them
 * without the `/pic` segment (`https://l2.larkinor.hu/szornyk/NAME_k.gif`).
 */
export function monsterImageUrl(image: string): string {
  if (!image) return '';
  if (image.startsWith('http')) return image;
  return `${ASSET_BASE}${image.replace(/^\/pic\//, '/')}`;
}

export function MonsterCard({
  monster, onClose, onItemClick, variant = 'sheet', favourites,
}: MonsterCardProps) {
  if (!monster) return null;

  const imgUrl = monsterImageUrl(monster.image);

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('lc-drawer-backdrop')) {
      onClose();
    }
  }

  return (
    <div class={backdropClass(variant)} onClick={handleBackdropClick}>
      <div class="lc-drawer" role="dialog" aria-label={monster.name}>
        <button class="lc-drawer-close" aria-label="bezár" onClick={onClose}>×</button>

        <div class="lc-mc-header">
          <img
            class="lc-mc-img"
            src={imgUrl}
            alt={monster.name}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            {/* Beside the heading, not in it, so the heading stays the name alone. */}
            <div class="lc-fav-title">
              <h2 class="lc-mc-name">{monster.name}</h2>
              {favourites?.enabled && (
                <FavouriteButton
                  on={isFavourite(favourites.favourites, monster.name)}
                  onToggle={() => favourites.toggle(monster.name)}
                />
              )}
            </div>
            <span class="lc-mc-level">Szint {monster.level}</span>
            {monster.location && <span class="lc-mc-location"> — {monster.location}</span>}
          </div>
        </div>

        <dl class="lc-mc-stats">
          <dt>Életpont</dt><dd>{monster.hp}</dd>
          <dt>Varázspont</dt><dd>{monster.mp}</dd>
          <dt>Támadástípus</dt><dd>{monster.attackType}</dd>
          <dt>Debuff</dt><dd>{monster.debuff}</dd>
          <dt>Mágikus fegyver</dt><dd>{monster.magicWeapon ? 'Igen' : 'Nem'}</dd>
        </dl>

        {monster.drops.length > 0 && (
          <div class="lc-mc-drops">
            <h3>Zsákmány</h3>
            <ul>
              {monster.drops.map((drop, i) => (
                <li key={i}>
                  {drop.qty}×{' '}
                  {onItemClick && drop.id > 0
                    ? <button type="button" class="lc-mc-drop-link" onClick={() => onItemClick(drop.id)}>{drop.name}</button>
                    : drop.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
