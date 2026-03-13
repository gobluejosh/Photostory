import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { PhotoBook, PhotoScore } from "@/lib/types";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { instruction, currentBook, availablePhotos, photoScores, interviewAnswers, generateInitial } = await req.json();
    // availablePhotos: Array of { id, thumbnailDataUrl }
    // photoScores: PhotoScore[]

    const imageContent: Anthropic.Messages.ContentBlockParam[] = [];
    const photosToShow = availablePhotos.slice(0, 30); // limit for context

    for (const photo of photosToShow) {
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
        text: `[Photo ID: ${photo.id}] Score: ${(photoScores as PhotoScore[]).find((s: PhotoScore) => s.photoId === photo.id)?.score || "N/A"} - ${(photoScores as PhotoScore[]).find((s: PhotoScore) => s.photoId === photo.id)?.reason || ""} Tags: ${(photoScores as PhotoScore[]).find((s: PhotoScore) => s.photoId === photo.id)?.tags?.join(", ") || ""}`,
      });
    }

    let prompt: string;

    if (generateInitial) {
      prompt = `Create a beautiful photo book layout using these scored photos.

Context:
- Occasion: ${interviewAnswers.occasion}
- Mood: ${interviewAnswers.mood}
- Must include: ${interviewAnswers.mustInclude}
- Notes: ${interviewAnswers.additionalContext}

Select the best 15-25 photos (prioritize higher-scored ones) and arrange them into a compelling narrative.

Return a JSON object with this structure:
{
  "title": "Book Title",
  "subtitle": "Optional subtitle",
  "aesthetic": "minimal",
  "pages": [
    {"id": "page_1", "type": "cover", "photoIds": ["one_photo_id"], "caption": "Cover caption"},
    {"id": "page_2", "type": "spread", "photoIds": ["id1", "id2"], "caption": "Optional caption"},
    {"id": "page_3", "type": "single", "photoIds": ["one_photo_id"], "caption": "Optional caption"},
    ...
    {"id": "page_N", "type": "closing", "photoIds": ["one_photo_id"], "caption": "Closing thought"}
  ]
}

Rules:
- "cover" page: exactly 1 photo, should be the most impactful
- "spread" pages: exactly 2 photos that pair well together
- "single" pages: 1 photo that deserves focus
- "closing" page: 1 photo, reflective/emotional ending
- Mix spreads and singles for visual rhythm
- Write warm, personal captions that enhance the story (not describe what's visible)
- Use the available photo IDs ONLY
- Aim for 8-14 pages total

Return ONLY the JSON object.`;
    } else {
      prompt = `Here is the current photo book layout:
${JSON.stringify(currentBook, null, 2)}

The user wants to make this edit: "${instruction}"

Modify the book accordingly. You can:
- Swap photos (use available photo IDs from the images shown)
- Reorder pages
- Change captions
- Add or remove pages
- Change the title/subtitle

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
