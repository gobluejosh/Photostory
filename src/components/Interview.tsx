"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";

interface Question {
  id: string;
  question: string;
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

  // Sample photos sent to the API (up to 12 evenly spaced)
  const samplePhotos = useMemo(() => {
    const step = Math.max(1, Math.floor(state.photos.length / 12));
    return Array.from(
      { length: Math.min(12, state.photos.length) },
      (_, i) => state.photos[Math.min(i * step, state.photos.length - 1)]
    );
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
          setQuestions(data.questions);
        } else {
          setQuestions(fallbackQuestions);
        }
      } catch {
        setQuestions(fallbackQuestions);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, [state.photos]);

  const handleSubmitAnswer = () => {
    if (!inputValue.trim()) return;
    const q = questions[currentQ];
    const newAnswers = { ...answers, [q.id]: inputValue.trim() };
    setAnswers(newAnswers);
    setInputValue("");

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // Build Q&A pairs and a formatted summary for downstream prompts
      const qaPairs = questions.map((q) => ({
        question: q.question,
        answer: newAnswers[q.id] || "",
      }));

      // Resolve photo number references (e.g. "#5", "photo 5") to photo IDs
      // so the curation step can match them to specific photos
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
      dispatch({
        type: "SET_INTERVIEW_ANSWERS",
        answers: { qaPairs, summary },
      });
      dispatch({ type: "SET_STEP", step: "curating" });
    }
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

  return (
    <div className="flex flex-col w-full max-w-lg mx-auto px-4">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-light mb-1">Tell me about these photos</h2>
        <p className="text-gray-400 text-xs">
          {currentQ + 1} of {questions.length}
        </p>
      </div>

      {/* Numbered thumbnail strip — shows ALL photos so user can reference any by # */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-6 -mx-1 px-1 scrollbar-thin">
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
      <p className="text-gray-400 text-[10px] text-center -mt-4 mb-4">
        Scroll to see all {state.photos.length} photos — reference any by #
      </p>

      {/* Chat-like display of previous answers */}
      <div className="flex flex-col gap-4 mb-8">
        {questions.slice(0, currentQ + 1).map((q, i) => (
          <div key={q.id}>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[85%]">
              {q.question}
            </div>
            {answers[q.id] && (
              <div className="bg-black text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%] ml-auto mt-2">
                {answers[q.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-auto items-end">
        <textarea
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
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-base focus:outline-none focus:border-gray-400 resize-none overflow-hidden"
          style={{ fontSize: "16px" }}
          autoFocus
        />
        <button
          onClick={handleSubmitAnswer}
          disabled={!inputValue.trim()}
          className="bg-black text-white rounded-full px-5 py-3 text-sm font-medium disabled:opacity-30 hover:bg-gray-800 transition-colors shrink-0"
        >
          Send
        </button>
      </div>

      <button
        onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
        className="text-sm text-gray-400 hover:text-gray-600 mt-4 text-center"
      >
        Back to photos
      </button>
    </div>
  );
}
