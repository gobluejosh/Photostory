import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { SavedBook } from "@/lib/types";

// GET: Load a specific book by ID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { blobs } = await list({ prefix: `photostory/books/${id}.json` });

    if (blobs.length === 0) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const res = await fetch(blobs[0].url);
    const data: SavedBook = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Load book error:", error);
    return NextResponse.json({ error: "Failed to load book" }, { status: 500 });
  }
}
