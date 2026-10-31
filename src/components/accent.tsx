import { useEffect, useState } from 'react';

export type AccentId = 'blue' | 'sea' | 'brass';

const STORAGE_KEY = 'groww-connect-accent';

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'blue', label: 'Blue' },
  { id: 'sea', label: 'Sea' },
  { id: 'brass', label: 'Brass' },
];

function applyAccent(id: AccentId) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.accent = id;
  }
}

export function AccentInit() {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'sea' || saved === 'brass' || saved === 'blue') applyAccent(saved);
  }, []);
  return null;
}

export function AccentSwitch() {
  const [current, setCurrent] = useState<AccentId>('blue');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'sea' || saved === 'brass' || saved === 'blue') setCurrent(saved);
  }, []);

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Accent color">
      <span className="hidden text-xs text-muted sm:inline">Accent</span>
      {ACCENTS.map((accent) => (
        <button
          key={accent.id}
          type="button"
          aria-label={`${accent.label} accent`}
          aria-pressed={current === accent.id}
          className={
            'size-8 rounded-full border border-border p-1.5 transition-transform hover:scale-105 ' +
            (current === accent.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : '')
          }
          onClick={() => {
            applyAccent(accent.id);
            localStorage.setItem(STORAGE_KEY, accent.id);
            setCurrent(accent.id);
          }}
        >
          <span className={`block size-full rounded-full swatch-${accent.id}`} />
        </button>
      ))}
    </div>
  );
}
