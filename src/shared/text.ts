// Text helpers shared by the userscript and the standalone database.
//
// Hungarian is heavily accented and the game's item and monster names carry
// those accents, but nobody types them when searching. Every text search in
// either UI folds accents so "gyikbor" finds "Gyíkbőr".

/**
 * Lower-cases and strips diacritics: "ŐrÜtő" becomes "oruto".
 *
 * NFD splits an accented character into its base letter plus a combining mark,
 * and the range below is the combining-diacriticals block — so this covers the
 * Hungarian set (á é í ó ö ő ú ü ű) without enumerating it.
 */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Whether `haystack` contains `needle`, ignoring case and accents. An empty or
 * whitespace-only needle matches everything, which is what a search box that has
 * not been typed into should do.
 */
export function matchesSearch(haystack: string, needle: string): boolean {
  const query = needle.trim();
  if (!query) return true;
  return foldAccents(haystack).includes(foldAccents(query));
}
