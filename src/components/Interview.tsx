"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

interface Question {
  id: string;
  question: string;
}

const fallbackQuestions: Question[] = [
  { id: "story", question: "What's the story behind these photos? What was the occasion?" },
  { id: "people", question: "Who are the key people in these photos, and who should be featured most prominently?" },
  { id: "preferences", question: "Do you prefer more people-focused shots or scenery/atmosphere? And should the book flow chronologically or by theme?" },
  { id: "mood", question: "What mood or feeling should the book evoke — playful, nostalgic, elegant, adventurous?" },
  { id: "must_haves", question: "Are there any specific moments or people that absolutely must be included, or anything you'd like left out?" },
];

export default function Interview() {
  const { state, dispatch } = useApp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    async function fetchQuestions() {
      try {
        // Send a diverse sample: pick evenly spaced photos across the collection
        const step = Math.max(1, Math.floor(state.photos.length / 12));
        const sampleThumbnails = Array.from(
          { length: Math.min(12, state.photos.length) },
          (_, i) => state.photos[Math.min(i * step, state.photos.length - 1)].thumbnailDataUrl
        );

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
      const summary = qaPairs
        .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
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
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light mb-1">Tell me about these photos</h2>
        <p className="text-gray-400 text-xs">
          {currentQ + 1} of {questions.length}
        </p>
      </div>

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
      <div className="flex gap-2 mt-auto">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmitAnswer()}
          placeholder="Type your answer..."
          className="flex-1 border border-gray-200 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-gray-400"
          autoFocus
        />
        <button
          onClick={handleSubmitAnswer}
          disabled={!inputValue.trim()}
          className="bg-black text-white rounded-full px-5 py-3 text-sm font-medium disabled:opacity-30 hover:bg-gray-800 transition-colors"
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
