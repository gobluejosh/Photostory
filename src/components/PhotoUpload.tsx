"use client";

import { useCallback, useRef } from "react";
import { useApp } from "@/lib/store";
import { processPhotos } from "@/lib/images";

export default function PhotoUpload() {
  const { state, dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      dispatch({ type: "SET_LOADING", isLoading: true, message: `Processing ${fileArray.length} photos...` });

      try {
        // Process in batches of 10 to avoid blocking
        const batchSize = 10;
        for (let i = 0; i < fileArray.length; i += batchSize) {
          const batch = fileArray.slice(i, i + batchSize);
          const photos = await processPhotos(batch);
          dispatch({ type: "ADD_PHOTOS", photos });
          dispatch({
            type: "SET_LOADING",
            isLoading: true,
            message: `Processed ${Math.min(i + batchSize, fileArray.length)} of ${fileArray.length} photos...`,
          });
        }
      } finally {
        dispatch({ type: "SET_LOADING", isLoading: false });
      }
    },
    [dispatch]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-light tracking-tight mb-2">Photostory</h1>
        <p className="text-gray-500 text-sm">
          Upload your photos and let AI craft a beautiful photo book
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
      >
        <div className="text-4xl mb-4">+</div>
        <p className="text-gray-600 font-medium">Drop photos here or tap to browse</p>
        <p className="text-gray-400 text-sm mt-2">Supports JPG, PNG, HEIC</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {state.photos.length > 0 && (
        <div className="w-full mt-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{state.photos.length} photos added</p>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: "CLEAR_PHOTOS" })}
                className="text-sm text-red-400 hover:text-red-600"
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 rounded-xl overflow-hidden">
            {state.photos.slice(0, 24).map((photo) => (
              <div key={photo.id} className="aspect-square relative">
                <img
                  src={photo.thumbnailDataUrl}
                  alt={photo.fileName}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {state.photos.length > 24 && (
              <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                +{state.photos.length - 24}
              </div>
            )}
          </div>

          <button
            onClick={() => dispatch({ type: "SET_STEP", step: "interview" })}
            className="w-full mt-6 bg-black text-white rounded-full py-3 px-6 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Continue with {state.photos.length} photos
          </button>
        </div>
      )}

      {state.isLoading && (
        <div className="mt-6 text-sm text-gray-500 animate-pulse">{state.loadingMessage}</div>
      )}
    </div>
  );
}
