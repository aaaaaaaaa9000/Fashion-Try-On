
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StartScreen from './components/StartScreen';
import Canvas from './components/Canvas';
import WardrobePanel from './components/WardrobeModal';
import OutfitStack from './components/OutfitStack';
import { generateVirtualTryOnImage, generatePoseVariation, generateColorVariation, generateBackgroundVariation } from './services/geminiService';
import { OutfitLayer, WardrobeItem, SavedOutfit } from './types';
import { ChevronDownIcon, ChevronUpIcon } from './components/icons';
import { defaultWardrobe } from './wardrobe';
import Footer from './components/Footer';
import { getFriendlyErrorMessage } from './lib/utils';
import Spinner from './components/Spinner';
import SavedOutfitsPanel from './components/SavedOutfitsPanel';
import BackgroundPanel from './components/BackgroundPanel';

const PREDEFINED_POSES = [
  "Full frontal view, hands on hips",
  "Slightly turned, 3/4 view",
  "Side profile view",
  "Jumping in the air, mid-action shot",
  "Walking towards camera",
  "Leaning against a wall",
  "Sitting elegantly on a simple stool",
  "Walking away from the camera, full back view",
  "Glancing back over the shoulder",
  "Confident stance with arms crossed",
  "Hand on hip, looking down thoughtfully",
];

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Royal Blue', hex: '#3b82f6' },
  { name: 'Emerald Green', hex: '#10b981' },
  { name: 'Sunshine Yellow', hex: '#f59e0b' },
  { name: 'Classic Black', hex: '#111827' },
  { name: 'Crisp White', hex: '#f9fafb' },
  { name: 'Hot Pink', hex: '#ec4899' },
  { name: 'Burnt Orange', hex: '#f97316' },
];

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    // DEPRECATED: mediaQueryList.addListener(listener);
    mediaQueryList.addEventListener('change', listener);
    
    // Check again on mount in case it changed between initial state and effect runs
    if (mediaQueryList.matches !== matches) {
      setMatches(mediaQueryList.matches);
    }

    return () => {
      // DEPRECATED: mediaQueryList.removeListener(listener);
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query, matches]);

  return matches;
};


