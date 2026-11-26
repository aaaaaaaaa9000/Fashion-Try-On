import React from 'react';
import type { Garment } from '../lib/types';
import { toSrc } from '../lib/image';
import { CheckIcon, UploadIcon } from './icons';

interface Props {
  garments: Garment[];
  activeIds: string[];
  disabled: boolean;
  onAdd: (files: File[]) => Promise<Garment[]>;
  onSelect: (garment: Garment) => void;
  onRemove: (id: string) => void;
}

/** Step 2: the garments uploaded in this session. Tap one to put it on. */
const Wardrobe: React.FC<Props> = ({ garments, activeIds, disabled, onAdd, onSelect, onRemove }) => {
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const added = await onAdd(files);
    // One new piece: put it on right away.
    if (added.length === 1 && !disabled) onSelect(added[0]);
  };

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-3">
        <span className="step-num">٢</span>
        <h2 className="text-base font-bold">القطع</h2>
      </div>
      <p className="mb-4 ps-10 text-xs text-ink-muted">ارفع صورة القطعة لوحدها (صورة المنتج)، ودوس عليها عشان تتلبس.</p>

      <div className="grid grid-cols-3 gap-2.5">
        {garments.map((g) => {
          const active = activeIds.includes(g.id);
          return (
            <div key={g.id} className="relative">
              <button
                type="button"
                onClick={() => onSelect(g)}
                disabled={disabled || active}
                title={g.name}
                className={`relative block aspect-square w-full overflow-hidden rounded-2xl border-2 bg-white transition-all ${
                  active ? 'border-wine' : 'border-cream-300 hover:border-wine/50'
                } disabled:cursor-not-allowed ${disabled && !active ? 'opacity-50' : ''}`}
              >
                <img src={toSrc(g.image)} alt={g.name} className="h-full w-full object-contain p-1" />
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-wine/25">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wine text-white shadow-card">
                      <CheckIcon className="h-5 w-5" />
                    </span>
                  </span>
                )}
              </button>
              {!active && (
                <button
                  type="button"
                  onClick={() => onRemove(g.id)}
                  disabled={disabled}
                  aria-label={`شيل ${g.name}`}
                  className="absolute -top-1.5 -end-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-cream-300 bg-white text-xs text-ink-muted shadow-card hover:text-wine disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <label
          htmlFor="garment-upload"
          className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-cream-300 bg-cream-100 text-ink-muted transition-colors hover:border-wine/40 hover:text-wine ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <UploadIcon className="h-6 w-6" />
          <span className="text-xs font-bold">ارفع قطعة</span>
        </label>
        <input id="garment-upload" type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={disabled} />
      </div>
    </section>
  );
};

export default Wardrobe;
