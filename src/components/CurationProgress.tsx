"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

export default function CurationProgress() {
  const { state, dispatch } = useApp();
  const [status, setStatus] = useState("Starting photo analysis...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function curate() {
      if (!state.interviewAnswers) return;

      try {
        // Pass 1: Score all photos with thumbnails
        setStatus("Analyzing all photos...");
        setProgress(10);

        const thumbnails = state.photos.map((p) => ({
          id: p.id,
          dataUrl: p.thumbnailDataUrl,
        }));

        const res1 = await fetch("/api/curate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thumbnails,
            interviewAnswers: state.interviewAnswers,
            pass: "first",
          }),
        });

        const data1 = await res1.json();
        if (!data1.scores) throw new Error("First pass failed");

        setProgress(50);
        setStatus("Narrowing down the best shots...");

        // Keep top ~40 photos from first pass
        const sortedScores = [...data1.scores].sort(
          (a: { score: number }, b: { score: number }) => b.score - a.score
        );
        const shortlistIds = new Set(
          sortedScores.slice(0, Math.min(40, sortedScores.length)).map((s: { photoId: string }) => s.photoId)
        );
        const shortlistThumbnails = thumbnails.filter((t) => shortlistIds.has(t.id));

        // Pass 2: Re-evaluate shortlist with story context
        setStatus("Selecting final photos for your story...");
        setProgress(70);

        const res2 = await fetch("/api/curate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thumbnails: shortlistThumbnails,
            interviewAnswers: state.interviewAnswers,
            pass: "second",
          }),
        });

        const data2 = await res2.json();
        if (!data2.scores) throw new Error("Second pass failed");

        dispatch({ type: "SET_PHOTO_SCORES", scores: data2.scores });

        // Now generate the initial book layout
        setStatus("Designing your photo book...");
        setProgress(85);

        const topPhotos = [...data2.scores]
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .slice(0, 30);

        const availablePhotos = topPhotos.map((s: { photoId: string }) => {
          const photo = state.photos.find((p) => p.id === s.photoId);
          return {
            id: s.photoId,
            thumbnailDataUrl: photo?.thumbnailDataUrl || "",
          };
        }).filter((p: { thumbnailDataUrl: string }) => p.thumbnailDataUrl);

        const res3 = await fetch("/api/edit-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generateInitial: true,
            availablePhotos,
            photoScores: data2.scores,
            interviewAnswers: state.interviewAnswers,
          }),
        });

        const data3 = await res3.json();
        if (!data3.book) throw new Error("Book generation failed");

        dispatch({ type: "SET_BOOK", book: data3.book });
        setProgress(100);
        setStatus("Your photo book is ready!");

        setTimeout(() => {
          dispatch({ type: "SET_STEP", step: "book" });
        }, 800);
      } catch (error) {
        console.error("Curation error:", error);
        setStatus("Something went wrong. Please try again.");
      }
    }

    curate();
  }, [state.interviewAnswers, state.photos, dispatch]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto px-4 py-20">
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
        <div
          className="bg-black h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 animate-pulse">{status}</p>

      {/* Show some photos being analyzed */}
      <div className="flex gap-1 mt-8 opacity-40">
        {state.photos.slice(0, 5).map((photo) => (
          <div key={photo.id} className="w-12 h-12 rounded overflow-hidden">
            <img
              src={photo.thumbnailDataUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
