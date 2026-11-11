/**
 * Parse the fan site's archipelago chart (larkinorcenter.hu/szigetvilag2.html)
 * into the sea chart, in the city map's grid coordinates.
 *
 * The page is a 48×72 table of 20px cells: the class names what a cell is
 * (`tenger` water, a district, `unex`/`ununex` unexplored land) and an `o`
 * marks a harbour. Facts that matter, all measured against the live game on
 * 2026-11-11:
 *
 * - Fan (row, col) is our (row − 36, col − 5): our city's 10×10 block sits at
 *   fan rows 36–45, cols 5–14.
 * - The legend is drawn inside the table. Fan rows 1–8 carry colour swatches in
 *   fan columns 1 and 39 beside `colspan` label cells; they are not land, and
 *   the `o` swatch beside "Kikötő" is not a harbour.
 * - The lone `F` square (fan (16, 2)) is a harbour: the game draws `kikötő`
 *   there.
 * - Two squares are uncertain and become `unknown`, which every side check
 *   skips: the lone `feltoltes` square in open sea, never seen from a ship, and
 *   our (−23, 2), which the chart draws as sivatag but both live island tiles
 *   beside it show as coast.
 */

export const ROW_OFFSET = -36;
export const COL_OFFSET = -5;

/** Fan cell classes → the district names the city map uses. */
const DISTRICTS = {
  varoskozpont: 'városközpont', magusnegyed: 'mágus-negyed', harcosnegyed: 'harcos-negyed',
  kezdonegyed: 'kezdő-negyed', sotetnegyed: 'sötét-negyed', sziklabarlang: 'sziklabarlangok',
  erdo: 'erdő', mocsar: 'mocsár', temeto: 'temető', sivatag: 'sivatag', hegyseg: 'hegység',
};

/** Side and size classes: never what a cell is. */
const LAYOUT = new Set(['negyzet', 'fv', 'jv', 'av', 'bv', 'fp', 'jp', 'ap', 'bp']);

/** Fan rows holding the legend, and the two columns its swatches sit in. */
const LEGEND_ROWS = { min: 1, max: 8 };
const LEGEND_COLS = new Set([1, 39]);

/** Fan squares the live game contradicted or nobody has seen (see above). */
const HARBOUR_FIXES = [[16, 2]];
const UNKNOWN = [[-27, 9], [-23, 2]];

/**
 * @param {string} html
 * @returns {{ rows: {min:number,max:number}, cols: {min:number,max:number}, squares: object[] }}
 */
export function parseChart(html) {
  const rows = html.split(/<tr[\s>]/i).slice(1);
  const squares = [];
  let width = 0;
  rows.forEach((rowHtml, fr) => {
    let fc = 0;
    for (const m of rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
      const attrs = m[1];
      const span = Number(/colspan="(\d+)"/i.exec(attrs)?.[1] ?? 1);
      const classes = (/class="([^"]*)"/i.exec(attrs)?.[1] ?? '').split(/\s+/).filter((c) => c && !LAYOUT.has(c));
      const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
      const legend = fr >= LEGEND_ROWS.min && fr <= LEGEND_ROWS.max && (LEGEND_COLS.has(fc) || span > 1);
      if (span === 1 && !legend) {
        const square = toSquare(fr, fc, classes[0] ?? 'tenger', text);
        if (square) squares.push(square);
      }
      fc += span;
    }
    width = Math.max(width, fc);
  });
  if (rows.length !== 72 || width !== 48) throw new Error(`Unexpected chart size ${rows.length}×${width}`);
  return {
    rows: { min: ROW_OFFSET, max: rows.length - 1 + ROW_OFFSET },
    cols: { min: COL_OFFSET, max: width - 1 + COL_OFFSET },
    squares,
  };
}

function toSquare(fr, fc, cls, text) {
  const row = fr + ROW_OFFSET;
  const col = fc + COL_OFFSET;
  const harbour = text === 'o' || HARBOUR_FIXES.some(([r, c]) => r === fr && c === fc);
  if (UNKNOWN.some(([r, c]) => r === row && c === col)) return { row, col, kind: 'unknown' };
  if (cls === 'tenger') return null;
  if (cls === 'unex' || cls === 'ununex') return { row, col, kind: 'unexplored', ...(harbour ? { harbour: true } : {}) };
  const district = DISTRICTS[cls];
  if (!district) throw new Error(`Unknown chart class "${cls}" at fan (${fr}, ${fc})`);
  return { row, col, kind: 'land', district, ...(harbour ? { harbour: true } : {}) };
}
