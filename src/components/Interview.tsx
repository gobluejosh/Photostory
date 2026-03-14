"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/store";

interface Question {
  id: string;
  question: string;
  options?: string[]; // If present, render as multiple-choice instead of free text
}

interface ScoreResult {
  photoId: string;
  score: number;
  reason: string;
  tags: string[];
  contentHash: string;
}

const fallbackQuestions: Question[] = [
  { id: "story", question: "What's the story behind these photos — what was the occasion or trip?" },
  { id: "mood", question: "What feeling should the book evoke — playful, nostalgic, elegant, or adventurous?" },
  { id: "must_haves", question: "Any specific moments or people that must be included, or anything to leave out?" },
];

export default function Interview() {
  const { state, dispatch } = useApp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [animating, setAnimating] = useState(false);
  const [cardState, setCardState] = useState<"enter" | "exit">("enter");
  const [finishing, setFinishing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Background scoring state
  const backgroundScoresRef = useRef<ScoreResult[]>([]);
  const scoringDoneRef = useRef(false);

  // Sample photos sent to the API (up to 12 evenly spaced)
  const samplePhotos = useMemo(() => {
    const step = Math.max(1, Math.floor(state.photos.length / 12));
    return Array.from(
      { length: Math.min(12, state.photos.length) },
      (_, i) => state.photos[Math.min(i * step, state.photos.length - 1)]
    );
  }, [state.photos]);

  // Build the photo count question based on how many photos were uploaded
  const photoCountQuestion = useMemo((): Question => {
    const count = state.photos.length;
    const highlights = Math.max(10, Math.round(count * 0.3));
    const most = Math.round(count * 0.7);
    return {
      id: "photo_count",
      question: `You uploaded ${count} photos. How many would you like in the book?`,
      options: [
        `Just the highlights (~${highlights} photos)`,
        `A good selection (~${most} photos)`,
        `Include them all (~${count} photos)`,
      ],
    };
  }, [state.photos.length]);

  // --- Background Pass 1 scoring (runs during the interview) ---
  const startBackgroundScoring = useCallback(async () => {
    const thumbnails = state.photos.map((p) => ({
      id: p.id,
      dataUrl: p.thumbnailDataUrl,
    }));

    const batchSize = 8;
    const allScores: ScoreResult[] = [];

    for (let i = 0; i < thumbnails.length; i += batchSize) {
      const batch = thumbnails.slice(i, i + batchSize);
      try {
        const res = await fetch("/api/curate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thumbnails: batch,
            interviewAnswers: {
              summary: "Score based on technical quality (sharpness, exposure, composition), emotional impact, and uniqueness. No specific creator context available yet — focus on identifying the strongest photos purely on merit.",
            },
            pass: "first",
          }),
        });
        const data = await res.json();
        if (data.scores) {
          allScores.push(...data.scores);
        }
      } catch {
        // Silently continue — CurationProgress will redo any missing scores
      }
    }

    backgroundScoresRef.current = allScores;
    scoringDoneRef.current = true;
  }, [state.photos]);

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const sampleThumbnails = samplePhotos.map((p) => p.thumbnailDataUrl);

        const res = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoCount: state.photos.length,
            sampleThumbnails,
          }),
        });

        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          // Insert photo count question as question #2 (after the story question)
          const aiQuestions: Question[] = data.questions;
          aiQuestions.splice(1, 0, photoCountQuestion);
          setQuestions(aiQuestions);
        } else {
          const fallback = [...fallbackQuestions];
          fallback.splice(1, 0, photoCountQuestion);
          setQuestions(fallback);
        }
      } catch {
        const fallback = [...fallbackQuestions];
        fallback.splice(1, 0, photoCountQuestion);
        setQuestions(fallback);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();

    // Start background scoring in parallel with the interview
    startBackgroundScoring();
  }, [state.photos, samplePhotos, photoCountQuestion, startBackgroundScoring]);

  const advanceToNext = (newAnswers: Record<string, string>) => {
    if (currentQ < questions.length - 1) {
      // Animate card out, then in
      setAnimating(true);
      setCardState("exit");
      setTimeout(() => {
        setCurrentQ((prev) => prev + 1);
        setCardState("enter");
        setTimeout(() => {
          setAnimating(false);
          textareaRef.current?.focus();
        }, 400);
      }, 300);
    } else {
      finishInterview(newAnswers);
    }
  };

  const finishInterview = (finalAnswers: Record<string, string>) => {
    // Show thank-you card, then transition
    setAnimating(true);
    setCardState("exit");
    setTimeout(() => {
      setFinishing(true);
      setCardState("enter");

      // Build the summary and dispatch after a brief pause
      setTimeout(() => {
        const qaPairs = questions.map((q) => ({
          question: q.question,
          answer: finalAnswers[q.id] || "",
        }));

        const resolvePhotoRefs = (text: string): string => {
          return text.replace(
            /(?:#|photo\s*)(\d+)/gi,
            (match, numStr) => {
              const idx = parseInt(numStr, 10) - 1;
              if (idx >= 0 && idx < state.photos.length) {
                return `${match} [id:${state.photos[idx].id}]`;
              }
              return match;
            }
          );
        };

        const summary = qaPairs
          .map((qa) => `Q: ${qa.question}\nA: ${resolvePhotoRefs(qa.answer)}`)
          .join("\n\n");

        // Store background scores if available
        if (backgroundScoresRef.current.length > 0) {
          dispatch({ type: "SET_PHOTO_SCORES", scores: backgroundScoresRef.current });
        }

        dispatch({
          type: "SET_INTERVIEW_ANSWERS",
          answers: { qaPairs, summary },
        });
        dispatch({ type: "SET_STEP", step: "curating" });
      }, 2000);
    }, 300);
  };

  const handleSubmitAnswer = () => {
    if (!inputValue.trim()) return;
    const q = questions[currentQ];
    const newAnswers = { ...answers, [q.id]: inputValue.trim() };
    setAnswers(newAnswers);
    setInputValue("");
    advanceToNext(newAnswers);
  };

  const handleOptionSelect = (option: string) => {
    if (animating) return;
    const q = questions[currentQ];
    const newAnswers = { ...answers, [q.id]: option };
    setAnswers(newAnswers);
    advanceToNext(newAnswers);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto px-4 py-12">
        <div className="animate-pulse text-gray-400 text-sm">
          Looking at your photos to craft the right questions...
        </div>
      </div>
    );
  }

  // --- Thank-you card after final question ---
  if (finishing) {
    return (
      <div className="flex flex-col w-full max-w-lg mx-auto px-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          {questions.map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-black" />
          ))}
        </div>

        <div className={`bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-10 text-center ${cardState === "enter" ? "card-enter" : "card-exit"}`}>
          <p className="text-lg font-medium text-gray-900 mb-2">
            Thanks for those details!
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Now designing your book using your answers and our expertise from studying millions of photo books...
          </p>
          <div className="mt-6 flex justify-center">
            <div className="flex gap-1">
              {state.photos.slice(0, 5).map((photo) => (
                <div key={photo.id} className="w-10 h-10 rounded overflow-hidden opacity-60">
                  <img src={photo.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQ];
  const isOptionQuestion = !!currentQuestion?.options;

  return (
    <div className="flex flex-col w-full max-w-lg mx-auto px-4">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < currentQ
                ? "w-1.5 bg-black"
                : i === currentQ
                  ? "w-6 bg-black"
                  : "w-1.5 bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Numbered thumbnail strip — shows ALL photos so user can reference any by # */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1 scrollbar-thin">
        {state.photos.map((photo, i) => (
          <div key={photo.id} className="relative shrink-0">
            <img
              src={photo.thumbnailDataUrl}
              alt={`Photo ${i + 1}`}
              className="w-14 h-14 object-cover rounded-lg"
            />
            <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] leading-none px-1 py-0.5 rounded">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <p className="text-gray-400 text-[10px] text-center mb-6">
        Scroll to see all {state.photos.length} photos — reference any by #
      </p>

      {/* Question card */}
      <div
        key={currentQ}
        className={`bg-white rounded-2xl shadow-lg border border-gray-100 px-6 py-8 ${cardState === "enter" ? "card-enter" : "card-exit"}`}
      >
        <p className="text-lg font-medium text-gray-900 leading-snug mb-6">
          {currentQuestion.question}
        </p>

        {isOptionQuestion ? (
          <div className="flex flex-col gap-2.5">
            {currentQuestion.options!.map((option) => (
              <button
                key={option}
                onClick={() => handleOptionSelect(option)}
                disabled={animating}
                className="text-left border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitAnswer();
                }
              }}
              placeholder="Type your answer..."
              rows={1}
              disabled={animating}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-gray-400 resize-none overflow-hidden disabled:opacity-50"
              style={{ fontSize: "16px" }}
              autoFocus
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!inputValue.trim() || animating}
              className="bg-black text-white rounded-full px-5 py-3 text-sm font-medium disabled:opacity-30 hover:bg-gray-800 transition-colors shrink-0"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Question counter */}
      <p className="text-gray-400 text-xs text-center mt-4">
        {currentQ + 1} of {questions.length}
      </p>

      <button
        onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
        className="text-sm text-gray-400 hover:text-gray-600 mt-4 text-center"
      >
        Back to photos
      </button>
    </div>
  );
}
