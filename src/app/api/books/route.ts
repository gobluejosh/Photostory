import { put, list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { SavedBook } from "@/lib/types";

// POST: Save a new book or update an existing one
export async function POST(req: NextRequest) {
  try {
    const data: SavedBook = await req.json();

    await put(`photostory/books/${data.id}.json`, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("Save book error:", error);
    return NextResponse.json({ error: "Failed to save book" }, { status: 500 });
  }
}

// GET: List all saved books (summary only)
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "photostory/books/" });

    const books: {
      id: string;
      title: string;
      subtitle?: string;
      coverPhotoUrl?: string;
      pageCount: number;
      updatedAt: string;
    }[] = [];

    for (const blob of blobs) {
      if (!blob.pathname.endsWith(".json")) continue;
      try {
        const res = await fetch(blob.url);
        const data: SavedBook = await res.json();
        // Find cover photo URL
        const coverPage = data.book.pages.find((p) => p.type === "cover");
        const coverPhotoId = coverPage?.photoIds[0];
        const coverPhotoUrl = coverPhotoId ? data.photoUrls[coverPhotoId] : undefined;

        books.push({
          id: data.id,
          title: data.book.title,
          subtitle: data.book.subtitle,
          coverPhotoUrl,
          pageCount: data.book.pages.length,
          updatedAt: data.updatedAt,
        });
      } catch {
        // skip corrupted entries
      }
    }

    // Sort by most recently updated
    books.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ books });
  } catch (error) {
    console.error("List books error:", error);
    return NextResponse.json({ error: "Failed to list books" }, { status: 500 });
  }
}
