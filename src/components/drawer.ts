// Shared sheet/modal decision for the bottom-drawer components. Mobile shows
// them as bottom sheets; desktop shows the same components as centered modals,
// so only the backdrop class differs.

export type DrawerVariant = 'sheet' | 'modal';

/**
 * Backdrop class list for a drawer variant. The base class stays first and is
 * always present — both drawers close by testing the click target for
 * 'lc-drawer-backdrop', so the modal form must be additive.
 */
export function backdropClass(variant: DrawerVariant): string {
  return variant === 'modal'
    ? 'lc-drawer-backdrop lc-drawer-backdrop--center'
    : 'lc-drawer-backdrop';
}
