"use client";

import { useReducer } from "react";
import { AppContext, appReducer, initialState } from "@/lib/store";
import PhotoUpload from "@/components/PhotoUpload";
import Interview from "@/components/Interview";
import CurationProgress from "@/components/CurationProgress";
import BookViewer from "@/components/BookViewer";

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <main className="min-h-dvh flex flex-col items-center justify-center py-8">
        {state.step === "upload" && <PhotoUpload />}
        {state.step === "interview" && <Interview />}
        {state.step === "curating" && <CurationProgress />}
        {(state.step === "book" || state.step === "editing") && <BookViewer />}
      </main>
    </AppContext.Provider>
  );
}
