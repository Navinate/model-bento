import { useState, useMemo } from 'react';
import { SearchBar } from './SearchBar';

interface ModelSummary {
  provider: string;
  name: string;
  displayName: string;
}

interface ModelGridProps {
  models: ModelSummary[];
  initialQuery?: string;
}

export function ModelGrid({ models, initialQuery = '' }: ModelGridProps) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    if (!query.trim()) return models;
    const q = query.toLowerCase();
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q),
    );
  }, [models, query]);

  return (
    <div>
      <div className="mb-8">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {filtered.length === 0 ? (
        <div data-empty-state className="text-center py-16 text-slate-500">
          <p className="text-lg">No models found</p>
          <p className="mt-1 text-sm">Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <a
              key={`${m.provider}/${m.name}`}
              href={`/m/${m.provider}/${m.name}`}
              className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {m.provider}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{m.displayName}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
