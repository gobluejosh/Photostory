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
  tags: string[];
  contentHash?: string;
}

export interface BookPage {
  id: string;
  type:
    | "cover"        // hero photo + title/subtitle overlay or below
    | "spread"       // 2 photos side-by-side
    | "single"       // 1 prominent photo with caption
    | "full-bleed"   // edge-to-edge photo, no margins
    | "text-page"    // chapter title or pull-quote, no photo
    | "grid"         // 3 photos in a composed grid
    | "panoramic"    // wide photo with generous vertical margins
    | "offset"       // photo offset to one side, caption on the other
    | "duo-stacked"  // 2 photos stacked vertically
    | "closing";     // reflective ending
  photoIds: string[];
  caption?: string;
  subtitle?: string;     // for cover or text-page
  textContent?: string;  // for text-page type
}

export interface PhotoBook {
  title: string;
  subtitle?: string;
  pages: BookPage[];
  aesthetic: "minimal" | "editorial" | "warm";
}

export interface InterviewQA {
  question: string;
  answer: string;
}

export interface InterviewAnswers {
  qaPairs: InterviewQA[];
  summary: string; // formatted for downstream prompts
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
