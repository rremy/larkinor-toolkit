export interface DataSource {
  fetchJson<T>(url: string): Promise<T>;
}

/**
 * Split a data URL into a stable cache key (base path, without the `?v=` tag)
 * and the version tag itself. Keying on the base — while storing the version
 * separately — means a new version overwrites the old cache entry instead of
 * leaving a stale one behind for every build.
 */
function cacheParts(url: string, prefix: string): { key: string; version: string } {
  const q = url.indexOf('?');
  if (q < 0) return { key: prefix + url, version: '' };
  const version = new URLSearchParams(url.slice(q + 1)).get('v') ?? '';
  return { key: prefix + url.slice(0, q), version };
}

export function gmSource(cacheKeyPrefix = 'lc_cache:'): DataSource {
  return {
    fetchJson<T>(url: string): Promise<T> {
      const { key, version } = cacheParts(url, cacheKeyPrefix);
      const cached = GM_getValue(key, null);
      if (cached !== null && GM_getValue(key + ':v', '') === version) {
        try { return Promise.resolve(JSON.parse(cached) as T); } catch { /* refetch */ }
      }
      return new Promise<T>((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload(res) {
            if (res.status !== 200) { reject(new Error(`HTTP ${res.status} for ${url}`)); return; }
            try {
              const parsed = JSON.parse(res.responseText) as T;
              GM_setValue(key, res.responseText);
              GM_setValue(key + ':v', version);
              resolve(parsed);
            } catch (e) { reject(e); }
          },
          onerror() { reject(new Error(`Network error for ${url}`)); },
        });
      });
    },
  };
}

export function httpSource(cacheKeyPrefix = 'lc_cache:'): DataSource {
  return {
    async fetchJson<T>(url: string): Promise<T> {
      const { key, version } = cacheParts(url, cacheKeyPrefix);
      const cached = localStorage.getItem(key);
      if (cached !== null && (localStorage.getItem(key + ':v') ?? '') === version) {
        try { return JSON.parse(cached) as T; } catch { /* refetch */ }
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as T;
      try {
        localStorage.setItem(key, text);
        localStorage.setItem(key + ':v', version);
      } catch { /* quota — ignore */ }
      return parsed;
    },
  };
}
