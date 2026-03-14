import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { PhotoBook, PhotoScore } from "@/lib/types";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const {
      instruction,
      currentBook,
      availablePhotos,
      photoScores,
      interviewAnswers,
      generateInitial,
    } = await req.json();

    const imageContent: Anthropic.Messages.ContentBlockParam[] = [];
    const targetCount = interviewAnswers?.targetPhotoCount || 30;
    const photosToShow = availablePhotos.slice(0, targetCount);

    for (const photo of photosToShow) {
      const score = (photoScores as PhotoScore[]).find(
        (s: PhotoScore) => s.photoId === photo.id
      );
      imageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: photo.thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, ""),
        },
      });
      imageContent.push({
        type: "text",
        text: `[Photo ID: ${photo.id}] Score: ${score?.score || "N/A"} | ${score?.reason || ""} | Tags: ${score?.tags?.join(", ") || ""} | Content: ${(score as PhotoScore & { contentHash?: string })?.contentHash || ""}`,
      });
    }

    let prompt: string;

    if (generateInitial) {
      prompt = `You are a premium photo book designer creating an Artifact Uprising-quality layout for a LAYFLAT photo book. Design a beautiful, elevated photo book from these curated photos.

CREATOR'S VISION (from interview):
${interviewAnswers.summary}

LAYFLAT BOOK FORMAT:
This book is displayed as a layflat photo book — pages are shown as two-page spreads (left + right) with a binding seam down the middle.
- The COVER (page 1) appears alone on the right side of the first spread, with a blank endpaper on the left.
- After the cover, pages are paired: pages 2–3 form a spread, pages 4–5 form a spread, etc.
- THINK IN SPREADS: When designing, consider how facing pages complement each other. Don't put two visually heavy layouts facing each other. Balance a busy page (grid, spread) with a calmer one (single, panoramic). Each spread should feel intentional.
- AIM FOR AN ODD total page count (so the last page sits alone on the left with a blank endpaper on the right, creating a clean ending).

AVAILABLE PAGE LAYOUTS:
- "cover" — 1 photo + title/subtitle. The opening impression. Pick the single most iconic, emotionally powerful shot. TITLE MUST BE SHORT (max 4-5 words). Subtitle max 6-8 words. The cover is displayed small in edit mode — long text will overflow.
- "full-bleed" — 1 photo, edge-to-edge with no margins. Use for breathtaking landscapes, dramatic moments, or the single best photo. Creates visual impact through scale. Use sparingly (1-2 max).
- "spread" — 2 photos side-by-side. Use for complementary pairs: wide + detail, before + after, two perspectives on a moment. Photos should relate but not be redundant.
- "single" — 1 photo with generous whitespace and optional caption. The workhorse layout. Elegant and focused.
- "panoramic" — 1 wide/landscape photo with extra vertical breathing room. Great for scenic or establishing shots.
- "grid" — 3 photos: one large on top, two smaller below. Use for showing variety within a scene or moment. All 3 photos should feel cohesive.
- "offset" — 1 photo positioned to the left, caption beside it on the right. Creates an editorial magazine feel. Use when the caption text is meaningful and adds to the story.
- "duo-stacked" — 2 photos stacked vertically. Different from spread. Good for portrait-oriented photos or creating a before/after or time-lapse feel.
- "closing" — 1 photo + reflective caption. The emotional ending. Pick a contemplative, resonant final image.

DESIGN PRINCIPLES (Artifact Uprising style):
1. EVERY PAGE MUST HAVE AT LEAST ONE PHOTO. No text-only pages. This is a photo book — every single page should feature photography.
2. VARIETY IS ESSENTIAL: Never use the same layout type twice in a row. Alternate between single, spread, grid, offset, etc.
3. PACING: Create visual rhythm — a full-bleed dramatic shot followed by a quiet single, then a lively grid. Like music, vary the energy.
4. SPREAD HARMONY: Think about how left and right pages look together. A full-bleed on the left with a quiet single on the right creates beautiful contrast. Two grids facing each other feels cluttered.
5. WHITESPACE: Many layouts have generous margins. This is intentional. The space makes the photos feel special.
6. CAPTIONS: LESS IS MORE. Most pages should have caption set to null. Only add a caption when it truly adds emotional context — never describe what's visible in the photo. When you do write one, keep it very short (under 10 words). The photos should speak for themselves.
7. NARRATIVE ARC: Structure the book with a beginning (cover, establishing shots), middle (the heart of the story), and end (reflection, closing).
8. SELECT approximately ${targetCount} photos. Never use the same photo twice. Never use near-duplicate scenes.
9. AIM FOR ${Math.max(7, Math.round(targetCount * 0.7))}-${Math.round(targetCount * 1.1)} pages total (odd numbers preferred for clean ending).
10. PHOTO SIZE IS PARAMOUNT: This is a PHOTO book. Photos should be large and immersive. Favor layouts that showcase photos at their biggest: full-bleed, single, panoramic. Use grid and duo-stacked sparingly — tiny photos are hard to see and feel underwhelming.
11. Prefer "full-bleed" and "single" layouts over "grid" and "duo-stacked". Use at most 1 grid page and at most 1 duo-stacked page in the whole book.

EXAMPLE SEQUENCE (thinking in spreads):
Spread 1: [endpaper | cover] → Spread 2: [single | full-bleed] → Spread 3: [panoramic | offset] → Spread 4: [spread | single] → Spread 5: [grid | single] → Spread 6: [duo-stacked | panoramic] → Spread 7: [closing | endpaper]

Return a JSON object:
{
  "title": "Book Title",
  "subtitle": "Optional subtitle",
  "aesthetic": "minimal",
  "pages": [
    {"id": "page_1", "type": "cover", "photoIds": ["id"], "caption": null},
    {"id": "page_2", "type": "single", "photoIds": ["id"], "caption": "..."},
    {"id": "page_3", "type": "full-bleed", "photoIds": ["id"], "caption": null},
    {"id": "page_4", "type": "spread", "photoIds": ["id1", "id2"], "caption": "..."},
    {"id": "page_5", "type": "panoramic", "photoIds": ["id"], "caption": null},
    {"id": "page_6", "type": "grid", "photoIds": ["id1", "id2", "id3"], "caption": null},
    {"id": "page_7", "type": "offset", "photoIds": ["id"], "caption": "A longer, more editorial caption..."},
    {"id": "page_8", "type": "duo-stacked", "photoIds": ["id1", "id2"], "caption": null},
    {"id": "page_9", "type": "single", "photoIds": ["id"], "caption": null},
    {"id": "page_N", "type": "closing", "photoIds": ["id"], "caption": "Reflective ending"}
  ]
}

CRITICAL: Use at least 5 DIFFERENT layout types. Do NOT fall back to mostly "single" pages. Mix it up! Every page MUST have at least one photo in photoIds.

Return ONLY the JSON object.`;
    } else {
      prompt = `Here is the current photo book layout:
${JSON.stringify(currentBook, null, 2)}

The user wants to make this edit: "${instruction}"

CREATOR'S ORIGINAL VISION:
${interviewAnswers.summary}

LAYFLAT BOOK FORMAT: Pages are displayed as two-page spreads. Page 1 (cover) is on the right of the first spread. Then pages 2-3 are a spread, 4-5 are a spread, etc. Consider how facing pages complement each other.

AVAILABLE LAYOUT TYPES: cover, full-bleed, spread, single, panoramic, grid, offset, duo-stacked, closing

Modify the book to fulfill the user's request. You can:
- Swap photos (use available photo IDs from the images shown above)
- Reorder, add, or remove pages
- Change page layout types for better variety
- Rewrite captions (keep them emotional, not descriptive)
- Change title/subtitle
- EVERY page MUST have at least one photo — no text-only pages
- NEVER use the same photo on multiple pages
- NEVER use the same layout type twice in a row
- When swapping, pick a photo that is VISUALLY DIFFERENT from what was there before
- Consider spread harmony: facing pages should complement, not compete

Return the COMPLETE updated book as a JSON object with the same structure.
Return ONLY the JSON object.`;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [...imageContent, { type: "text", text: prompt }],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse book layout" },
        { status: 500 }
      );
    }

    const book: PhotoBook = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ book });
  } catch (error) {
    console.error("Edit book error:", error);
    return NextResponse.json(
      { error: "Failed to edit book" },
      { status: 500 }
    );
  }
}
