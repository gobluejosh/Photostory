import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { PhotoBook, PhotoScore } from "@/lib/types";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { instruction, currentBook, availablePhotos, photoScores, interviewAnswers, generateInitial } = await req.json();

    const imageContent: Anthropic.Messages.ContentBlockParam[] = [];
    const photosToShow = availablePhotos.slice(0, 30);

    for (const photo of photosToShow) {
      const score = (photoScores as PhotoScore[]).find((s: PhotoScore) => s.photoId === photo.id);
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
      prompt = `Create a beautiful photo book layout from these curated photos.

CREATOR'S VISION (from interview):
${interviewAnswers.summary}

INSTRUCTIONS:
Select 15-25 photos and arrange them into a compelling visual narrative. Use the scores and content descriptions to guide your choices.

CRITICAL RULES:
- NEVER use the same photo twice
- NEVER use two photos that depict very similar scenes — each page should show a DIFFERENT moment
- Prioritize higher-scored photos but ensure variety in scenes, people, and settings
- Sequence the photos to tell a story — consider chronological flow or thematic grouping based on what the creator said they prefer
- "cover": 1 photo — the single most impactful, iconic shot
- "spread": 2 photos that complement each other (e.g. wide + close-up of same scene, or two related moments)
- "single": 1 photo that deserves full attention
- "closing": 1 photo — reflective, emotional ending
- Aim for 8-14 pages, mixing spreads and singles for visual rhythm
- Write captions that add emotional context or narrative — NOT descriptions of what's visible. Think: "The moment everything clicked" not "People sitting at a table smiling"

Return a JSON object:
{
  "title": "Book Title",
  "subtitle": "Optional subtitle",
  "aesthetic": "minimal",
  "pages": [
    {"id": "page_1", "type": "cover", "photoIds": ["id"], "caption": "..."},
    {"id": "page_2", "type": "spread", "photoIds": ["id1", "id2"], "caption": "..."},
    {"id": "page_3", "type": "single", "photoIds": ["id"], "caption": "..."},
    ...
    {"id": "page_N", "type": "closing", "photoIds": ["id"], "caption": "..."}
  ]
}

Return ONLY the JSON object.`;
    } else {
      prompt = `Here is the current photo book layout:
${JSON.stringify(currentBook, null, 2)}

The user wants to make this edit: "${instruction}"

CREATOR'S ORIGINAL VISION:
${interviewAnswers.summary}

Modify the book to fulfill the user's request. You can:
- Swap photos (use available photo IDs from the images shown above)
- Reorder, add, or remove pages
- Rewrite captions
- Change title/subtitle
- NEVER use the same photo on multiple pages
- When swapping, pick a photo that is VISUALLY DIFFERENT from what was there before

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

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse book layout" }, { status: 500 });
    }

    const book: PhotoBook = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ book });
  } catch (error) {
    console.error("Edit book error:", error);
    return NextResponse.json({ error: "Failed to edit book" }, { status: 500 });
  }
}
