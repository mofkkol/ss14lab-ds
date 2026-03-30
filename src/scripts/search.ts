import { load as yamlLoad } from 'js-yaml';
import { getServer } from './server-store';

interface ChemEffects {
  heals?: Record<string, number>;
  deals?: Record<string, number>;
}

interface SearchEntry {
  name: string;
  description: string;
  tags: string[];
  effects?: ChemEffects;
  type: 'chem' | 'drink' | 'food';
  page: string;
  paramKey: string;
  unitSuffix: string;
}

let searchCache: SearchEntry[] | null = null;

async function loadSearchData(): Promise<SearchEntry[]> {
  if (searchCache) return searchCache;
  const server = getServer();
  const entries: SearchEntry[] = [];

  // Load chems
  try {
    const res = await fetch(`/data/chems/${server}.yaml`);
    if (res.ok) {
      type RawEffects = { heals?: Record<string, number>; deals?: Record<string, number>; conditions?: string[] };
      const parsed = yamlLoad(await res.text()) as { chems: Record<string, { description?: string; effects?: RawEffects }> } | null;
      for (const [name, data] of Object.entries(parsed?.chems ?? {})) {
        const fx = data?.effects;
        const tags: string[] = [
          ...Object.keys(fx?.heals ?? {}).map((k) => `heals ${k}`),
          ...Object.keys(fx?.deals ?? {}).map((k) => `deals ${k}`),
          ...(fx?.conditions ?? []),
        ];
        const effects: ChemEffects | undefined = fx
          ? { heals: fx.heals, deals: fx.deals }
          : undefined;
        entries.push({ name, description: data?.description ?? '', tags, effects, type: 'chem', page: '/chems', paramKey: 'chem', unitSuffix: 'u' });
      }
    }
  } catch {}

  // Load drinks
  try {
    const res = await fetch(`/data/drinks/${server}.yaml`);
    if (res.ok) {
      const parsed = yamlLoad(await res.text()) as { drinks: Record<string, { description?: string }> } | null;
      for (const [name, data] of Object.entries(parsed?.drinks ?? {})) {
        entries.push({ name, description: data?.description ?? '', tags: [], type: 'drink', page: '/drinks', paramKey: 'drink', unitSuffix: 'u' });
      }
    }
  } catch {}

  // Load food (future)
  try {
    const res = await fetch(`/data/food/${server}.yaml`);
    if (res.ok) {
      const parsed = yamlLoad(await res.text()) as { food: Record<string, { description?: string }> } | null;
      for (const [name, data] of Object.entries(parsed?.food ?? {})) {
        entries.push({ name, description: data?.description ?? '', tags: [], type: 'food', page: '/food', paramKey: 'item', unitSuffix: '' });
      }
    }
  } catch {}

  searchCache = entries;
  return entries;
}

function rankEntry(e: SearchEntry, ql: string): number {
  if (e.name.toLowerCase().includes(ql)) return 3;
  if (e.tags.some((t) => t.toLowerCase().startsWith('heals ') && t.toLowerCase().includes(ql))) return 2;
  if (e.tags.some((t) => !t.toLowerCase().startsWith('heals ') && t.toLowerCase().includes(ql))) return 1;
  return 0; // description match
}

function fmtNum(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function highlight(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `<em>${text.slice(idx, idx + query.length)}</em>` +
    text.slice(idx + query.length)
  );
}

export function initSearch(): void {
  const searchInput = document.getElementById('nav-search') as HTMLInputElement | null;
  const searchDropdown = document.getElementById('search-dropdown');
  if (!searchInput || !searchDropdown) return;

  let focusedIdx = -1;

  function closeSearch() {
    searchDropdown!.classList.remove('open');
    searchDropdown!.innerHTML = '';
    focusedIdx = -1;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput!.focus();
      searchInput!.select();
    }
  });

  searchInput.addEventListener('click', (e) => e.stopPropagation());

  searchInput.addEventListener('input', async () => {
    const raw = searchInput.value.trim();
    focusedIdx = -1;
    if (!raw) {
      closeSearch();
      return;
    }

    // Parse optional leading amount: "20u Bic", "20 Bicaridine", or "1 Ice"
    const amtMatch = raw.match(/^(\d+)\s*u?\s+(.+)$/i);
    const amount = amtMatch ? amtMatch[1] : null;
    const q = amtMatch ? amtMatch[2] : raw;

    const entries = await loadSearchData();
    const ql = q.toLowerCase();
    const matches = entries
      .filter((e) =>
        e.name.toLowerCase().includes(ql) ||
        e.description.toLowerCase().includes(ql) ||
        e.tags.some((t) => t.toLowerCase().includes(ql))
      )
      .sort((a, b) => rankEntry(b, ql) - rankEntry(a, ql))
      .slice(0, 8);

    if (matches.length === 0) {
      searchDropdown.innerHTML = '<div class="search-empty">no results</div>';
      searchDropdown.classList.add('open');
      return;
    }

    const unitAmount = amount ? parseFloat(amount) : 1;

    searchDropdown.innerHTML = matches
      .map((entry) => {
        const params = new URLSearchParams({ [entry.paramKey]: entry.name });
        if (amount) params.set('units', amount);

        const nameMatch = entry.name.toLowerCase().includes(ql);
        const descMatch = entry.description.toLowerCase().includes(ql);

        // Row 1: name + type pill
        const nameHtml = nameMatch ? highlight(entry.name, q) : entry.name;
        const headerHtml = `<div class="sr-row">
          <span class="search-result-name">${nameHtml}</span>
          <span class="search-result-tag">${entry.type}</span>
        </div>`;

        // Row 2: description (left) + effects (right)
        const descHtml = entry.description
          ? `<span class="search-result-desc">${descMatch ? highlight(entry.description, q) : entry.description}</span>`
          : '';

        let effectsHtml = '';
        if (entry.effects) {
          const healSpans = Object.entries(entry.effects.heals ?? {})
            .map(([type, rate]) => `<span class="sr-heal">\u2212${fmtNum(rate * unitAmount)} ${type}</span>`)
            .join('');
          const dealSpans = Object.entries(entry.effects.deals ?? {})
            .map(([type, rate]) => `<span class="sr-deal">+${fmtNum(rate * unitAmount)} ${type}</span>`)
            .join('');
          if (healSpans || dealSpans) {
            effectsHtml = `<div class="sr-effects">${healSpans ? `<div class="sr-fx-col">${healSpans}</div>` : ''}${dealSpans ? `<div class="sr-fx-col">${dealSpans}</div>` : ''}</div>`;
          }
        }

        const bodyHtml = (descHtml || effectsHtml)
          ? `<div class="sr-row sr-body">${descHtml}${effectsHtml}</div>`
          : '';

        return `<a class="search-result" href="${entry.page}?${params.toString()}">${headerHtml}${bodyHtml}</a>`;
      })
      .join('');
    searchDropdown.classList.add('open');
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = searchDropdown.querySelectorAll<HTMLElement>('.search-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, -1);
    } else if (e.key === 'Enter' && items.length > 0) {
      e.preventDefault();
      const idx = focusedIdx >= 0 ? focusedIdx : 0;
      items[idx]?.click();
      return;
    } else if (e.key === 'Escape') {
      closeSearch();
      searchInput.blur();
      return;
    }
    items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
  });

  // Invalidate cache and clear UI on server change
  window.addEventListener('ss14:server-change', () => {
    searchCache = null;
    closeSearch();
    searchInput.value = '';
  });
}
