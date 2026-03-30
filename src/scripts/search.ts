import { load as yamlLoad } from 'js-yaml';
import { getServer } from './server-store';

interface SearchEntry {
  name: string;
  description: string;
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
      const parsed = yamlLoad(await res.text()) as { chems: Record<string, { description?: string }> } | null;
      for (const [name, data] of Object.entries(parsed?.chems ?? {})) {
        entries.push({ name, description: data?.description ?? '', type: 'chem', page: '/chems', paramKey: 'chem', unitSuffix: 'u' });
      }
    }
  } catch {}

  // Load drinks
  try {
    const res = await fetch(`/data/drinks/${server}.yaml`);
    if (res.ok) {
      const parsed = yamlLoad(await res.text()) as { drinks: Record<string, { description?: string }> } | null;
      for (const [name, data] of Object.entries(parsed?.drinks ?? {})) {
        entries.push({ name, description: data?.description ?? '', type: 'drink', page: '/drinks', paramKey: 'drink', unitSuffix: 'u' });
      }
    }
  } catch {}

  // Load food (future)
  try {
    const res = await fetch(`/data/food/${server}.yaml`);
    if (res.ok) {
      const parsed = yamlLoad(await res.text()) as { food: Record<string, { description?: string }> } | null;
      for (const [name, data] of Object.entries(parsed?.food ?? {})) {
        entries.push({ name, description: data?.description ?? '', type: 'food', page: '/food', paramKey: 'item', unitSuffix: '' });
      }
    }
  } catch {}

  searchCache = entries;
  return entries;
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
      .filter((e) => e.name.toLowerCase().includes(ql) || e.description.toLowerCase().includes(ql))
      .slice(0, 8);

    if (matches.length === 0) {
      searchDropdown.innerHTML = '<div class="search-empty">no results</div>';
      searchDropdown.classList.add('open');
      return;
    }

    searchDropdown.innerHTML = matches
      .map(
        (entry) => {
          const params = new URLSearchParams({ [entry.paramKey]: entry.name });
          if (amount) params.set('units', amount);
          const amtLabel = amount ? `${amount}${entry.unitSuffix}` : '';
          const nameMatch = entry.name.toLowerCase().includes(ql);
          const descSnippet = !nameMatch && entry.description ? highlight(entry.description, q) : '';
          return `<a class="search-result" href="${entry.page}?${params.toString()}">
            <span class="search-result-name">${nameMatch ? highlight(entry.name, q) : entry.name}</span>
            ${descSnippet ? `<span class="search-result-desc">${descSnippet}</span>` : ''}
            ${amtLabel ? `<span class="search-result-tag">${amtLabel}</span>` : ''}
            <span class="search-result-tag">${entry.type}</span>
          </a>`;
        },
      )
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
