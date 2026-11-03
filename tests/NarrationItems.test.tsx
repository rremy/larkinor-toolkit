import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { NarrationPanel } from '@/components/NarrationPanel';
import { ItemIndexContext } from '@/components/ItemIndexContext';
import type { ItemIndex } from '@/shared/itemMentions';

const index: ItemIndex = new Map([['arany', { tab: 'items', id: 615, name: 'arany' }]]);

const mount = (text: string, items: ItemIndex | null = index) => render(
  <ItemIndexContext.Provider value={items}>
    <NarrationPanel text={text} db={null} onMonsterClick={() => {}} />
  </ItemIndexContext.Provider>,
);

describe('NarrationPanel item mentions', () => {
  it('links a counted item to its database entry', () => {
    const { container } = mount('Kiástál 16 darab aranyat!');
    const link = container.querySelector('.lc-item-link');
    expect(link?.textContent).toBe('16 darab aranyat');
    expect(container.textContent).toBe('Kiástál 16 darab aranyat!');

    fireEvent.click(screen.getByRole('button', { name: '16 darab aranyat' }));
    expect(document.querySelector('.lc-db-overlay')).toBeTruthy();
  });

  it('highlights what it cannot name, and silver, without a link', () => {
    const { container } = mount('Kiástál 2 darab zümmögőt! Kiástál néhány ezüstpénzt! (+ 37 ezüst)');
    expect([...container.querySelectorAll('.lc-item-mention')].map((el) => el.textContent))
      .toEqual(['2 darab zümmögőt', '+ 37 ezüst']);
    expect(container.querySelector('.lc-item-link')).toBeNull();
  });

  it('highlights before the item names have loaded', () => {
    const { container } = mount('Kiástál 16 darab aranyat!', null);
    expect(container.querySelector('.lc-item-mention')?.textContent).toBe('16 darab aranyat');
  });
});
