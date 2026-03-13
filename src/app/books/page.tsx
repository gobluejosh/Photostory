"use client";

import { useEffect, useState } from "react";

interface BookSummary {
  id: string;
  title: string;
  subtitle?: string;
  coverPhotoUrl?: string;
  pageCount: number;
  updatedAt: string;
}

export default function BooksIndexPage() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/books");
        const data = await res.json();
        setBooks(data.books || []);
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main className="min-h-dvh py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="book-serif text-3xl" style={{ color: "var(--book-text)" }}>
              My Books
            </h1>
            <p className="text-sm text-stone-400 book-sans mt-1">
              {books.length} {books.length === 1 ? "book" : "books"} created
            </p>
          </div>
          <a
            href="/"
            className="bg-stone-800 text-white rounded-full px-5 py-2.5 text-sm book-sans font-medium hover:bg-stone-900 transition-colors"
          >
            Create new book
          </a>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-stone-400 book-sans animate-pulse">Loading your books...</p>
          </div>
        )}

        {!loading && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-stone-400 book-sans text-sm">No books yet</p>
            <a
              href="/"
              className="text-stone-500 hover:text-stone-700 book-sans text-sm underline"
            >
              Create your first photo book
            </a>
          </div>
        )}

        {!loading && books.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {books.map((book) => (
              <a
                key={book.id}
                href={`/book/${book.id}`}
                className="group block rounded-lg overflow-hidden border border-stone-200/60 hover:border-stone-300 transition-all hover:shadow-lg"
              >
                {/* Cover image */}
                <div className="aspect-[4/3] bg-stone-100 relative overflow-hidden">
                  {book.coverPhotoUrl ? (
                    <img
                      src={book.coverPhotoUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-stone-300 book-serif text-2xl">{book.title[0]}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4" style={{ background: "var(--book-bg)" }}>
                  <h2 className="book-serif text-lg" style={{ color: "var(--book-text)" }}>
                    {book.title}
                  </h2>
                  {book.subtitle && (
                    <p className="text-xs text-stone-400 book-sans mt-0.5">{book.subtitle}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-stone-400 book-sans">
                      {book.pageCount} pages
                    </span>
                    <span className="text-[11px] text-stone-300">&middot;</span>
                    <span className="text-[11px] text-stone-400 book-sans">
                      {new Date(book.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
