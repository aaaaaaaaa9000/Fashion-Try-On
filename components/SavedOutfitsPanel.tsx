/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { SavedOutfit } from '../types';
import { XIcon } from './icons';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedOutfitsPanelProps {
  savedOutfits: SavedOutfit[];
  onLoadOutfit: (outfit: SavedOutfit) => void;
  onDeleteOutfit: (outfitId: string) => void;
  isLoading: boolean;
}

const SavedOutfitsPanel: React.FC<SavedOutfitsPanelProps> = ({ savedOutfits, onLoadOutfit, onDeleteOutfit, isLoading }) => {
  return (
    <div className="pt-6 border-t border-gray-400/50">
      <h2 className="text-xl font-serif tracking-wider text-gray-800 mb-3">Saved Outfits</h2>
      {savedOutfits.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <AnimatePresence>
            {savedOutfits.map((outfit) => (
              <motion.div
                key={outfit.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
                className="relative group"
              >
                <button
                  onClick={() => onLoadOutfit(outfit)}
                  disabled={isLoading}
                  className="w-full aspect-square border rounded-lg overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={`Load saved outfit from ${new Date(parseInt(outfit.id.split('-')[1])).toLocaleString()}`}
                >
                  <img src={outfit.thumbnailUrl} alt="Saved outfit thumbnail" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-semibold">Load Outfit</p>
                  </div>
                </button>
                <button
                  onClick={() => onDeleteOutfit(outfit.id)}
                  className="absolute -top-2 -right-2 bg-white text-gray-600 hover:bg-red-500 hover:text-white rounded-full p-1 border shadow-md opacity-0 group-hover:opacity-100 transition-all duration-200"
                  aria-label="Delete saved outfit"
                >
                    <XIcon className="w-3 h-3"/>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500">Your saved outfits will appear here.</p>
      )}
    </div>
  );
};

export default SavedOutfitsPanel;
