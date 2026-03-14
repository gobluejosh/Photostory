"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/store";

interface ScoreResult {
  photoId: string;
  score: number;
  reason: string;
  tags: string[];
  contentHash: string;
}

const expertMessages = [
  // Analysis phase
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
  ],
  // Shortlisting phase
  [
    "Selecting the most compelling photos for your story...",
    "Balancing variety — people, places, details...",
    "Eliminating near-duplicates to keep it fresh...",
    "Considering the narrative flow between shots...",
    "Making sure key moments are represented...",
    "Weighing emotional resonance against technical quality...",
    "Applying principles from award-winning photo book curation...",
    "Checking that the selection tells a complete story with no gaps...",
    "Ensuring the mix of close-ups, mid-range, and wide shots feels natural...",
    "Identifying the one hero shot that anchors the whole collection...",
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
    "Calibrating the text-to-image ratio — the photos should always be the star...",
    "Checking that the book breathes — moments of stillness between the peaks...",
    "Reviewing the full sequence the way a gallery curator would hang a show...",
    "Placing your strongest emotional image where readers naturally linger longest...",
    "Borrowing from classic photo essay structure: establish, explore, resolve...",
    "Fine-tuning the cover choice — first impressions set the tone for everything...",
    "Verifying the closing image leaves the reader with the right feeling...",
    "Applying lessons from studying millions of professionally designed photo books...",
    "Making sure each layout earns its place — no filler pages...",
  ],
];

export default function CurationProgress() {
  const { state, dispatch } = useApp();
  const [status, setStatus] = useState("Starting photo analysis...");
  const [expertMsg, setExpertMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate through expert messages for the current phase
  const startMessageRotation = useCallback((phase: number) => {
    phaseRef.current = phase;
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

      // Use the user's requested photo count, default to 30
      const targetCount = state.interviewAnswers.targetPhotoCount || 30;
      // Shortlist should be ~1.5x the target to give the second pass enough to work with
      const shortlistSize = Math.max(targetCount, Math.round(targetCount * 1.5));

      try {
        const thumbnails = state.photos.map((p) => ({
          id: p.id,
          dataUrl: p.thumbnailDataUrl,
        }));

        const batchSize = 8; // small enough to complete within Vercel timeout
        let allFirstPassScores: ScoreResult[] = [];

        // Check if Pass 1 was already done in the background during the interview
        if (state.photoScores.length > 0) {
          allFirstPassScores = state.photoScores as ScoreResult[];
          setStatus("Photo analysis complete — refining selection...");
          setProgress(45);
          startMessageRotation(0);
        } else {
          // --- Pass 1: Score all photos in small client-side batches ---
          setStatus("Analyzing your photos...");
          setProgress(5);
          startMessageRotation(0);

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
        }

        if (allFirstPassScores.length === 0) {
          throw new Error("No photos could be scored");
        }

        // --- Shortlist: keep top ~40 from first pass ---
        setProgress(50);
        setStatus("Narrowing down the best shots...");
        startMessageRotation(1);

        const sortedScores = [...allFirstPassScores].sort((a, b) => b.score - a.score);
        const shortlistIds = new Set(
          sortedScores.slice(0, Math.min(shortlistSize, sortedScores.length)).map((s) => s.photoId)
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
        startMessageRotation(2);

        const topPhotos = [...allSecondPassScores]
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
            photoScores: allSecondPassScores,
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
