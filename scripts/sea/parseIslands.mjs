/**
 * Parse the fan site's Thord-Artin map (larkinorcenter.hu/taterkep.html) into
 * island tiles, and add the tiles of the small western island measured live.
 *
 * Facts that matter, measured against the live game on 2026-11-11:
 *
 * - Every cell's image carries `id="img<c>_<r>"`, and the game draws that tile
 *   as `/tajk/nagysziget/szig_<c>-<r>.gif` — the fan site's own names. Rows
 *   count up toward the north; the tile sits at our (−12 − r, c + 22), so
 *   Lápapály (`szig_2-10`) is at (−22, 24), which its harbour picture
 *   `-2224kikoto.gif` confirms.
 * - Many cells show the placeholder "Nem meghódított terület" while the real
 *   name sits in an HTML comment beside it (`Északi kikötő`, `Lövegek`, …): the
 *   commented name wins over the placeholder.
 * - The modal lists the district (`Negyed / Terület`) and the buildings
 *   (`Épületek`), each with `készültség: kész` or the stone still needed.
 */

export const ISLAND = 'Thord-Artin';
const PLACEHOLDER = 'Nem meghódított terület';

/** The fan site's district names → the city map's. */
const DISTRICTS = {
  'Városközpont': 'városközpont', 'Harcos negyed': 'harcos-negyed', 'Sötét negyed': 'sötét-negyed',
  'Mágus negyed': 'mágus-negyed', 'Kezdő negyed': 'kezdő-negyed', 'Erdő': 'erdő', 'Mocsár': 'mocsár',
  'Hegység': 'hegység', 'Sivatag': 'sivatag', 'Temető': 'temető',
};

/** The small western island: three tiles walked live, every other side coast. */
export const WESTERN_ISLAND = [
  { image: 'szighar/szighar_1-1', row: -24, col: 1, island: 'Nyugati sziget', district: 'harcos-negyed', buildings: [{ name: 'Kikötő', ready: false, note: '299371 építőkő szükséges' }] },
  { image: 'szighar/szighar_2-1', row: -24, col: 2, island: 'Nyugati sziget', district: 'harcos-negyed' },
  { image: 'szigmag/szigmag_2--21', row: -23, col: 1, island: 'Nyugati sziget', district: 'sivatag' },
];

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/<[^>]+>/g, '').trim();

/** @param {string} html @returns {object[]} */
export function parseThordArtin(source) {
  // A commented-out image (`<!--<img …>-->`, sometimes `<!-- <img …> -->`) is
  // renamed `<cimg …>`, so only the visible images open a tile below while the
  // commented copies still lend their names.
  const html = source.replace(/<!--\s*(<img[^>]*>)\s*-->/g, (_, img) => img.replace('<img', '<cimg'));
  const commentedNames = new Map();
  for (const m of html.matchAll(/<cimg id="img(\d+_\d+)"[^>]*title="([^"]*)"/g)) commentedNames.set(m[1], m[2]);
  const tiles = [];
  for (const m of html.matchAll(/<img id="img(\d+)_(\d+)"[^>]*>[\s\S]*?(?=<img id="img\d+_\d+"|<\/table>)/g)) {
    const c = Number(m[1]);
    const r = Number(m[2]);
    const block = m[0];
    const commented = commentedNames.get(`${c}_${r}`);
    const visible = /title="([^"]*)"/.exec(block)?.[1];
    const name = visible && visible !== PLACEHOLDER ? visible : commented && commented !== PLACEHOLDER ? commented : undefined;
    const fields = {};
    for (const f of block.matchAll(/<p class="modalkategoria">([^<]*)<\/p>\s*<p class="modalkategoriaszoveg">([\s\S]*?)<\/p>/g)) {
      fields[f[1].trim()] = f[2];
    }
    const district = DISTRICTS[decode(fields['Negyed / Terület'] ?? '')];
    const buildings = parseBuildings(fields['Épületek'] ?? '');
    tiles.push({
      image: `nagysziget/szig_${c}-${r}`,
      row: -12 - r,
      col: c + 22,
      island: ISLAND,
      ...(name ? { name } : {}),
      ...(district ? { district } : {}),
      ...(buildings.length ? { buildings } : {}),
    });
  }
  return tiles;
}

function parseBuildings(html) {
  const out = [];
  for (const part of html.split(/<br\s*\/?>/i)) {
    const name = /<span class="epuletnev">([^<]*)<\/span>/.exec(part)?.[1]?.trim();
    if (!name) continue;
    const ready = /class="kesz"/.test(part);
    const stone = /(\d+)\s*építőkő szükséges/.exec(part)?.[1];
    out.push({ name, ready, ...(stone ? { note: `${stone} építőkő szükséges` } : {}) });
  }
  return out;
}
