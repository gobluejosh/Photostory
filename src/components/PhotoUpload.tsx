"use client";

import { useCallback, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { processPhotos } from "@/lib/images";

export default function PhotoUpload() {
  const { state, dispatch } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setError(null);
      dispatch({ type: "SET_LOADING", isLoading: true, message: `Processing ${fileArray.length} photos...` });

      try {
        let totalProcessed = 0;
        let totalSkipped = 0;
        // Process in batches of 3 to keep memory low on mobile
        const batchSize = 3;
        for (let i = 0; i < fileArray.length; i += batchSize) {
          const batch = fileArray.slice(i, i + batchSize);
          const photos = await processPhotos(batch);
          totalSkipped += batch.filter((f) => f.type.startsWith("image/")).length - photos.length;
          if (photos.length > 0) {
            dispatch({ type: "ADD_PHOTOS", photos });
          }
          totalProcessed += photos.length;
          dispatch({
            type: "SET_LOADING",
            isLoading: true,
            message: `Processed ${Math.min(i + batchSize, fileArray.length)} of ${fileArray.length} photos...`,
          });
        }
        if (totalSkipped > 0) {
          setError(`${totalSkipped} photo(s) couldn't be processed (unsupported format). ${totalProcessed} added successfully.`);
        }
      } catch (err) {
        console.error("Photo processing error:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(`Error processing photos: ${message}`);
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
          Upload your photos and we'll craft a beautiful photo book
        </p>
        <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
          Go ahead and upload everything you might want to include — we'll curate the best shots together.
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

      {error && (
        <div className="mt-4 text-sm text-red-500">{error}</div>
      )}
    </div>
  );
}
