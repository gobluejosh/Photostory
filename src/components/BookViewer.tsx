"use client";

import { useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/store";
import { BookPage } from "@/lib/types";

export default function BookViewer() {
  const { state, dispatch } = useApp();
  const [currentPage, setCurrentPage] = useState(0);
  const [editInput, setEditInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const bookRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (page: number) => {
      if (!state.book) return;
      const clamped = Math.max(0, Math.min(state.book.pages.length - 1, page));
      setDirection(clamped >= currentPage ? "forward" : "back");
      setCurrentPage(clamped);
    },
    [currentPage, state.book]
  );

  if (!state.book) return null;

  const { book } = state;
  const pages = book.pages;

  const getPhoto = (photoId: string) =>
    state.photos.find((p) => p.id === photoId);

  const handleEdit = async () => {
    if (!editInput.trim()) return;
    setIsEditing(true);

    try {
      const topScores = [...state.photoScores]
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);

      const availablePhotos = topScores
        .map((s) => {
          const photo = state.photos.find((p) => p.id === s.photoId);
          return {
            id: s.photoId,
            thumbnailDataUrl: photo?.thumbnailDataUrl || "",
          };
        })
        .filter((p) => p.thumbnailDataUrl);

      const res = await fetch("/api/edit-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: editInput,
          currentBook: book,
          availablePhotos,
          photoScores: state.photoScores,
          interviewAnswers: state.interviewAnswers,
        }),
      });

      const data = await res.json();
      if (data.book) {
        dispatch({ type: "SET_BOOK", book: data.book });
        setEditInput("");
      }
    } catch (error) {
      console.error("Edit error:", error);
    } finally {
      setIsEditing(false);
    }
  };

  const fetchAsDataUrl = async (url: string): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const usedPhotoIds = new Set(pages.flatMap((p) => p.photoIds));
      const imageCache: Record<string, string> = {};
      for (const id of usedPhotoIds) {
        const photo = getPhoto(id);
        if (photo) {
          try {
            imageCache[id] = await fetchAsDataUrl(photo.fullUrl);
          } catch {
            /* skip */
          }
        }
      }

      const W = 800,
        H = 600;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [W, H],
      });
      let firstPage = true;

      for (const page of pages) {
        if (!firstPage) pdf.addPage([W, H], "landscape");
        firstPage = false;

        // Cream background
        pdf.setFillColor(248, 246, 243);
        pdf.rect(0, 0, W, H, "F");

        const addImg = (id: string, x: number, y: number, w: number, h: number) => {
          const d = imageCache[id];
          if (d) try { pdf.addImage(d, "JPEG", x, y, w, h); } catch {}
        };

        switch (page.type) {
          case "cover": {
            addImg(page.photoIds[0], 120, 60, 560, 370);
            pdf.setFontSize(26);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(44, 44, 44);
            pdf.text(book.title, W / 2, 475, { align: "center" });
            if (book.subtitle) {
              pdf.setFontSize(12);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(107, 101, 96);
              pdf.text(book.subtitle, W / 2, 500, { align: "center" });
            }
            break;
          }
          case "full-bleed":
            addImg(page.photoIds[0], 0, 0, W, H);
            break;
          case "spread": {
            addImg(page.photoIds[0], 30, 50, 360, 400);
            addImg(page.photoIds[1], 410, 50, 360, 400);
            if (page.caption) {
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "italic");
              pdf.setTextColor(107, 101, 96);
              pdf.text(page.caption, W / 2, 480, { align: "center", maxWidth: 500 });
            }
            break;
          }
          case "grid": {
            const ids = page.photoIds;
            addImg(ids[0], 40, 40, 460, 340);
            if (ids[1]) addImg(ids[1], 40, 400, 222, 160);
            if (ids[2]) addImg(ids[2], 278, 400, 222, 160);
            break;
          }
          case "duo-stacked": {
            addImg(page.photoIds[0], 120, 30, 560, 250);
            if (page.photoIds[1]) addImg(page.photoIds[1], 120, 300, 560, 250);
            break;
          }
          case "panoramic":
            addImg(page.photoIds[0], 40, 150, 720, 280);
            if (page.caption) {
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "italic");
              pdf.setTextColor(107, 101, 96);
              pdf.text(page.caption, W / 2, 470, { align: "center", maxWidth: 500 });
            }
            break;
          case "offset": {
            addImg(page.photoIds[0], 50, 50, 440, 490);
            if (page.caption) {
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "italic");
              pdf.setTextColor(107, 101, 96);
              pdf.text(page.caption, 590, 300, { align: "left", maxWidth: 170 });
            }
            break;
          }
          case "text-page": {
            pdf.setFontSize(28);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(44, 44, 44);
            const txt = page.textContent || page.caption || "";
            pdf.text(txt, W / 2, H / 2, { align: "center", maxWidth: 500 });
            break;
          }
          default: {
            // single / closing
            addImg(page.photoIds[0], 120, 40, 560, 420);
            if (page.caption) {
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "italic");
              pdf.setTextColor(107, 101, 96);
              pdf.text(page.caption, W / 2, 500, { align: "center", maxWidth: 500 });
            }
          }
        }
      }

      pdf.save(`${book.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
    } catch (error) {
      console.error("PDF export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Page Renderers ────────────────────────────────────────────────

  const Caption = ({ text, className = "" }: { text?: string; className?: string }) =>
    text ? (
      <p className={`book-caption text-xs sm:text-sm leading-relaxed ${className}`}>
        {text}
      </p>
    ) : null;

  const Divider = () => <div className="book-divider mx-auto my-3" />;

  const renderCover = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex flex-col items-center justify-center h-full px-10 sm:px-16 py-10">
        {photo && (
          <div className="flex-1 w-full flex items-center justify-center min-h-0 mb-6">
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
          </div>
        )}
        <Divider />
        <h1 className="book-serif text-2xl sm:text-4xl text-center mt-3" style={{ color: "var(--book-text)" }}>
          {book.title}
        </h1>
        {book.subtitle && (
          <p className="book-sans text-xs sm:text-sm mt-2 tracking-wide uppercase" style={{ color: "var(--book-caption)", letterSpacing: "0.12em" }}>
            {book.subtitle}
          </p>
        )}
      </div>
    );
  };

  const renderFullBleed = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="relative h-full w-full">
        {photo && (
          <img
            src={photo.fullUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {page.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-8 pb-5 pt-12">
            <p className="text-white/90 text-xs sm:text-sm book-sans">{page.caption}</p>
          </div>
        )}
      </div>
    );
  };

  const renderSpread = (page: BookPage) => {
    const photo1 = getPhoto(page.photoIds[0]);
    const photo2 = getPhoto(page.photoIds[1]);
    return (
      <div className="flex flex-col h-full px-6 sm:px-10 py-6 sm:py-8">
        <div className="flex-1 flex gap-3 sm:gap-5 min-h-0">
          {photo1 && (
            <div className="flex-1 flex items-center justify-center">
              <img
                src={photo1.fullUrl}
                alt=""
                className="max-w-full max-h-full object-contain book-photo"
              />
            </div>
          )}
          {photo2 && (
            <div className="flex-1 flex items-center justify-center">
              <img
                src={photo2.fullUrl}
                alt=""
                className="max-w-full max-h-full object-contain book-photo"
              />
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
  };

  const renderSingle = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex flex-col items-center justify-center h-full px-10 sm:px-20 py-8 sm:py-12">
        {photo && (
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
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
  };

  const renderPanoramic = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 sm:px-10 py-12 sm:py-16">
        {photo && (
          <div className="w-full flex items-center justify-center" style={{ maxHeight: "55%" }}>
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
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
  };

  const renderGrid = (page: BookPage) => {
    const photos = page.photoIds.map(getPhoto).filter(Boolean);
    return (
      <div className="flex flex-col h-full px-6 sm:px-10 py-6 sm:py-8">
        <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-0">
          {/* Top: large photo */}
          {photos[0] && (
            <div className="flex-[2] flex items-center justify-center min-h-0">
              <img
                src={photos[0]!.fullUrl}
                alt=""
                className="max-w-full max-h-full object-contain book-photo"
              />
            </div>
          )}
          {/* Bottom: two smaller photos */}
          <div className="flex-1 flex gap-2 sm:gap-3 min-h-0">
            {photos[1] && (
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={photos[1]!.fullUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain book-photo"
                />
              </div>
            )}
            {photos[2] && (
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={photos[2]!.fullUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain book-photo"
                />
              </div>
            )}
          </div>
        </div>
        <Caption text={page.caption} className="text-center mt-3" />
      </div>
    );
  };

  const renderOffset = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex h-full px-6 sm:px-10 py-6 sm:py-10 gap-6 sm:gap-10">
        {/* Photo takes ~65% */}
        {photo && (
          <div className="flex-[3] flex items-center justify-center min-h-0">
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
          </div>
        )}
        {/* Caption takes ~35% */}
        {page.caption && (
          <div className="flex-[2] flex flex-col justify-center">
            <div className="book-divider mb-4" />
            <p className="book-caption text-xs sm:text-sm leading-relaxed">{page.caption}</p>
          </div>
        )}
      </div>
    );
  };

  const renderDuoStacked = (page: BookPage) => {
    const photo1 = getPhoto(page.photoIds[0]);
    const photo2 = getPhoto(page.photoIds[1]);
    return (
      <div className="flex flex-col h-full px-10 sm:px-16 py-6 sm:py-8 gap-3 sm:gap-4">
        {photo1 && (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <img
              src={photo1.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
          </div>
        )}
        {photo2 && (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <img
              src={photo2.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
          </div>
        )}
        <Caption text={page.caption} className="text-center" />
      </div>
    );
  };

  const renderTextPage = (page: BookPage) => {
    return (
      <div className="flex flex-col items-center justify-center h-full px-12 sm:px-24 py-16">
        <div className="book-divider mb-6" />
        <p
          className="book-serif text-xl sm:text-3xl text-center leading-snug"
          style={{ color: "var(--book-text)" }}
        >
          {page.textContent || page.caption || ""}
        </p>
        {page.subtitle && (
          <p
            className="book-sans text-xs sm:text-sm mt-6 tracking-wide uppercase"
            style={{ color: "var(--book-caption)", letterSpacing: "0.12em" }}
          >
            {page.subtitle}
          </p>
        )}
        <div className="book-divider mt-6" />
      </div>
    );
  };

  const renderClosing = (page: BookPage) => {
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex flex-col items-center justify-center h-full px-12 sm:px-20 py-10 sm:py-14">
        {photo && (
          <div className="flex-1 flex items-center justify-center w-full min-h-0 mb-4">
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain book-photo"
            />
          </div>
        )}
        <Divider />
        {page.caption && (
          <p
            className="book-serif text-base sm:text-lg text-center mt-3 max-w-sm leading-relaxed"
            style={{ color: "var(--book-text)" }}
          >
            {page.caption}
          </p>
        )}
      </div>
    );
  };

  const renderPage = (page: BookPage) => {
    switch (page.type) {
      case "cover":
        return renderCover(page);
      case "full-bleed":
        return renderFullBleed(page);
      case "spread":
        return renderSpread(page);
      case "single":
        return renderSingle(page);
      case "panoramic":
        return renderPanoramic(page);
      case "grid":
        return renderGrid(page);
      case "offset":
        return renderOffset(page);
      case "duo-stacked":
        return renderDuoStacked(page);
      case "text-page":
        return renderTextPage(page);
      case "closing":
        return renderClosing(page);
      default:
        return renderSingle(page);
    }
  };

  const animClass = direction === "forward" ? "page-enter" : "page-enter-reverse";

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto px-4 h-full">
      {/* Book display */}
      <div
        ref={bookRef}
        className="book-page rounded-sm shadow-xl border border-stone-200/60 aspect-[4/3] w-full flex flex-col overflow-hidden"
      >
        <div key={currentPage} className={`flex-1 min-h-0 ${animClass}`}>
          {renderPage(pages[currentPage])}
        </div>
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-center gap-6 mt-5">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage === 0}
          className="text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors px-2 py-1"
          aria-label="Previous page"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 4L7 10L13 16" />
          </svg>
        </button>
        <span className="text-xs text-stone-400 book-sans tracking-widest tabular-nums">
          {currentPage + 1} / {pages.length}
        </span>
        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage === pages.length - 1}
          className="text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors px-2 py-1"
          aria-label="Next page"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 4L13 10L7 16" />
          </svg>
        </button>
      </div>

      {/* Edit bar */}
      <div className="flex gap-2 mt-5">
        <input
          type="text"
          value={editInput}
          onChange={(e) => setEditInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEdit()}
          placeholder={
            isEditing
              ? "Updating your book..."
              : 'Edit with natural language... e.g. "swap page 3 photo"'
          }
          disabled={isEditing}
          className="flex-1 border border-stone-200 rounded-full px-4 py-2.5 text-sm book-sans focus:outline-none focus:border-stone-400 disabled:opacity-50 bg-white"
        />
        <button
          onClick={handleEdit}
          disabled={isEditing || !editInput.trim()}
          className="bg-stone-800 text-white rounded-full px-5 py-2.5 text-sm book-sans font-medium disabled:opacity-30 hover:bg-stone-900 transition-colors"
        >
          {isEditing ? "..." : "Edit"}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4 mb-6 justify-center">
        <button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="border border-stone-200 rounded-full px-5 py-2 text-sm book-sans hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          {isExporting ? "Generating PDF..." : "Download PDF"}
        </button>
        <button
          onClick={() => {
            const url = window.location.href;
            navigator.clipboard?.writeText(url);
          }}
          className="border border-stone-200 rounded-full px-5 py-2 text-sm book-sans hover:bg-stone-50 transition-colors"
        >
          Share link
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
          className="text-sm text-stone-400 hover:text-stone-600 px-3 py-2 book-sans"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
