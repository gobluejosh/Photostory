export interface Photo {
  id: string;
  file: File | null; // null after serialization
  fileName: string;
  thumbnailDataUrl: string; // base64 small thumbnail for Claude
  fullUrl: string; // Vercel Blob URL for full-res display
  dateTaken?: string;
  width: number;
  height: number;
}

export interface PhotoScore {
  photoId: string;
  score: number; // 1-10
  reason: string;
  tags: string[]; // e.g. "group", "landscape", "food", "portrait"
}

export interface BookPage {
  id: string;
  type: "cover" | "spread" | "single" | "closing";
  photoIds: string[];
  caption?: string;
  subtitle?: string; // for cover page
}

export interface PhotoBook {
  title: string;
  subtitle?: string;
  pages: BookPage[];
  aesthetic: "minimal" | "editorial" | "warm";
}

export interface InterviewAnswers {
  occasion: string;
  mood: string;
  mustInclude: string;
  additionalContext: string;
}

export type AppStep = "upload" | "interview" | "curating" | "book" | "editing";

export interface AppState {
  step: AppStep;
  photos: Photo[];
  interviewAnswers: InterviewAnswers | null;
  photoScores: PhotoScore[];
  book: PhotoBook | null;
  isLoading: boolean;
  loadingMessage: string;
}
