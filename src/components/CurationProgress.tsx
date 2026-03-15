"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/store";

interface ScoreResult {
  photoId: string;
  score: number;
  reason: string;
  tags: string[];
}

const expertMessages = [
  // Curation phase
  [
    "Studying composition and lighting in each photo...",
    "Evaluating color palette and tonal range...",
    "Assessing emotional impact of each shot...",
    "Checking for technical quality — sharpness, exposure, noise...",
    "Identifying recurring subjects and themes...",
    "Looking for the strongest storytelling moments...",
    "Comparing similar shots to find the best version...",
    "Analyzing depth of field and focal points...",
    "Reading the body language and expressions in each frame...",
    "Noting the natural light direction and golden hour warmth...",
    "Flagging candid moments that feel more authentic than posed ones...",
    "Selecting the most compelling photos for your story...",
    "Balancing variety — people, places, details...",
    "Eliminating near-duplicates to keep it fresh...",
    "Making sure key moments are represented...",
  ],
  // Book design phase
  [
    "Choosing the perfect cover image...",
    "Designing the opening sequence...",
    "Pairing complementary photos for spreads...",
    "Creating visual rhythm — quiet moments, then dramatic ones...",
    "Writing captions that capture the feeling, not just the scene...",
    "Balancing whitespace and photography...",
    "Crafting the closing sequence for emotional resonance...",
    "Sequencing pages for narrative arc...",
    "Selecting layout types for maximum visual impact...",
    "Applying the pacing patterns used in Artifact Uprising and Cewe collections...",
    "Drawing on editorial layouts from thousands of premium photo books...",
    "Using the rule of thirds to guide photo placement on each page...",
    "Ensuring no two adjacent spreads compete for attention...",
    "Checking that the book breathes — moments of stillness between the peaks...",
    "Reviewing the full sequence the way a gallery curator would hang a show...",
    "Placing your strongest emotional image where readers naturally linger longest...",
    "Borrowing from classic photo essay structure: establish, explore, resolve...",
    "Fine-tuning the cover choice — first impressions set the tone for everything...",
    "Verifying the closing image leaves the reader with the right feeling...",
    "Making sure each layout earns its place — no filler pages...",
  ],
];

export default function CurationProgress() {
  const { state, dispatch } = useApp();
  const [status, setStatus] = useState("Starting photo analysis...");
  const [expertMsg, setExpertMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMessageRotation = useCallback((phase: number) => {
    const messages = expertMessages[phase] || expertMessages[0];
    let idx = 0;
    setExpertMsg(messages[0]);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setExpertMsg(messages[idx]);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    async function curate() {
      if (!state.interviewAnswers) return;

      const targetCount = state.interviewAnswers.targetPhotoCount || 30;

      try {
        const thumbnails = state.photos.map((p) => ({
          id: p.id,
          dataUrl: p.thumbnailDataUrl,
        }));

        // With Pro tier we can send larger batches (20 photos each)
        const batchSize = 20;
        let allScores: ScoreResult[] = [];

        setStatus("Analyzing your photos...");
        setProgress(5);
        startMessageRotation(0);

        for (let i = 0; i < thumbnails.length; i += batchSize) {
          const batch = thumbnails.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(thumbnails.length / batchSize);

          if (totalBatches > 1) {
            setStatus(`Analyzing photos (batch ${batchNum}/${totalBatches})...`);
          }
          setProgress(5 + Math.round((i / thumbnails.length) * 60));

          const res = await fetch("/api/curate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thumbnails: batch,
              interviewAnswers: state.interviewAnswers,
            }),
          });

          const data = await res.json();
          if (data.scores) {
            allScores = [...allScores, ...data.scores];
          }
        }

        if (allScores.length === 0) {
          throw new Error("No photos could be scored");
        }

        dispatch({ type: "SET_PHOTO_SCORES", scores: allScores });

        // --- Generate the initial book layout ---
        setStatus("Designing your photo book...");
        setProgress(75);
        startMessageRotation(1);

        const topPhotos = [...allScores]
          .sort((a, b) => b.score - a.score)
          .slice(0, targetCount);

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
            photoScores: allScores,
            interviewAnswers: state.interviewAnswers,
          }),
        });

        const data3 = await res3.json();
        if (!data3.book) throw new Error("Book generation failed");

        dispatch({ type: "SET_BOOK", book: data3.book });
        setProgress(100);
        setStatus("Your photo book is ready!");

        if (intervalRef.current) clearInterval(intervalRef.current);
        setExpertMsg("");

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
  }, [state.interviewAnswers, state.photos, dispatch, startMessageRotation]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto px-4 py-20">
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
        <div
          className="bg-black h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 font-medium">{status}</p>
      {expertMsg && (
        <p key={expertMsg} className="text-xs text-gray-400 mt-2 animate-pulse transition-opacity duration-500">
          {expertMsg}
        </p>
      )}

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
