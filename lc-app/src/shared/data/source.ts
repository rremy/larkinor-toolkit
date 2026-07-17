export interface DataSource {
  fetchJson<T>(url: string): Promise<T>;
}

export function gmSource(cacheKeyPrefix = 'lc_cache:'): DataSource {
  return {
    fetchJson<T>(url: string): Promise<T> {
      const key = cacheKeyPrefix + url;
      const cached = GM_getValue(key, null);
      if (cached) {
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
      const key = cacheKeyPrefix + url;
      const cached = localStorage.getItem(key);
      if (cached) {
        try { return JSON.parse(cached) as T; } catch { /* refetch */ }
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as T;
      try { localStorage.setItem(key, text); } catch { /* quota — ignore */ }
      return parsed;
    },
  };
}
