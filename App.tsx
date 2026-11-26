import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, editImage, makeModel, tryOn } from './lib/api';
import { compressForSave, fetchImage, fromDataUrl, readImageFile, toSrc } from './lib/image';
import { DEFAULT_POSE, MANNEQUINS, POSES } from './lib/options';
import type { Garment, Img, Layer, SavedLook, SubjectKind } from './lib/types';
import SubjectPicker from './components/SubjectPicker';
import Stage, { type StageError } from './components/Stage';
import Wardrobe from './components/Wardrobe';
import OutfitPanel from './components/OutfitPanel';
import EditsPanel from './components/EditsPanel';
import SavedLooks from './components/SavedLooks';
import { HangerIcon, RestartIcon } from './components/icons';

const SAVED_KEY = 'tryon-saved-looks-v1';
const MAX_SAVED = 30;

function loadSaved(): SavedLook[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Writes the list; returns false when the browser storage is full or blocked. */
function storeSaved(list: SavedLook[]): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'حصلت مشكلة. جرّب تاني.');

export default function App() {
  const [subject, setSubject] = useState<SubjectKind | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [layerIndex, setLayerIndex] = useState(0);
  const [poseKey, setPoseKey] = useState(DEFAULT_POSE);
  const [wardrobe, setWardrobe] = useState<Garment[]>([]);
  const [saved, setSaved] = useState<SavedLook[]>(loadSaved);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<StageError | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const activeLayers = useMemo(() => layers.slice(0, layerIndex + 1), [layers, layerIndex]);
  const currentLayer = layers[layerIndex];
  const currentImage: Img | null = currentLayer
    ? currentLayer.images[poseKey] ?? currentLayer.images[DEFAULT_POSE] ?? Object.values(currentLayer.images)[0] ?? null
    : null;
  const activeGarmentIds = activeLayers.map((l) => l.garment?.id).filter(Boolean) as string[];
  const isLoading = busy !== null;

  // Keep the result in view on phones when work starts or an error appears.
  const scrollToStage = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /** Runs one generation with a loading message and Arabic error handling. */
  const run = useCallback(async (message: string, task: () => Promise<void>, onRefused?: StageError['action']) => {
    setError(null);
    setBusy(message);
    scrollToStage();
    try {
      await task();
    } catch (err) {
      const refused = err instanceof ApiError && err.code === 'refused';
      setError({
        message: refused
          ? 'جيميناي رفض يعمل الصورة دي. ده بيحصل غالبًا مع الملابس الداخلية على صور أشخاص حقيقيين.'
          : errorText(err),
        action: refused ? onRefused : undefined,
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const startWith = (kind: SubjectKind, base: Img) => {
    setSubject(kind);
    setLayers([{ garment: null, images: { [DEFAULT_POSE]: base } }]);
    setLayerIndex(0);
    setPoseKey(DEFAULT_POSE);
    setError(null);
  };

  const handleStartOver = () => {
    setSubject(null);
    setLayers([]);
    setLayerIndex(0);
    setPoseKey(DEFAULT_POSE);
    setError(null);
  };

  const loadMannequin = async (id: string) => fetchImage(MANNEQUINS.find((m) => m.id === id)!.src);

  const applyGarment = useCallback(
    async (garment: Garment, onto: { kind: SubjectKind; image: Img; fresh?: boolean }) => {
      const result = await tryOn(onto.image, garment.image, onto.kind);
      if (onto.fresh) {
        setSubject(onto.kind);
        setLayers([
          { garment: null, images: { [DEFAULT_POSE]: onto.image } },
          { garment, images: { [DEFAULT_POSE]: result } },
        ]);
        setLayerIndex(1);
      } else {
        setLayers((prev) => [...prev.slice(0, layerIndex + 1), { garment, images: { [DEFAULT_POSE]: result } }]);
        setLayerIndex(layerIndex + 1);
      }
      setPoseKey(DEFAULT_POSE);
    },
    [layerIndex],
  );

  const tryOnMannequin = (garment: Garment, mannequinId: string) =>
    run('بنلبّس المانيكان...', async () => {
      const image = await loadMannequin(mannequinId);
      await applyGarment(garment, { kind: 'mannequin', image, fresh: true });
    });

  const handleGarmentSelect = (garment: Garment) => {
    if (!currentImage || isLoading) return;
    // Re-selecting the garment that comes next in the history just moves forward.
    const next = layers[layerIndex + 1];
    if (next?.garment?.id === garment.id) {
      setLayerIndex(layerIndex + 1);
      setPoseKey(DEFAULT_POSE);
      return;
    }
    const kind = subject!;
    run(
      `بنلبّس «${garment.name}»...`,
      () => applyGarment(garment, { kind, image: currentImage }),
      kind === 'person' ? { garment, run: tryOnMannequin } : undefined,
    );
  };

  const handleAddGarments = async (files: File[]) => {
    const added: Garment[] = [];
    for (const file of files) {
      try {
        const image = await readImageFile(file, 1280);
        added.push({ id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.[^/.]+$/, '').slice(0, 40) || 'قطعة', image });
      } catch (err) {
        setError({ message: errorText(err) });
      }
    }
    if (added.length) setWardrobe((prev) => [...prev, ...added]);
    return added;
  };

  const handleRemoveGarment = (id: string) => setWardrobe((prev) => prev.filter((g) => g.id !== id));

  const handleRemoveLast = () => {
    if (layerIndex > 0) {
      setLayerIndex(layerIndex - 1);
      setPoseKey(DEFAULT_POSE);
    }
  };

  /** Replaces the image of the current step and pose (color / background edits). */
  const replaceCurrent = (img: Img) =>
    setLayers((prev) =>
      prev.map((l, i) => (i === layerIndex ? { ...l, images: { ...l.images, [poseKey]: img } } : l)),
    );

  const handleColor = (label: string, value: string) => {
    if (!currentImage || isLoading) return;
    run(`بنغيّر اللون لـ${label}...`, async () => replaceCurrent(await editImage(currentImage, 'color', value)));
  };

  const handleBackground = (label: string, value: string) => {
    if (!currentImage || isLoading) return;
    run(`بنغيّر الخلفية (${label})...`, async () => replaceCurrent(await editImage(currentImage, 'background', value)));
  };

  const handlePose = (key: string, value: string) => {
    if (!currentLayer || isLoading || key === poseKey) return;
    if (currentLayer.images[key] || key === DEFAULT_POSE) {
      setPoseKey(key);
      return;
    }
    const base = currentLayer.images[DEFAULT_POSE] ?? Object.values(currentLayer.images)[0];
    const idx = layerIndex;
    run('بنغيّر الوضعية...', async () => {
      const img = await editImage(base, 'pose', value);
      setLayers((prev) => prev.map((l, i) => (i === idx ? { ...l, images: { ...l.images, [key]: img } } : l)));
      setPoseKey(key);
    });
  };

  const handleCustomPose = (text: string) => {
    const preset = POSES.find((p) => p.label === text.trim());
    handlePose(preset ? preset.key : `custom:${text.trim()}`, preset ? preset.value : text.trim());
  };

  const handleMakeModel = async (photo: Img): Promise<Img | null> => {
    let model: Img | null = null;
    await run('بنجهّز صورتك كموديل...', async () => {
      model = await makeModel(photo);
    });
    return model;
  };

  const handleSave = async () => {
    if (!currentImage || !subject) return;
    try {
      const look: SavedLook = {
        id: `look-${Date.now()}`,
        image: await compressForSave(currentImage),
        subject,
        names: activeLayers.map((l) => l.garment?.name).filter(Boolean) as string[],
        createdAt: Date.now(),
      };
      const next = [look, ...saved].slice(0, MAX_SAVED);
      if (!storeSaved(next)) {
        setError({ message: 'مساحة الحفظ في المتصفح اتملت. امسح شوية أطقم قديمة وجرّب تاني.' });
        return false;
      }
      setSaved(next);
      return true;
    } catch (err) {
      setError({ message: errorText(err) });
      return false;
    }
  };

  const handleDeleteSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    storeSaved(next);
    setSaved(next);
  };

  const handleOpenSaved = (look: SavedLook) => {
    if (isLoading) return;
    startWith(look.subject, fromDataUrl(look.image));
  };

  useEffect(() => {
    if (error) scrollToStage();
  }, [error]);

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-40 border-b border-cream-300/70 bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-wine text-white shadow-card">
              <HangerIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="text-lg font-extrabold">غرفة القياس</h1>
              <p className="truncate text-xs text-ink-muted">جرّب الهدوم على صورتك أو على مانيكان</p>
            </div>
          </div>
          {subject && (
            <button type="button" onClick={handleStartOver} disabled={isLoading} className="btn-ghost h-10 shrink-0 px-3.5 text-sm">
              <RestartIcon className="h-4 w-4" />
              ابدأ من جديد
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pt-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-8">
        <div className="flex min-w-0 flex-col gap-5">
          {!subject ? (
            <SubjectPicker
              busy={isLoading}
              onMakeModel={handleMakeModel}
              onUsePhoto={(img) => startWith('person', img)}
              onPickMannequin={(id) =>
                run('بنجهّز المانيكان...', async () => startWith('mannequin', await loadMannequin(id)))
              }
            />
          ) : (
            <>
              <Wardrobe
                garments={wardrobe}
                activeIds={activeGarmentIds}
                disabled={isLoading}
                onAdd={handleAddGarments}
                onSelect={handleGarmentSelect}
                onRemove={handleRemoveGarment}
              />
              <OutfitPanel
                subject={subject}
                layers={activeLayers}
                disabled={isLoading}
                onRemoveLast={handleRemoveLast}
                onColor={handleColor}
              />
              <EditsPanel
                subject={subject}
                poseKey={poseKey}
                readyPoses={currentLayer ? Object.keys(currentLayer.images) : []}
                disabled={isLoading}
                onPose={handlePose}
                onCustomPose={handleCustomPose}
                onBackground={handleBackground}
              />
            </>
          )}
          {saved.length > 0 && (
            <SavedLooks looks={saved} disabled={isLoading} onOpen={handleOpenSaved} onDelete={handleDeleteSaved} />
          )}
        </div>

        <div ref={stageRef} className="order-first min-w-0 scroll-mt-20 lg:order-none">
          <Stage
            image={currentImage}
            subject={subject}
            busy={busy}
            error={error}
            canSave={!!currentImage && !!subject}
            onDismissError={() => setError(null)}
            onSave={handleSave}
          />
        </div>
      </main>
    </div>
  );
}
