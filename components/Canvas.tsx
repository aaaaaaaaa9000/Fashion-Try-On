/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { RotateCcwIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from './icons';
import Spinner from './Spinner';
import { AnimatePresence, motion } from 'framer-motion';

interface CanvasProps {
  displayImageUrl: string | null;
  onStartOver: () => void;
  isLoading: boolean;
  loadingMessage: string;
  onSelectPose: (index: number) => void;
  onCustomPoseSubmit: (instruction: string) => void;
  poseInstructions: string[];
  currentPoseIndex: number;
  availablePoseKeys: string[];
}

const Canvas: React.FC<CanvasProps> = ({ displayImageUrl, onStartOver, isLoading, loadingMessage, onSelectPose, onCustomPoseSubmit, poseInstructions, currentPoseIndex, availablePoseKeys }) => {
  const [isPoseMenuOpen, setIsPoseMenuOpen] = useState(false);
  const [customPose, setCustomPose] = useState('');

  const handleDownload = () => {
    if (!displayImageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        // Fallback for browsers that don't support canvas or context
        const link = document.createElement('a');
        link.href = displayImageUrl;
        link.download = `virtual-try-on-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // Fill background with white, otherwise transparent areas will be black.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0);

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.9); // Quality set to 90%

      const link = document.createElement('a');
      link.href = jpgDataUrl;
      link.download = `virtual-try-on-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = (err) => {
        console.error("Failed to load image for conversion:", err);
        // Fallback to direct download if image loading for canvas fails
        const link = document.createElement('a');
        link.href = displayImageUrl;
        link.download = `virtual-try-on-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    img.src = displayImageUrl;
  };
  
  const handlePreviousPose = () => {
    if (isLoading || availablePoseKeys.length <= 1) return;

    const currentPoseInstruction = poseInstructions[currentPoseIndex];
    const currentIndexInAvailable = availablePoseKeys.indexOf(currentPoseInstruction);
    
    // Fallback if current pose not in available list (shouldn't happen)
    if (currentIndexInAvailable === -1) {
        onSelectPose((currentPoseIndex - 1 + poseInstructions.length) % poseInstructions.length);
        return;
    }

    const prevIndexInAvailable = (currentIndexInAvailable - 1 + availablePoseKeys.length) % availablePoseKeys.length;
    const prevPoseInstruction = availablePoseKeys[prevIndexInAvailable];
    const newGlobalPoseIndex = poseInstructions.indexOf(prevPoseInstruction);
    
    if (newGlobalPoseIndex !== -1) {
        onSelectPose(newGlobalPoseIndex);
    }
  };

  const handleNextPose = () => {
    if (isLoading) return;

    const currentPoseInstruction = poseInstructions[currentPoseIndex];
    const currentIndexInAvailable = availablePoseKeys.indexOf(currentPoseInstruction);

    // Fallback or if there are no generated poses yet
    if (currentIndexInAvailable === -1 || availablePoseKeys.length === 0) {
        onSelectPose((currentPoseIndex + 1) % poseInstructions.length);
        return;
    }
    
    const nextIndexInAvailable = currentIndexInAvailable + 1;
    if (nextIndexInAvailable < availablePoseKeys.length) {
        // There is another generated pose, navigate to it
        const nextPoseInstruction = availablePoseKeys[nextIndexInAvailable];
        const newGlobalPoseIndex = poseInstructions.indexOf(nextPoseInstruction);
        if (newGlobalPoseIndex !== -1) {
            onSelectPose(newGlobalPoseIndex);
        }
    } else {
        // At the end of generated poses, generate the next one from the master list
        const newGlobalPoseIndex = (currentPoseIndex + 1) % poseInstructions.length;
        onSelectPose(newGlobalPoseIndex);
    }
  };

  const handleCustomPoseFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !customPose.trim()) return;
    onCustomPoseSubmit(customPose);
    setCustomPose('');
    setIsPoseMenuOpen(false);
  };
  
  return (
    <div className="w-full h-full flex items-center justify-center p-4 relative animate-zoom-in group">
      {/* Action Buttons */}
      <div className="absolute top-4 left-4 z-30">
        <button 
            onClick={onStartOver}
            className="flex items-center justify-center text-center bg-white/60 border border-gray-300/80 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-200 ease-in-out hover:bg-white hover:border-gray-400 active:scale-95 text-sm backdrop-blur-sm"
        >
            <RotateCcwIcon className="w-4 h-4 mr-2" />
            Start Over
        </button>
      </div>
      <div className="absolute top-4 right-4 z-30">
        <button
          onClick={handleDownload}
          disabled={isLoading || !displayImageUrl}
          className="flex items-center justify-center bg-white/60 border border-gray-300/80 text-gray-700 font-semibold py-2 px-4 rounded-full transition-all duration-200 ease-in-out hover:bg-white hover:border-gray-400 active:scale-95 text-sm backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Download image"
        >
          <DownloadIcon className="w-4 h-4 mr-2" />
          Download
        </button>
      </div>


      {/* Image Display or Placeholder */}
      <div className="relative w-full h-full flex items-center justify-center">
        {displayImageUrl ? (
          <img
            key={displayImageUrl} // Use key to force re-render and trigger animation on image change
            src={displayImageUrl}
            alt="Virtual try-on model"
            className="max-w-full max-h-full object-contain transition-opacity duration-500 animate-fade-in rounded-lg"
          />
        ) : (
            <div className="w-[400px] h-[600px] bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center">
              <Spinner />
              <p className="text-md font-serif text-gray-600 mt-4">Loading Model...</p>
            </div>
        )}
        
        <AnimatePresence>
          {isLoading && (
              <motion.div
                  className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-20 rounded-lg"
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
      </div>

      {/* Pose Controls */}
      {displayImageUrl && !isLoading && (
        <div 
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onMouseEnter={() => setIsPoseMenuOpen(true)}
          onMouseLeave={() => setIsPoseMenuOpen(false)}
        >
          {/* Pose popover menu */}
          <AnimatePresence>
              {isPoseMenuOpen && (
                  <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute bottom-full mb-3 w-72 bg-white/80 backdrop-blur-lg rounded-xl p-2 border border-gray-200/80"
                  >
                      <div className="grid grid-cols-2 gap-2">
                          {poseInstructions.map((pose, index) => (
                              <button
                                  key={pose}
                                  onClick={() => onSelectPose(index)}
                                  disabled={isLoading || index === currentPoseIndex}
                                  className="w-full text-left text-sm font-medium text-gray-800 p-2 rounded-md hover:bg-gray-200/70 disabled:opacity-50 disabled:bg-gray-200/70 disabled:font-bold disabled:cursor-not-allowed"
                              >
                                  {pose}
                              </button>
                          ))}
                      </div>
                      <form onSubmit={handleCustomPoseFormSubmit} className="mt-3 pt-3 border-t border-gray-300/60 flex gap-2">
                        <input
                          type="text"
                          value={customPose}
                          onChange={(e) => setCustomPose(e.target.value)}
                          placeholder="Or type a custom pose..."
                          className="w-full text-sm bg-white/50 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-800"
                          disabled={isLoading}
                        />
                        <button
                          type="submit"
                          disabled={isLoading || !customPose.trim()}
                          className="text-sm font-semibold bg-gray-800 text-white px-3 py-1 rounded-md hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          Go
                        </button>
                      </form>
                  </motion.div>
              )}
          </AnimatePresence>
          
          <div className="flex items-center justify-center gap-2 bg-white/60 backdrop-blur-md rounded-full p-2 border border-gray-300/50">
            <button 
              onClick={handlePreviousPose}
              aria-label="Previous pose"
              className="p-2 rounded-full hover:bg-white/80 active:scale-90 transition-all disabled:opacity-50"
              disabled={isLoading}
            >
              <ChevronLeftIcon className="w-5 h-5 text-gray-800" />
            </button>
            <span className="text-sm font-semibold text-gray-800 w-48 text-center truncate" title={poseInstructions[currentPoseIndex]}>
              {poseInstructions[currentPoseIndex]}
            </span>
            <button 
              onClick={handleNextPose}
              aria-label="Next pose"
              className="p-2 rounded-full hover:bg-white/80 active:scale-90 transition-all disabled:opacity-50"
              disabled={isLoading}
            >
              <ChevronRightIcon className="w-5 h-5 text-gray-800" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;