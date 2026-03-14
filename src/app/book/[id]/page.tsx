"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { SavedBook, BookPage } from "@/lib/types";
import { processPhotos } from "@/lib/images";

export default function SavedBookPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [savedBook, setSavedBook] = useState<SavedBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSpread, setCurrentSpread] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showRejected, setShowRejected] = useState(false);
  const [editInput, setEditInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share link");
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const addPhotosRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/books/${bookId}`);
        if (!res.ok) throw new Error("Book not found");
        const data: SavedBook = await res.json();
        setSavedBook(data);
      } catch {
        setError("Book not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookId]);

  // Compute spreads: cover alone (full width), then page pairs
  const spreads: [number | null, number | null][] = useMemo(() => {
    if (!savedBook) return [];
    const result: [number | null, number | null][] = [[0, null]]; // cover full width
    for (let i = 1; i < savedBook.book.pages.length; i += 2) {
      const right = i + 1 < savedBook.book.pages.length ? i + 1 : null;
      result.push([i, right]);
    }
    return result;
  }, [savedBook]);

  const totalSpreads = spreads.length;

  const goTo = useCallback(
    (spread: number) => {
      const clamped = Math.max(0, Math.min(totalSpreads - 1, spread));
      setDirection(clamped >= currentSpread ? "forward" : "back");
      setCurrentSpread(clamped);
    },
    [currentSpread, totalSpreads]
  );

  // Escape key exits fullscreen, arrow keys navigate
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "ArrowLeft") goTo(currentSpread - 1);
      if (e.key === "ArrowRight") goTo(currentSpread + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen, currentSpread, goTo]);

  const saveBook = useCallback(async (updated: SavedBook) => {
    setIsSaving(true);
    try {
      await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updated, updatedAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Memoize rejected photos for use in edit handler
  const rejectedPhotosForEdit = useMemo(() => {
    if (!savedBook) return [];
    const used = new Set(savedBook.book.pages.flatMap((p) => p.photoIds));
    return savedBook.allPhotoIds
      .filter((id) => !used.has(id))
      .filter((id) => savedBook.photoUrls[id])
      .map((id) => ({
        id,
        score: savedBook.photoScores.find((s) => s.photoId === id),
      }))
      .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0));
  }, [savedBook]);

  const handleEdit = async () => {
    if (!editInput.trim() || !savedBook) return;
    setIsEditing(true);

    try {
      // Build available photos from the saved book's photoUrls
      const availablePhotos = Object.entries(savedBook.photoUrls).map(([id, url]) => ({
        id,
        thumbnailDataUrl: url, // Use the full URL as thumbnail for the API
      }));

      // Resolve "unused photo N" / "U3" references to photo IDs
      const resolvedInstruction = editInput.replace(
        /(?:unused\s+(?:photo\s*)?#?\s*|U)(\d+)/gi,
        (match, numStr) => {
          const idx = parseInt(numStr, 10) - 1;
          if (idx >= 0 && idx < rejectedPhotosForEdit.length) {
            return `${match} [photo ID: ${rejectedPhotosForEdit[idx].id}]`;
          }
          return match;
        }
      );

      const res = await fetch("/api/edit-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: resolvedInstruction,
          currentBook: savedBook.book,
          availablePhotos,
          photoScores: savedBook.photoScores,
          interviewAnswers: { summary: savedBook.interviewSummary },
        }),
      });

      const data = await res.json();
      if (data.book) {
        // Determine which pages changed
        const oldPages = savedBook.book.pages;
        const newPages = data.book.pages;
        const changedPages: number[] = [];
        const maxLen = Math.max(oldPages.length, newPages.length);
        for (let i = 0; i < maxLen; i++) {
          if (i >= oldPages.length || i >= newPages.length || JSON.stringify(oldPages[i]) !== JSON.stringify(newPages[i])) {
            changedPages.push(i + 1);
          }
        }
        let msg = "Book updated";
        if (newPages.length !== oldPages.length) {
          msg = `Book updated — now ${newPages.length} pages (was ${oldPages.length})`;
        } else if (changedPages.length > 0) {
          const pageList = changedPages.length <= 4
            ? changedPages.join(", ")
            : changedPages.slice(0, 3).join(", ") + ` + ${changedPages.length - 3} more`;
          msg = `Updated page${changedPages.length > 1 ? "s" : ""} ${pageList}`;
        }
        setEditMessage(msg);
        setTimeout(() => setEditMessage(null), 4000);

        const usedPhotoIds = [...new Set(data.book.pages.flatMap((p: BookPage) => p.photoIds))];
        const updated: SavedBook = {
          ...savedBook,
          book: data.book,
          usedPhotoIds: usedPhotoIds as string[],
          updatedAt: new Date().toISOString(),
        };
        setSavedBook(updated);
        setEditInput("");
        saveBook(updated);
      }
    } catch (error) {
      console.error("Edit error:", error);
    } finally {
      setIsEditing(false);
    }
  };

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0 || !savedBook) return;
    setIsUploading(true);
    try {
      const newPhotos = await processPhotos(Array.from(files));
      if (newPhotos.length > 0) {
        const newPhotoUrls: Record<string, string> = {};
        for (const p of newPhotos) {
          newPhotoUrls[p.id] = p.fullUrl;
        }

        // Score the new photos via the curate API
        const thumbnails = newPhotos.map((p) => ({
          id: p.id,
          dataUrl: p.thumbnailDataUrl,
        }));
        let newScores: { photoId: string; score: number; reason: string; tags: string[]; contentHash: string }[] = [];
        try {
          const res = await fetch("/api/curate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thumbnails,
              interviewAnswers: { summary: savedBook.interviewSummary },
              pass: "first",
            }),
          });
          const data = await res.json();
          if (data.scores) {
            newScores = data.scores;
          }
        } catch {
          // Fallback: assign default scores if scoring fails
          newScores = newPhotos.map((p) => ({
            photoId: p.id,
            score: 7,
            reason: "Newly added photo (not scored)",
            tags: ["added"],
            contentHash: `new_${p.id}`,
          }));
        }

        const updated: SavedBook = {
          ...savedBook,
          photoUrls: { ...savedBook.photoUrls, ...newPhotoUrls },
          photoScores: [...savedBook.photoScores, ...newScores],
          allPhotoIds: [...savedBook.allPhotoIds, ...newPhotos.map((p) => p.id)],
          updatedAt: new Date().toISOString(),
        };
        setSavedBook(updated);
        saveBook(updated);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
      if (addPhotosRef.current) addPhotosRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-sm text-stone-400 book-sans animate-pulse">Loading book...</p>
      </main>
    );
  }

  if (error || !savedBook) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-stone-500 book-sans">{error || "Something went wrong"}</p>
        <a href="/books" className="text-sm text-stone-400 hover:text-stone-600 book-sans underline">
          View all books
        </a>
      </main>
    );
  }

  const { book, photoUrls, photoScores } = savedBook;
  const pages = book.pages;
  const usedIds = new Set(pages.flatMap((p) => p.photoIds));

  const getPhotoUrl = (photoId: string) => photoUrls[photoId] || "";

  // Rejected photos
  const rejectedPhotos = savedBook.allPhotoIds
    .filter((id) => !usedIds.has(id))
    .map((id) => ({
      id,
      url: photoUrls[id],
      score: photoScores.find((s) => s.photoId === id),
    }))
    .filter((p) => p.url)
    .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0));

  // ─── Renderers ─────────────────────────────────────────────────

  const Caption = ({ text, className = "" }: { text?: string; className?: string }) =>
    text ? <p className={`book-caption text-xs sm:text-sm leading-relaxed ${className}`}>{text}</p> : null;

  const Divider = () => <div className="book-divider mx-auto my-3" />;

  const renderPage = (page: BookPage) => {
    switch (page.type) {
      case "cover": {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="flex flex-col items-center justify-center h-full px-6 sm:px-10 py-6 sm:py-10 overflow-hidden">
            {url && (
              <div className="flex-1 w-full flex items-center justify-center min-h-0 mb-4 sm:mb-6">
                <img src={url} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            <Divider />
            <h1 className="book-serif text-lg sm:text-2xl md:text-4xl text-center mt-2 sm:mt-3 w-full break-words" style={{ color: "var(--book-text)" }}>
              {book.title}
            </h1>
            {book.subtitle && (
              <p className="book-sans text-[10px] sm:text-xs mt-1 sm:mt-2 tracking-wide uppercase w-full text-center break-words" style={{ color: "var(--book-caption)", letterSpacing: "0.12em" }}>
                {book.subtitle}
              </p>
            )}
          </div>
        );
      }
      case "full-bleed": {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="relative h-full w-full">
            {url && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {page.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-8 pb-5 pt-12">
                <p className="text-white/90 text-xs sm:text-sm book-sans">{page.caption}</p>
              </div>
            )}
          </div>
        );
      }
      case "spread": {
        const url1 = getPhotoUrl(page.photoIds[0]);
        const url2 = getPhotoUrl(page.photoIds[1]);
        return (
          <div className="flex flex-col h-full px-6 sm:px-10 py-6 sm:py-8">
            <div className="flex-1 flex gap-3 sm:gap-5 min-h-0">
              {url1 && (
                <div className="flex-1 flex items-center justify-center">
                  <img src={url1} alt="" className="max-w-full max-h-full object-contain book-photo" />
                </div>
              )}
              {url2 && (
                <div className="flex-1 flex items-center justify-center">
                  <img src={url2} alt="" className="max-w-full max-h-full object-contain book-photo" />
                </div>
              )}
            </div>
            {page.caption && (
              <>
                <Divider />
                <Caption text={page.caption} className="text-center mt-2 px-4 sm:px-12" />
              </>
            )}
          </div>
        );
      }
      case "grid": {
        const urls = page.photoIds.map(getPhotoUrl);
        return (
          <div className="flex flex-col h-full px-6 sm:px-10 py-6 sm:py-8">
            <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-0">
              {urls[0] && (
                <div className="flex-[2] flex items-center justify-center min-h-0">
                  <img src={urls[0]} alt="" className="max-w-full max-h-full object-contain book-photo" />
                </div>
              )}
              <div className="flex-1 flex gap-2 sm:gap-3 min-h-0">
                {urls[1] && (
                  <div className="flex-1 flex items-center justify-center">
                    <img src={urls[1]} alt="" className="max-w-full max-h-full object-contain book-photo" />
                  </div>
                )}
                {urls[2] && (
                  <div className="flex-1 flex items-center justify-center">
                    <img src={urls[2]} alt="" className="max-w-full max-h-full object-contain book-photo" />
                  </div>
                )}
              </div>
            </div>
            <Caption text={page.caption} className="text-center mt-3" />
          </div>
        );
      }
      case "offset": {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="flex h-full px-6 sm:px-10 py-6 sm:py-10 gap-6 sm:gap-10">
            {url && (
              <div className="flex-[3] flex items-center justify-center min-h-0">
                <img src={url} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            {page.caption && (
              <div className="flex-[2] flex flex-col justify-center">
                <div className="book-divider mb-4" />
                <p className="book-caption text-xs sm:text-sm leading-relaxed">{page.caption}</p>
              </div>
            )}
          </div>
        );
      }
      case "duo-stacked": {
        const url1 = getPhotoUrl(page.photoIds[0]);
        const url2 = getPhotoUrl(page.photoIds[1]);
        return (
          <div className="flex flex-col h-full px-10 sm:px-16 py-6 sm:py-8 gap-3 sm:gap-4">
            {url1 && (
              <div className="flex-1 flex items-center justify-center min-h-0">
                <img src={url1} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            {url2 && (
              <div className="flex-1 flex items-center justify-center min-h-0">
                <img src={url2} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            <Caption text={page.caption} className="text-center" />
          </div>
        );
      }
      case "panoramic": {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="flex flex-col items-center justify-center h-full px-6 sm:px-10 py-12 sm:py-16">
            {url && (
              <div className="w-full flex items-center justify-center" style={{ maxHeight: "55%" }}>
                <img src={url} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            {page.caption && (
              <>
                <Divider />
                <Caption text={page.caption} className="text-center mt-3 max-w-md" />
              </>
            )}
          </div>
        );
      }
      case "text-page":
        return (
          <div className="flex flex-col items-center justify-center h-full px-12 sm:px-24 py-16">
            <div className="book-divider mb-6" />
            <p className="book-serif text-xl sm:text-3xl text-center leading-snug" style={{ color: "var(--book-text)" }}>
              {page.textContent || page.caption || ""}
            </p>
            {page.subtitle && (
              <p className="book-sans text-xs sm:text-sm mt-6 tracking-wide uppercase" style={{ color: "var(--book-caption)", letterSpacing: "0.12em" }}>
                {page.subtitle}
              </p>
            )}
            <div className="book-divider mt-6" />
          </div>
        );
      case "closing": {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="flex flex-col items-center justify-center h-full px-12 sm:px-20 py-10 sm:py-14">
            {url && (
              <div className="flex-1 flex items-center justify-center w-full min-h-0 mb-4">
                <img src={url} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            <Divider />
            {page.caption && (
              <p className="book-serif text-base sm:text-lg text-center mt-3 max-w-sm leading-relaxed" style={{ color: "var(--book-text)" }}>
                {page.caption}
              </p>
            )}
          </div>
        );
      }
      default: {
        const url = getPhotoUrl(page.photoIds[0]);
        return (
          <div className="flex flex-col items-center justify-center h-full px-10 sm:px-20 py-8 sm:py-12">
            {url && (
              <div className="flex-1 flex items-center justify-center w-full min-h-0">
                <img src={url} alt="" className="max-w-full max-h-full object-contain book-photo" />
              </div>
            )}
            {page.caption && (
              <>
                <Divider />
                <Caption text={page.caption} className="text-center mt-2 max-w-sm" />
              </>
            )}
          </div>
        );
      }
    }
  };

  const animClass = direction === "forward" ? "page-enter" : "page-enter-reverse";

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center py-8">
      <div className="flex flex-col w-full max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <a href="/books" className="text-xs text-stone-400 hover:text-stone-600 book-sans transition-colors">
            &larr; My Books
          </a>
          <div className="flex items-center gap-3">
            {isSaving && <span className="text-xs text-stone-400 book-sans animate-pulse">Saving...</span>}
            <a href="/" className="text-xs text-stone-400 hover:text-stone-600 book-sans transition-colors">
              Create new book
            </a>
          </div>
        </div>

        {/* Edit toast */}
        {editMessage && (
          <div className="mb-3 text-center animate-in fade-in slide-in-from-top-2">
            <span className="inline-block bg-stone-800 text-white text-xs book-sans px-4 py-2 rounded-full">
              {editMessage}
            </span>
          </div>
        )}

        {/* Book display — layflat spread (narrower for cover) */}
        <div
          className={`rounded-sm shadow-xl border border-stone-200/60 w-full flex overflow-hidden touch-pan-y relative group transition-all duration-500 ${currentSpread === 0 ? "aspect-[1/1] max-w-[50%] mx-auto" : "aspect-[2/1]"}`}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touchStartRef.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            if (!touchStartRef.current) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartRef.current.x;
            const dy = t.clientY - touchStartRef.current.y;
            touchStartRef.current = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx < 0) goTo(currentSpread + 1);
              else goTo(currentSpread - 1);
            }
          }}
        >
          {(() => {
            const [leftIdx, rightIdx] = spreads[currentSpread] || [null, null];
            const isCoverSpread = currentSpread === 0;
            if (isCoverSpread) {
              return (
                <div key={currentSpread} className={`flex-1 min-h-0 book-page ${animClass}`}>
                  {renderPage(pages[0])}
                </div>
              );
            }
            return (
              <div key={currentSpread} className={`flex flex-1 min-h-0 ${animClass}`}>
                {/* Left page */}
                <div className="flex-1 book-page overflow-hidden">
                  {leftIdx !== null ? (
                    <div className="h-full">{renderPage(pages[leftIdx])}</div>
                  ) : (
                    <div className="h-full book-endpaper" />
                  )}
                </div>
                {/* Binding seam */}
                <div className="book-seam" />
                {/* Right page */}
                <div className="flex-1 book-page overflow-hidden">
                  {rightIdx !== null ? (
                    <div className="h-full">{renderPage(pages[rightIdx])}</div>
                  ) : (
                    <div className="h-full book-endpaper" />
                  )}
                </div>
              </div>
            );
          })()}
          {/* Fullscreen button */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10"
            aria-label="View fullscreen"
            title="View fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
            </svg>
          </button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center justify-center gap-6 mt-5">
          <button
            onClick={() => goTo(currentSpread - 1)}
            disabled={currentSpread === 0}
            className="text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors px-2 py-1"
            aria-label="Previous spread"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 4L7 10L13 16" />
            </svg>
          </button>
          <span className="text-xs text-stone-400 book-sans tracking-widest tabular-nums">
            {(() => {
              const [leftIdx, rightIdx] = spreads[currentSpread] || [null, null];
              if (leftIdx === null && rightIdx !== null) return `${rightIdx + 1}`;
              if (leftIdx !== null && rightIdx === null) return `${leftIdx + 1}`;
              if (leftIdx !== null && rightIdx !== null) return `${leftIdx + 1}–${rightIdx + 1}`;
              return "";
            })()}{" "}
            / {pages.length}
          </span>
          <button
            onClick={() => goTo(currentSpread + 1)}
            disabled={currentSpread === totalSpreads - 1}
            className="text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors px-2 py-1"
            aria-label="Next spread"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 4L13 10L7 16" />
            </svg>
          </button>
        </div>

        {/* Edit bar */}
        <div className="flex gap-2 mt-5 items-end">
          <textarea
            value={editInput}
            onChange={(e) => {
              setEditInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEdit();
              }
            }}
            placeholder={isEditing ? "Updating your book..." : 'Edit with natural language... e.g. "swap page 3 photo"'}
            disabled={isEditing}
            rows={2}
            className="flex-1 border border-stone-200 rounded-2xl px-4 py-2.5 text-sm book-sans focus:outline-none focus:border-stone-400 disabled:opacity-50 bg-white resize-none overflow-hidden"
            style={{ fontSize: "16px" }}
          />
          <button
            onClick={handleEdit}
            disabled={isEditing || !editInput.trim()}
            className="bg-stone-800 text-white rounded-full px-5 py-2.5 text-sm book-sans font-medium disabled:opacity-30 hover:bg-stone-900 transition-colors"
          >
            {isEditing ? "..." : "Edit"}
          </button>
        </div>

        {/* Add photos */}
        <input
          ref={addPhotosRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleAddPhotos(e.target.files)}
        />

        {/* Actions */}
        <div className="flex gap-3 mt-4 justify-center">
          <button
            onClick={() => addPhotosRef.current?.click()}
            disabled={isUploading}
            className="border border-stone-200 rounded-full px-5 py-2 text-sm book-sans hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            {isUploading ? "Adding photos..." : "+ Add photos"}
          </button>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/book/${bookId}`;
              try {
                await navigator.clipboard.writeText(url);
                setShareLabel("Copied!");
                setTimeout(() => setShareLabel("Share link"), 2000);
              } catch {
                const input = document.createElement("input");
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand("copy");
                document.body.removeChild(input);
                setShareLabel("Copied!");
                setTimeout(() => setShareLabel("Share link"), 2000);
              }
            }}
            className="border border-stone-200 rounded-full px-5 py-2 text-sm book-sans hover:bg-stone-50 transition-colors"
          >
            {shareLabel}
          </button>
        </div>

        {/* Fullscreen overlay */}
        {isFullscreen && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition-colors z-10"
              aria-label="Exit fullscreen"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2v4H2M14 2v4h4M14 18v-4h4M6 18v-4H2" />
              </svg>
            </button>
            <div className={`rounded-sm ${currentSpread === 0 ? "aspect-[1/1] max-w-[50%]" : "aspect-[2/1] max-w-6xl"} w-full max-h-[90vh] flex overflow-hidden mx-4`}>
              {(() => {
                const [leftIdx, rightIdx] = spreads[currentSpread] || [null, null];
                if (currentSpread === 0) {
                  return (
                    <div key={`fs-${currentSpread}`} className={`flex-1 min-h-0 book-page ${animClass}`}>
                      {renderPage(pages[0])}
                    </div>
                  );
                }
                return (
                  <div key={`fs-${currentSpread}`} className={`flex flex-1 min-h-0 ${animClass}`}>
                    <div className="flex-1 book-page overflow-hidden">
                      {leftIdx !== null ? (
                        <div className="h-full">{renderPage(pages[leftIdx])}</div>
                      ) : (
                        <div className="h-full book-endpaper" />
                      )}
                    </div>
                    <div className="book-seam" />
                    <div className="flex-1 book-page overflow-hidden">
                      {rightIdx !== null ? (
                        <div className="h-full">{renderPage(pages[rightIdx])}</div>
                      ) : (
                        <div className="h-full book-endpaper" />
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-center gap-8 mt-6">
              <button
                onClick={() => goTo(currentSpread - 1)}
                disabled={currentSpread === 0}
                className="text-white/50 hover:text-white disabled:opacity-20 transition-colors px-3 py-2"
                aria-label="Previous spread"
              >
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 4L7 10L13 16" />
                </svg>
              </button>
              <span className="text-sm text-white/50 book-sans tracking-widest tabular-nums">
                {(() => {
                  const [leftIdx, rightIdx] = spreads[currentSpread] || [null, null];
                  if (leftIdx === null && rightIdx !== null) return `${rightIdx + 1}`;
                  if (leftIdx !== null && rightIdx === null) return `${leftIdx + 1}`;
                  if (leftIdx !== null && rightIdx !== null) return `${leftIdx + 1}–${rightIdx + 1}`;
                  return "";
                })()}{" "}
                / {pages.length}
              </span>
              <button
                onClick={() => goTo(currentSpread + 1)}
                disabled={currentSpread === totalSpreads - 1}
                className="text-white/50 hover:text-white disabled:opacity-20 transition-colors px-3 py-2"
                aria-label="Next spread"
              >
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 4L13 10L7 16" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Rejected photos panel */}
        {rejectedPhotos.length > 0 && (
          <div className="mt-8 mb-8">
            <button
              onClick={() => setShowRejected(!showRejected)}
              className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-600 book-sans transition-colors mx-auto"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className={`transition-transform ${showRejected ? "rotate-90" : ""}`}
              >
                <path d="M4 2L8 6L4 10" />
              </svg>
              {rejectedPhotos.length} unused photos — reference by U1, U2, etc.
            </button>

            {showRejected && (
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {rejectedPhotos.map(({ id, url, score }, index) => (
                  <div key={id} className="group">
                    <div className="aspect-square rounded overflow-hidden bg-stone-100 relative">
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 h-5 flex items-center justify-center rounded-full book-sans font-medium">
                        U{index + 1}
                      </div>
                      {score && (
                        <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full book-sans">
                          {score.score}/10
                        </div>
                      )}
                    </div>
                    {score?.reason && (
                      <p className="text-[10px] text-stone-400 mt-1 leading-tight line-clamp-2 book-sans">
                        {score.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
