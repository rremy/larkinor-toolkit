export enum PageType {
  FreeMove = 'FreeMove',
  Battle = 'Battle',
  Shop = 'Shop',
  Church = 'Church',
  Unknown = 'Unknown',
}

export function detectPage(doc: Document): PageType {
  // FreeMove: directional navigation table present
  // The game uses a table with direction links (É/K/D/Ny = N/E/S/W in Hungarian)
  if (
    doc.querySelector('table.irany') !== null ||
    doc.querySelector('a[href*="dir=north"], a[href*="dir=south"], a[href*="dir=east"], a[href*="dir=west"]') !== null
  ) {
    return PageType.FreeMove;
  }

  // Battle: monster image from /pic/szornyk/ path
  if (doc.querySelector('img[src*="/pic/szornyk/"]') !== null) {
    return PageType.Battle;
  }

  // Shop: Vétel/Eladás (buy/sell) column headers
  const allText = doc.body?.textContent ?? '';
  if (allText.includes('Vétel') && allText.includes('Eladás')) {
    return PageType.Shop;
  }

  // Church: healing/mana shop — "Mágikus tárgy" + "Negatív hatások"
  if (allText.includes('Mágikus tárgy') && allText.includes('Negatív hatások')) {
    return PageType.Church;
  }

  console.warn('[Larkinor UI] Unrecognised page type — rendering skipped');
  return PageType.Unknown;
}