const App: React.FC = () => {
  const [modelImageUrl, setModelImageUrl] = useState<string | null>(null);
  const [outfitHistory, setOutfitHistory] = useState<OutfitLayer[]>([]);
  const [currentOutfitIndex, setCurrentOutfitIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(defaultWardrobe);
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [poseInstructions, setPoseInstructions] = useState<string[]>(PREDEFINED_POSES);
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    try {
      const storedOutfits = localStorage.getItem('vto-saved-outfits');
      if (storedOutfits) {
        setSavedOutfits(JSON.parse(storedOutfits));
      }
    } catch (error) {
      console.error("Failed to load saved outfits from local storage:", error);
    }
  }, []);

  const activeOutfitLayers = useMemo(() => 
    outfitHistory.slice(0, currentOutfitIndex + 1), 
    [outfitHistory, currentOutfitIndex]
  );
  
  const activeGarmentIds = useMemo(() => 
    activeOutfitLayers.map(layer => layer.garment?.id).filter(Boolean) as string[], 
    [activeOutfitLayers]
  );
  
  const displayImageUrl = useMemo(() => {
    if (outfitHistory.length === 0) return modelImageUrl;
    const currentLayer = outfitHistory[currentOutfitIndex];
    if (!currentLayer) return modelImageUrl;

    const poseInstruction = poseInstructions[currentPoseIndex];
    // Return the image for the current pose, or fallback to the first available image for the current layer.
    // This ensures an image is shown even while a new pose is generating.
    return currentLayer.poseImages[poseInstruction] ?? Object.values(currentLayer.poseImages)[0];
  }, [outfitHistory, currentOutfitIndex, currentPoseIndex, modelImageUrl, poseInstructions]);

  const availablePoseKeys = useMemo(() => {
    if (outfitHistory.length === 0) return [];
    const currentLayer = outfitHistory[currentOutfitIndex];
    return currentLayer ? Object.keys(currentLayer.poseImages) : [];
  }, [outfitHistory, currentOutfitIndex]);

  const handleModelFinalized = (url: string) => {
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [poseInstructions[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
  };

  const handleStartOver = () => {
    setModelImageUrl(null);
    setOutfitHistory([]);
    setCurrentOutfitIndex(0);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
    setCurrentPoseIndex(0);
    setIsSheetCollapsed(false);
    setWardrobe(defaultWardrobe);
    setPoseInstructions(PREDEFINED_POSES);
  };

  const handleGarmentSelect = useCallback(async (garmentFile: File, garmentInfo: WardrobeItem) => {
    if (!displayImageUrl || isLoading) return;

    // Caching: Check if we are re-applying a previously generated layer
    const nextLayer = outfitHistory[currentOutfitIndex + 1];
    if (nextLayer && nextLayer.garment?.id === garmentInfo.id) {
        setCurrentOutfitIndex(prev => prev + 1);
        setCurrentPoseIndex(0); // Reset pose when changing layer
        return;
    }

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Adding ${garmentInfo.name}...`);

    try {
      const newImageUrl = await generateVirtualTryOnImage(displayImageUrl, garmentFile);
      const currentPoseInstruction = poseInstructions[currentPoseIndex];
      
      const newLayer: OutfitLayer = { 
        garment: garmentInfo, 
        poseImages: { [currentPoseInstruction]: newImageUrl } 
      };

      setOutfitHistory(prevHistory => {
        // Cut the history at the current point before adding the new layer
        const newHistory = prevHistory.slice(0, currentOutfitIndex + 1);
        return [...newHistory, newLayer];
      });
      setCurrentOutfitIndex(prev => prev + 1);
      
      // Add to personal wardrobe if it's not already there
      setWardrobe(prev => {
        if (prev.find(item => item.id === garmentInfo.id)) {
            return prev;
        }
        return [...prev, garmentInfo];
      });
    } catch (err) {
      // Fix: Pass caught error directly; getFriendlyErrorMessage handles 'unknown' type.
      setError(getFriendlyErrorMessage(err, 'Failed to apply garment'));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentPoseIndex, outfitHistory, currentOutfitIndex, poseInstructions]);

  const handleRemoveLastGarment = () => {
    if (currentOutfitIndex > 0) {
      setCurrentOutfitIndex(prevIndex => prevIndex - 1);
      setCurrentPoseIndex(0); // Reset pose to default when removing a layer
    }
  };
  
  const handlePoseSelect = useCallback(async (newIndex: number) => {
    if (isLoading || outfitHistory.length === 0 || newIndex === currentPoseIndex) return;
    
    const poseInstruction = poseInstructions[newIndex];
    const currentLayer = outfitHistory[currentOutfitIndex];

    // If pose already exists, just update the index to show it.
    if (currentLayer.poseImages[poseInstruction]) {
      setCurrentPoseIndex(newIndex);
      return;
    }

    // Pose doesn't exist, so generate it.
    // Use an existing image from the current layer as the base.
    const baseImageForPoseChange = Object.values(currentLayer.poseImages)[0];
    if (!baseImageForPoseChange) return; // Should not happen

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Changing pose...`);
    
    const prevPoseIndex = currentPoseIndex;
    // Optimistically update the pose index so the pose name changes in the UI
    setCurrentPoseIndex(newIndex);

    try {
      const newImageUrl = await generatePoseVariation(baseImageForPoseChange, poseInstruction);
      setOutfitHistory(prevHistory => {
        const newHistory = [...prevHistory];
        const updatedLayer = newHistory[currentOutfitIndex];
        updatedLayer.poseImages[poseInstruction] = newImageUrl;
        return newHistory;
      });
    } catch (err) {
      // Fix: Pass caught error directly; getFriendlyErrorMessage handles 'unknown' type.
      setError(getFriendlyErrorMessage(err, 'Failed to change pose'));
      // Revert pose index on failure
      setCurrentPoseIndex(prevPoseIndex);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex, poseInstructions]);

  const handleCustomPoseSubmit = useCallback(async (customPoseInstruction: string) => {
    const instruction = customPoseInstruction.trim();
    if (isLoading || outfitHistory.length === 0 || !instruction) return;

    const existingIndex = poseInstructions.findIndex(p => p.toLowerCase() === instruction.toLowerCase());

    if (existingIndex !== -1) {
      handlePoseSelect(existingIndex);
      return;
    }

    // New pose
    const newIndex = poseInstructions.length;
    const originalPoseInstructions = [...poseInstructions];
    setPoseInstructions(prev => [...prev, instruction]);
    
    const currentLayer = outfitHistory[currentOutfitIndex];
    const baseImageForPoseChange = Object.values(currentLayer.poseImages)[0];
    if (!baseImageForPoseChange) {
      setPoseInstructions(originalPoseInstructions); // revert
      return;
    }

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Creating custom pose...`);

    const prevPoseIndex = currentPoseIndex;
    setCurrentPoseIndex(newIndex);

    try {
      const newImageUrl = await generatePoseVariation(baseImageForPoseChange, instruction);
      setOutfitHistory(prevHistory => {
        const newHistory = [...prevHistory];
        const updatedLayer = newHistory[currentOutfitIndex];
        if(updatedLayer) {
          updatedLayer.poseImages[instruction] = newImageUrl;
        }
        return newHistory;
      });
    } catch (err) {
      // Fix: Pass caught error directly; getFriendlyErrorMessage handles 'unknown' type.
      setError(getFriendlyErrorMessage(err, 'Failed to create custom pose'));
      setCurrentPoseIndex(prevPoseIndex);
      setPoseInstructions(originalPoseInstructions); // revert on error
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [isLoading, outfitHistory, currentOutfitIndex, currentPoseIndex, poseInstructions, handlePoseSelect]);


  const handleColorSelect = useCallback(async (colorName: string) => {
    if (!displayImageUrl || isLoading) return;

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Recoloring to ${colorName}...`);

    try {
        const newImageUrl = await generateColorVariation(displayImageUrl, colorName);

        setOutfitHistory(prevHistory => {
            const newHistory = [...prevHistory];
            const currentLayer = newHistory[currentOutfitIndex];
            if (currentLayer) {
                const currentPoseInstruction = poseInstructions[currentPoseIndex];
                currentLayer.poseImages[currentPoseInstruction] = newImageUrl;
            }
            return newHistory;
        });

    } catch (err) {
        // Fix: Pass caught error directly; getFriendlyErrorMessage handles 'unknown' type.
        setError(getFriendlyErrorMessage(err, 'Failed to change color'));
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentOutfitIndex, currentPoseIndex, poseInstructions]);

  const handleBackgroundSelect = useCallback(async (backgroundPrompt: string) => {
    if (!displayImageUrl || isLoading) return;

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Changing background...`);

    try {
        const newImageUrl = await generateBackgroundVariation(displayImageUrl, backgroundPrompt);

        setOutfitHistory(prevHistory => {
            const newHistory = [...prevHistory];
            const currentLayer = newHistory[currentOutfitIndex];
            if (currentLayer) {
                const currentPoseInstruction = poseInstructions[currentPoseIndex];
                currentLayer.poseImages[currentPoseInstruction] = newImageUrl;
            }
            return newHistory;
        });

    } catch (err) {
        // Fix: Pass caught error directly; getFriendlyErrorMessage handles 'unknown' type.
        setError(getFriendlyErrorMessage(err, 'Failed to change background'));
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, currentOutfitIndex, currentPoseIndex, poseInstructions]);

  const handleSaveOutfit = useCallback(() => {
    if (!displayImageUrl || activeOutfitLayers.length <= 1) return;

    const currentPoseInstruction = poseInstructions[currentPoseIndex];
    
    // Create a lean version of the history to save, to avoid exceeding localStorage quota.
    const historyToSave = outfitHistory
      .slice(0, currentOutfitIndex + 1)
      .map(layer => {
        const activePoseImage = layer.poseImages[currentPoseInstruction];
        
        if (activePoseImage) {
          // If the current pose exists for this layer, only save that one.
          return {
            ...layer,
            poseImages: { [currentPoseInstruction]: activePoseImage },
          };
        } else {
          // As a fallback, save the first available pose for this layer.
          // This ensures the layer is still valid even if the current pose wasn't generated for it.
          const firstPoseInstruction = Object.keys(layer.poseImages)[0];
          if (firstPoseInstruction) {
            return {
              ...layer,
              poseImages: { [firstPoseInstruction]: layer.poseImages[firstPoseInstruction] },
            };
          }
          // Should not happen, but return the layer as is if it has no images.
          return layer;
        }
      });

    const newSavedOutfit: SavedOutfit = {
      id: `outfit-${Date.now()}`,
      thumbnailUrl: displayImageUrl,
      modelImageUrl: modelImageUrl,
      outfitHistory: historyToSave,
      currentOutfitIndex: currentOutfitIndex,
      currentPoseIndex: currentPoseIndex,
    };

    setSavedOutfits(prev => {
      const updatedOutfits = [...prev, newSavedOutfit];
      try {
        localStorage.setItem('vto-saved-outfits', JSON.stringify(updatedOutfits));
      } catch (error) {
        console.error("Failed to save outfit to local storage:", error);
        let errorMessage = "Could not save outfit. Your browser's storage might be full or disabled.";
        if (error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('quota'))) {
            errorMessage = "Could not save outfit: storage quota exceeded. Please delete some saved outfits to make space.";
        }
        setError(errorMessage);
      }
      return updatedOutfits;
    });
  }, [displayImageUrl, modelImageUrl, outfitHistory, currentOutfitIndex, currentPoseIndex, poseInstructions, activeOutfitLayers.length]);

  const handleLoadOutfit = (outfitToLoad: SavedOutfit) => {
    if (isLoading) return;
    setModelImageUrl(outfitToLoad.modelImageUrl);
    setOutfitHistory(outfitToLoad.outfitHistory);
    setCurrentOutfitIndex(outfitToLoad.currentOutfitIndex);
    setCurrentPoseIndex(outfitToLoad.currentPoseIndex);
    setError(null);
    setIsSheetCollapsed(false);
  };

  const handleDeleteOutfit = (outfitId: string) => {
    setSavedOutfits(prev => {
      const updatedOutfits = prev.filter(outfit => outfit.id !== outfitId);
      try {
        localStorage.setItem('vto-saved-outfits', JSON.stringify(updatedOutfits));
      } catch (error) {
        console.error("Failed to update local storage after deleting outfit:", error);
        let errorMessage = "Could not update saved outfits. Your browser's storage might be full or disabled.";
        if (error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('quota'))) {
            errorMessage = "Could not save changes: storage quota exceeded.";
        }
        setError(errorMessage);
      }
      return updatedOutfits;
    });
  };

  const viewVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
  };

  return (
    <div className="font-sans">
      <AnimatePresence mode="wait">
        {!modelImageUrl ? (
          <motion.div
            key="start-screen"
            className="w-screen min-h-screen flex items-start sm:items-center justify-center bg-gray-50 p-4 pb-20"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartScreen onModelFinalized={handleModelFinalized} />
          </motion.div>
        ) : (
          <motion.div
            key="main-app"
            className="relative flex flex-col h-screen bg-white overflow-hidden"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <main className="flex-grow relative flex flex-col md:flex-row overflow-hidden">
              <div className="w-full h-full flex-grow flex items-center justify-center bg-white pb-16 relative">
                <Canvas 
                  displayImageUrl={displayImageUrl}
                  onStartOver={handleStartOver}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  onSelectPose={handlePoseSelect}
                  onCustomPoseSubmit={handleCustomPoseSubmit}
                  poseInstructions={poseInstructions}
                  currentPoseIndex={currentPoseIndex}
                  availablePoseKeys={availablePoseKeys}
                />
              </div>

              <aside 
                className={`absolute md:relative md:flex-shrink-0 bottom-0 right-0 h-auto md:h-full w-full md:w-1/3 md:max-w-sm bg-white/80 backdrop-blur-md flex flex-col border-t md:border-t-0 md:border-l border-gray-200/60 transition-transform duration-500 ease-in-out ${isSheetCollapsed ? 'translate-y-[calc(100%-4.5rem)]' : 'translate-y-0'} md:translate-y-0`}
                style={{ transitionProperty: 'transform' }}
              >
                  <button 
                    onClick={() => setIsSheetCollapsed(!isSheetCollapsed)} 
                    className="md:hidden w-full h-8 flex items-center justify-center bg-gray-100/50"
                    aria-label={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
                  >
                    {isSheetCollapsed ? <ChevronUpIcon className="w-6 h-6 text-gray-500" /> : <ChevronDownIcon className="w-6 h-6 text-gray-500" />}
                  </button>
                  <div className="p-4 md:p-6 pb-20 overflow-y-auto flex-grow flex flex-col gap-8">
                    {error && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                      </div>
                    )}
                    <OutfitStack 
                      outfitHistory={activeOutfitLayers}
                      onRemoveLastGarment={handleRemoveLastGarment}
                      onColorSelect={handleColorSelect}
                      onSaveOutfit={handleSaveOutfit}
                      isLoading={isLoading}
                      colors={COLORS}
                    />
                    {outfitHistory.length > 0 && (
                        <BackgroundPanel
                            onBackgroundSelect={handleBackgroundSelect}
                            isLoading={isLoading}
                        />
                    )}
                    <SavedOutfitsPanel
                        savedOutfits={savedOutfits}
                        onLoadOutfit={handleLoadOutfit}
                        onDeleteOutfit={handleDeleteOutfit}
                        isLoading={isLoading}
                    />
                    <WardrobePanel
                      onGarmentSelect={handleGarmentSelect}
                      activeGarmentIds={activeGarmentIds}
                      isLoading={isLoading}
                      wardrobe={wardrobe}
                    />
                  </div>
              </aside>
            </main>
            <AnimatePresence>
              {isLoading && isMobile && (
                <motion.div
                  className="fixed inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Spinner />
                  {loadingMessage && (
                    <p className="text-lg font-serif text-gray-700 mt-4 text-center px-4">{loadingMessage}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer isOnDressingScreen={!!modelImageUrl} />
    </div>
  );
};

export default App;
