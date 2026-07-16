/**
 * Grid position + district/POI lookup tables for the Térkép (map) view.
 * Ported from `lc-database/explorer.html` (MAP module, lines 734-766).
 */

export function parseId(imageId: string): { row: number; col: number } {
  const id = Number(imageId);
  return { row: Math.floor(id / 10), col: id % 10 };
}

export const DISTRICT_CLASS: Record<string, string> = {
  'városközpont': 'varos', 'mágus-negyed': 'magus', 'harcos-negyed': 'harcos',
  'kezdő-negyed': 'kezdo', 'sötét-negyed': 'sotet', 'sziklabarlangok': 'szikla',
  'erdő': 'erdo', 'mocsár': 'mocsar', 'temető': 'temeto', 'démonsziget': 'demon',
};

export const DISTRICT_SHORT: Record<string, string> = {
  'városközpont': 'város', 'mágus-negyed': 'mágus', 'harcos-negyed': 'harcos',
  'kezdő-negyed': 'kezdő', 'sötét-negyed': 'sötét', 'sziklabarlangok': 'szikla',
  'erdő': 'erdő', 'mocsár': 'mocsár', 'temető': 'temető', 'démonsziget': 'démon',
};

export const POI_EMOJI: Record<string, string> = {
  'palota.gif': '🏰', 'vegyesbolt.gif': '🛒', 'erod.gif': '🛡️', 'fegyverbolt.gif': '⚔️',
  'ekszeresz.gif': '💎', 'templom.gif': '⛪', 'magustorony.gif': '🔮', 'kocsma.gif': '🍺',
  'piac.gif': '🏪', 'kaszino.gif': '🎲', 'arena.gif': '⚔︎', 'kikoto.gif': '⚓', 'sajathaz.gif': '🏠',
};

export const POI_LABEL: Record<string, string> = {
  'palota.gif': 'palota', 'vegyesbolt.gif': 'vegyesbolt', 'erod.gif': 'erőd', 'fegyverbolt.gif': 'fegyverbolt',
  'ekszeresz.gif': 'ékszerész', 'templom.gif': 'templom', 'magustorony.gif': 'mágustorony', 'kocsma.gif': 'kocsma',
  'piac.gif': 'piac', 'kaszino.gif': 'kaszinó', 'arena.gif': 'aréna', 'kikoto.gif': 'kikötő', 'sajathaz.gif': 'sajátház',
};
