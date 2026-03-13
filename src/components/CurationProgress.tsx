"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

interface ScoreResult {
  photoId: string;
  score: number;
  reason: string;
  tags: string[];
  contentHash: string;
}

export default function CurationProgress() {
  const { state, dispatch } = useApp();
  const [status, setStatus] = useState("Starting photo analysis...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function curate() {
      if (!state.interviewAnswers) return;

      try {
        const thumbnails = state.photos.map((p) => ({
          id: p.id,
          dataUrl: p.thumbnailDataUrl,
        }));

        // --- Pass 1: Score all photos in small client-side batches ---
        setStatus("Analyzing your photos...");
        setProgress(5);

        const batchSize = 8; // small enough to complete within Vercel timeout
        let allFirstPassScores: ScoreResult[] = [];

        for (let i = 0; i < thumbnails.length; i += batchSize) {
          const batch = thumbnails.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(thumbnails.length / batchSize);

          setStatus(`Analyzing photos (batch ${batchNum}/${totalBatches})...`);
          setProgress(5 + Math.round((i / thumbnails.length) * 40));

          const res = await fetch("/api/curate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thumbnails: batch,
              interviewAnswers: state.interviewAnswers,
              pass: "first",
            }),
          });

          const data = await res.json();
          if (data.scores) {
            allFirstPassScores = [...allFirstPassScores, ...data.scores];
          }
        }

        if (allFirstPassScores.length === 0) {
          throw new Error("No photos could be scored");
        }

        // --- Shortlist: keep top ~40 from first pass ---
        setProgress(50);
        setStatus("Narrowing down the best shots...");

        const sortedScores = [...allFirstPassScores].sort((a, b) => b.score - a.score);
        const shortlistIds = new Set(
          sortedScores.slice(0, Math.min(40, sortedScores.length)).map((s) => s.photoId)
        );
        const shortlistThumbnails = thumbnails.filter((t) => shortlistIds.has(t.id));

        // --- Pass 2: Re-evaluate shortlist in batches with cross-batch dedup ---
        let allSecondPassScores: ScoreResult[] = [];

        for (let i = 0; i < shortlistThumbnails.length; i += batchSize) {
          const batch = shortlistThumbnails.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(shortlistThumbnails.length / batchSize);

          setStatus(`Final selection (batch ${batchNum}/${totalBatches})...`);
          setProgress(55 + Math.round((i / shortlistThumbnails.length) * 25));

          // Pass content hashes from previously scored batches for dedup
          const previousContentHashes = allSecondPassScores
            .filter((s) => s.score >= 7)
            .map((s) => s.contentHash);

          const res = await fetch("/api/curate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thumbnails: batch,
              interviewAnswers: state.interviewAnswers,
              pass: "second",
              previousContentHashes,
            }),
          });

          const data = await res.json();
          if (data.scores) {
            allSecondPassScores = [...allSecondPassScores, ...data.scores];
          }
        }

        if (allSecondPassScores.length === 0) {
          throw new Error("Final selection failed");
        }

        dispatch({ type: "SET_PHOTO_SCORES", scores: allSecondPassScores });

        // --- Generate the initial book layout ---
        setStatus("Designing your photo book...");
        setProgress(85);

        const topPhotos = [...allSecondPassScores]
          .sort((a, b) => b.score - a.score)
          .slice(0, 30);

        const availablePhotos = topPhotos
          .map((s) => {
            const photo = state.photos.find((p) => p.id === s.photoId);
            return {
              id: s.photoId,
              thumbnailDataUrl: photo?.thumbnailDataUrl || "",
            };
          })
          .filter((p) => p.thumbnailDataUrl);

        const res3 = await fetch("/api/edit-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generateInitial: true,
            availablePhotos,
            photoScores: allSecondPassScores,
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
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(`Something went wrong: ${message}`);
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
