"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

interface Question {
  id: string;
  question: string;
}

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
        const sampleThumbnails = state.photos
          .slice(0, 6)
          .map((p) => p.thumbnailDataUrl);

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
          // Fallback questions
          setQuestions([
            { id: "occasion", question: "What's the occasion or story behind these photos?" },
            { id: "mood", question: "What mood or feeling do you want the book to capture?" },
            { id: "mustInclude", question: "Is there anyone or anything that must be prominently featured?" },
            { id: "additional", question: "Anything else I should know to make this book perfect for you?" },
          ]);
        }
      } catch {
        setQuestions([
          { id: "occasion", question: "What's the occasion or story behind these photos?" },
          { id: "mood", question: "What mood or feeling do you want the book to capture?" },
          { id: "mustInclude", question: "Is there anyone or anything that must be prominently featured?" },
          { id: "additional", question: "Anything else I should know to make this book perfect for you?" },
        ]);
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
      // All questions answered - map to interview answers
      const keys = questions.map((q) => q.id);
      dispatch({
        type: "SET_INTERVIEW_ANSWERS",
        answers: {
          occasion: newAnswers[keys[0]] || "",
          mood: newAnswers[keys[1]] || "",
          mustInclude: newAnswers[keys[2]] || "",
          additionalContext: keys.slice(3).map((k) => newAnswers[k] || "").join(". "),
        },
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
