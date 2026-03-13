import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { photoCount, sampleThumbnails } = await req.json();

    // Send more samples so Claude gets a real sense of the collection
    const samplesToSend = sampleThumbnails.slice(0, 12);
    const imageContent: Anthropic.Messages.ContentBlockParam[] = samplesToSend
      .map((thumb: string, i: number) => ([
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/jpeg" as const,
            data: thumb.replace(/^data:image\/\w+;base64,/, ""),
          },
        },
        {
          type: "text" as const,
          text: `[Sample ${i + 1} of ${samplesToSend.length}]`,
        },
      ]))
      .flat();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `I have ${photoCount} photos I want to turn into a beautiful photo book. Above is a representative sample from the collection (${samplesToSend.length} of ${photoCount} photos).

IMPORTANT CONTEXT: The user can see ALL ${photoCount} of their photos displayed in a numbered thumbnail strip (numbered 1 through ${photoCount}). The sample numbers you see here correspond to evenly-spaced picks from that full set, NOT to the user's photo numbers. When you reference photos, describe what you see in them rather than citing sample numbers, since your sample numbers won't match the user's photo numbers.

Your job: study these photos carefully and generate exactly 3 short, focused interview questions that will help you curate and sequence the best photos into a compelling book.

CRITICAL RULES:
- Exactly 3 questions. No more, no less.
- Each question must be a SINGLE, simple question. NO multi-part questions. NO "and also" or "Do you X? And what about Y?" — one thing per question.
- Keep questions SHORT — 1-2 sentences max.
- Be warm and conversational.

BEFORE WRITING QUESTIONS, analyze the photos internally:
- Note who appears most frequently — this is likely the most important person/people. Make your best guess about relationships (couple, family, friends, parent+child, etc.)
- Note the setting, event type, activities, and vibe.
- Note recurring themes or subjects.

YOUR 3 QUESTIONS SHOULD COVER:
1. **Confirm your read + the story**: State what you think this collection is about and who the key people are based on what you see. Describe specific photos by what's in them (e.g. "I see what looks like a couple by the lake" or "there's a group dinner shot"). Ask them to confirm and correct your interpretation. This proves you looked carefully and gets the essential context.
2. **Mood & style**: What feeling should the book evoke? Offer 3-4 concrete options based on what you see in the photos (e.g. "These feel warm and candid — should the book lean playful, nostalgic, or more polished/elegant?")
3. **Must-haves or exclusions**: Any specific moments or people that must be included, or anything to leave out? Remind them they can reference photos by their number from the strip above.

Return ONLY a JSON array, no other text.
Format: [{"id": "story", "question": "..."}, {"id": "mood", "question": "..."}, {"id": "must_haves", "question": "..."}]`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const questions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Interview error:", error);
    return NextResponse.json(
      { error: "Failed to generate interview questions" },
      { status: 500 }
    );
  }
}
