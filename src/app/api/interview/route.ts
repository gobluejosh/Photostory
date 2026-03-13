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
              text: `I have ${photoCount} photos I want to turn into a beautiful photo book. Above is a representative sample from the collection.

Your job: study these photos carefully and generate 4-5 thoughtful, specific interview questions that will help you curate and sequence the best photos into a compelling book.

IMPORTANT GUIDELINES FOR YOUR QUESTIONS:
- First, internally note what you observe: Who are the people? What's the setting/event? What activities? What's the vibe? Are there recurring subjects?
- Then ask questions that FILL IN what you can't determine from the photos alone.
- Every question must be DIFFERENT in what it's trying to learn. No redundancy.

YOUR QUESTIONS SHOULD COVER THESE AREAS (one question per area):
1. **The story**: What is this collection about? Reference specific things you see to show you've looked at the photos. (e.g. "I can see a group at what looks like a lakehouse — what was the occasion?")
2. **The people**: If you see people, ask who they are and who should be featured most prominently. Name specific observations. (e.g. "I notice a couple that appears in several shots — who are they and are they the focus?")
3. **Preferences**: Ask about their preference between people-focused shots vs. scenery/details/atmosphere shots, and whether they want the story told chronologically or thematically.
4. **Mood & tone**: What feeling should the book evoke? Playful? Nostalgic? Elegant? Adventurous?
5. **Must-haves & exclusions**: Any specific moments, people, or things that absolutely must (or must not) be included?

RULES:
- Be warm and conversational
- Reference SPECIFIC things you actually see in the sample photos — prove you looked at them
- Do NOT ask generic/vague questions like "tell me about these photos" or "what's the story"
- Each question must target a DISTINCT piece of information
- Return ONLY a JSON array, no other text

Format: [{"id": "story", "question": "..."}, {"id": "people", "question": "..."}, {"id": "preferences", "question": "..."}, {"id": "mood", "question": "..."}, {"id": "must_haves", "question": "..."}]`,
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
