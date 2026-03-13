import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { photoCount, sampleThumbnails } = await req.json();

    const imageContent: Anthropic.Messages.ContentBlockParam[] = sampleThumbnails
      .slice(0, 6)
      .map((thumb: string) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: thumb.replace(/^data:image\/\w+;base64,/, ""),
        },
      }));

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
              text: `I have ${photoCount} photos I want to turn into a beautiful photo book. Here are a few samples from the collection.

Based on what you can see, generate 3-4 smart interview questions to help you understand what story I want to tell and what matters to me about these photos.

Return ONLY a JSON array of question objects with "id" and "question" fields. Make the questions warm, conversational, and specific to what you see in the sample photos. Include one question about who must be prominently featured, and one about the overall mood/feeling they want.

Example format:
[{"id": "q1", "question": "These look like they're from a beach vacation! What was the occasion?"}, ...]`,
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
