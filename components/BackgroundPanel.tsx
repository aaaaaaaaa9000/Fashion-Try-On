/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface BackgroundPanelProps {
  onBackgroundSelect: (prompt: string) => void;
  isLoading: boolean;
}

const PREDEFINED_BACKGROUNDS = [
  { prompt: "A minimalist photography studio with a solid light gray background", label: "Studio" },
  { prompt: "A bright, sunny beach with a clear blue sky and calm ocean waves", label: "Beach" },
  { prompt: "A minimal studio background with a clean vertical split in the center: the left half is solid pure black, and the right half is bright vivid orange. Smooth floor that blends softly with the black side. Simple, modern, high-contrast background", label: "Split Tone" },
  { prompt: "A minimal studio background with a clean vertical split in the center: the left half is solid pure white, and the right half is bright vivid orange. Smooth floor that blends softly. Simple, modern, high-contrast background", label: "Vivid Split" }
];


const BackgroundPanel: React.FC<BackgroundPanelProps> = ({ onBackgroundSelect, isLoading }) => {
  const [customBackground, setCustomBackground] = useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = customBackground.trim();
    if (trimmedPrompt) {
      onBackgroundSelect(trimmedPrompt);
      setCustomBackground('');
    }
  };

  return (
    <div className="pt-6 border-t border-gray-400/50">
      <h2 className="text-xl font-serif tracking-wider text-gray-800 mb-3">Change Background</h2>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {PREDEFINED_BACKGROUNDS.map(({prompt, label}) => (
          <button
            key={label}
            title={prompt}
            onClick={() => onBackgroundSelect(prompt)}
            disabled={isLoading}
            className="w-full text-center text-sm font-medium text-gray-800 p-2 rounded-lg bg-gray-100/80 hover:bg-gray-200/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <input
          type="text"
          value={customBackground}
          onChange={(e) => setCustomBackground(e.target.value)}
          placeholder="Or describe a custom background..."
          className="w-full text-sm bg-white/50 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-800"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !customBackground.trim()}
          className="text-sm font-semibold bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Go
        </button>
      </form>
    </div>
  );
};

export default BackgroundPanel;