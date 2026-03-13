"use client";

import { useState, useRef } from "react";
import { useApp } from "@/lib/store";
import { BookPage } from "@/lib/types";

export default function BookViewer() {
  const { state, dispatch } = useApp();
  const [currentPage, setCurrentPage] = useState(0);
  const [editInput, setEditInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const bookRef = useRef<HTMLDivElement>(null);

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

      const availablePhotos = topScores.map((s) => {
        const photo = state.photos.find((p) => p.id === s.photoId);
        return {
          id: s.photoId,
          thumbnailDataUrl: photo?.thumbnailDataUrl || "",
        };
      }).filter((p) => p.thumbnailDataUrl);

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

      // Pre-fetch all images used in the book as base64
      const usedPhotoIds = new Set(pages.flatMap((p) => p.photoIds));
      const imageCache: Record<string, string> = {};
      for (const id of usedPhotoIds) {
        const photo = getPhoto(id);
        if (photo) {
          try {
            imageCache[id] = await fetchAsDataUrl(photo.fullUrl);
          } catch { /* skip */ }
        }
      }

      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [800, 600] });
      let firstPage = true;

      for (const page of pages) {
        if (!firstPage) pdf.addPage([800, 600], "landscape");
        firstPage = false;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, 800, 600, "F");

        if (page.type === "cover") {
          const imgData = imageCache[page.photoIds[0]];
          if (imgData) {
            try { pdf.addImage(imgData, "JPEG", 100, 40, 600, 400); } catch {}
          }
          pdf.setFontSize(28);
          pdf.setFont("helvetica", "bold");
          pdf.text(book.title, 400, 490, { align: "center" });
          if (book.subtitle) {
            pdf.setFontSize(14);
            pdf.setFont("helvetica", "normal");
            pdf.text(book.subtitle, 400, 520, { align: "center" });
          }
        } else if (page.type === "spread") {
          const img1 = imageCache[page.photoIds[0]];
          const img2 = imageCache[page.photoIds[1]];
          if (img1) {
            try { pdf.addImage(img1, "JPEG", 20, 40, 370, 440); } catch {}
          }
          if (img2) {
            try { pdf.addImage(img2, "JPEG", 410, 40, 370, 440); } catch {}
          }
          if (page.caption) {
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "italic");
            pdf.text(page.caption, 400, 510, { align: "center", maxWidth: 600 });
          }
        } else {
          const imgData = imageCache[page.photoIds[0]];
          if (imgData) {
            try { pdf.addImage(imgData, "JPEG", 150, 30, 500, 420); } catch {}
          }
          if (page.caption) {
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "italic");
            pdf.text(page.caption, 400, 490, { align: "center", maxWidth: 500 });
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

  const renderPage = (page: BookPage) => {
    if (page.type === "cover") {
      const photo = getPhoto(page.photoIds[0]);
      return (
        <div className="flex flex-col items-center justify-center h-full p-6">
          {photo && (
            <div className="w-full max-h-[60%] flex items-center justify-center mb-6">
              <img
                src={photo.fullUrl}
                alt=""
                className="max-w-full max-h-full object-contain rounded-sm shadow-lg"
              />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-center">
            {book.title}
          </h1>
          {book.subtitle && (
            <p className="text-gray-400 text-sm mt-2 text-center">{book.subtitle}</p>
          )}
        </div>
      );
    }

    if (page.type === "spread") {
      const photo1 = getPhoto(page.photoIds[0]);
      const photo2 = getPhoto(page.photoIds[1]);
      return (
        <div className="flex flex-col h-full p-4">
          <div className="flex-1 flex gap-2 min-h-0">
            {photo1 && (
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={photo1.fullUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain rounded-sm"
                />
              </div>
            )}
            {photo2 && (
              <div className="flex-1 flex items-center justify-center">
                <img
                  src={photo2.fullUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain rounded-sm"
                />
              </div>
            )}
          </div>
          {page.caption && (
            <p className="text-center text-gray-500 text-xs sm:text-sm italic mt-3 px-4">
              {page.caption}
            </p>
          )}
        </div>
      );
    }

    // single or closing
    const photo = getPhoto(page.photoIds[0]);
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        {photo && (
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <img
              src={photo.fullUrl}
              alt=""
              className="max-w-full max-h-full object-contain rounded-sm shadow-sm"
            />
          </div>
        )}
        {page.caption && (
          <p className="text-center text-gray-500 text-xs sm:text-sm italic mt-4 px-4 max-w-md">
            {page.caption}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto px-4 h-full">
      {/* Book display */}
      <div ref={bookRef} className="bg-white rounded-xl shadow-lg border border-gray-100 aspect-[4/3] w-full flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">{renderPage(pages[currentPage])}</div>
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          className="text-gray-400 hover:text-black disabled:opacity-20 text-xl px-3"
        >
          &larr;
        </button>
        <span className="text-xs text-gray-400">
          {currentPage + 1} / {pages.length}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))}
          disabled={currentPage === pages.length - 1}
          className="text-gray-400 hover:text-black disabled:opacity-20 text-xl px-3"
        >
          &rarr;
        </button>
      </div>

      {/* Edit bar */}
      <div className="flex gap-2 mt-4">
        <input
          type="text"
          value={editInput}
          onChange={(e) => setEditInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleEdit()}
          placeholder={isEditing ? "Updating your book..." : "Edit with natural language... e.g. \"swap page 3 photo\""}
          disabled={isEditing}
          className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400 disabled:opacity-50"
        />
        <button
          onClick={handleEdit}
          disabled={isEditing || !editInput.trim()}
          className="bg-black text-white rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-30 hover:bg-gray-800 transition-colors"
        >
          {isEditing ? "..." : "Edit"}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4 mb-6 justify-center">
        <button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="border border-gray-200 rounded-full px-5 py-2 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isExporting ? "Generating PDF..." : "Download PDF"}
        </button>
        <button
          onClick={() => {
            const url = window.location.href;
            navigator.clipboard?.writeText(url);
          }}
          className="border border-gray-200 rounded-full px-5 py-2 text-sm hover:bg-gray-50 transition-colors"
        >
          Share link
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: "upload" })}
          className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
