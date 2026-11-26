/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { OutfitLayer } from '../types';
import { Trash2Icon, SaveIcon, CheckCircleIcon } from './icons';

interface OutfitStackProps {
  outfitHistory: OutfitLayer[];
  onRemoveLastGarment: () => void;
  onColorSelect: (color: string) => void;
  onSaveOutfit: () => void;
  isLoading: boolean;
  colors: { name: string; hex: string }[];
}

const OutfitStack: React.FC<OutfitStackProps> = ({ outfitHistory, onRemoveLastGarment, onColorSelect, onSaveOutfit, isLoading, colors }) => {
  const [isSaved, setIsSaved] = useState(false);

  const handleSaveClick = () => {
    onSaveOutfit();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center border-b border-gray-400/50 pb-2 mb-3">
        <h2 className="text-xl font-serif tracking-wider text-gray-800">Outfit Stack</h2>
        {outfitHistory.length > 1 && (
            <button
                onClick={handleSaveClick}
                disabled={isLoading || isSaved}
                className="flex items-center text-sm font-semibold text-gray-700 bg-gray-100/80 hover:bg-gray-200/80 px-3 py-1.5 rounded-full transition-all disabled:opacity-60"
                aria-label={isSaved ? 'Outfit saved' : 'Save current outfit'}
            >
                {isSaved ? (
                    <>
                        <CheckCircleIcon className="w-4 h-4 mr-1.5 text-green-600" />
                        Saved!
                    </>
                ) : (
                    <>
                        <SaveIcon className="w-4 h-4 mr-1.5" />
                        Save Outfit
                    </>
                )}
            </button>
        )}
      </div>
      <div className="space-y-2">
        {outfitHistory.map((layer, index) => (
          <div key={layer.garment?.id || 'base'} className="animate-fade-in">
            <div
              className="flex items-center justify-between bg-white/50 p-2 rounded-lg border border-gray-200/80"
            >
              <div className="flex items-center overflow-hidden">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 mr-3 text-xs font-bold text-gray-600 bg-gray-200 rounded-full">
                    {index + 1}
                  </span>
                  {layer.garment && (
                      <img src={layer.garment.url} alt={layer.garment.name} className="flex-shrink-0 w-12 h-12 object-cover rounded-md mr-3" />
                  )}
                  <span className="font-semibold text-gray-800 truncate" title={layer.garment?.name}>
                    {layer.garment ? layer.garment.name : 'Base Model'}
                  </span>
              </div>
              {index > 0 && index === outfitHistory.length - 1 && (
                <button
                  onClick={onRemoveLastGarment}
                  className="flex-shrink-0 text-gray-500 hover:text-red-600 transition-colors p-2 rounded-md hover:bg-red-50"
                  aria-label={`Remove ${layer.garment?.name}`}
                >
                  <Trash2Icon className="w-5 h-5" />
                </button>
              )}
            </div>
            {index > 0 && index === outfitHistory.length - 1 && (
              <div className="mt-3 pl-9 animate-fade-in">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Recolor Garment</h3>
                <div className="flex flex-wrap gap-2">
                  {colors.map(color => (
                    <button
                      key={color.name}
                      onClick={() => onColorSelect(color.name)}
                      className="w-6 h-6 rounded-full border border-gray-300/50 transition-transform duration-150 ease-in-out hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{ backgroundColor: color.hex }}
                      aria-label={`Change color to ${color.name}`}
                      title={color.name}
                      disabled={isLoading}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {outfitHistory.length === 1 && (
            <p className="text-center text-sm text-gray-500 pt-4">Your stacked items will appear here. Select an item from the wardrobe below.</p>
        )}
      </div>
    </div>
  );
};

export default OutfitStack;