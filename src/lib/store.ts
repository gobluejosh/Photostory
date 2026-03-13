"use client";

import { createContext, useContext } from "react";
import { AppState, Photo, PhotoScore, PhotoBook, InterviewAnswers } from "./types";

export const initialState: AppState = {
  step: "upload",
  photos: [],
  interviewAnswers: null,
  photoScores: [],
  book: null,
  bookId: null,
  isLoading: false,
  loadingMessage: "",
};

export type AppAction =
  | { type: "SET_STEP"; step: AppState["step"] }
  | { type: "ADD_PHOTOS"; photos: Photo[] }
  | { type: "CLEAR_PHOTOS" }
  | { type: "SET_INTERVIEW_ANSWERS"; answers: InterviewAnswers }
  | { type: "SET_PHOTO_SCORES"; scores: PhotoScore[] }
  | { type: "SET_BOOK"; book: PhotoBook }
  | { type: "SET_BOOK_ID"; bookId: string }
  | { type: "SET_LOADING"; isLoading: boolean; message?: string };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "ADD_PHOTOS":
      return { ...state, photos: [...state.photos, ...action.photos] };
    case "CLEAR_PHOTOS":
      return { ...state, photos: [], photoScores: [], book: null, bookId: null };
    case "SET_INTERVIEW_ANSWERS":
      return { ...state, interviewAnswers: action.answers };
    case "SET_PHOTO_SCORES":
      return { ...state, photoScores: action.scores };
    case "SET_BOOK":
      return { ...state, book: action.book };
    case "SET_BOOK_ID":
      return { ...state, bookId: action.bookId };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading, loadingMessage: action.message || "" };
    default:
      return state;
  }
}

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>({ state: initialState, dispatch: () => {} });

export function useApp() {
  return useContext(AppContext);
}
