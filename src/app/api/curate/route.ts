import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Pro tier: up to 300s for large photo sets
export const maxDuration = 300;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { thumbnails, interviewAnswers } = await req.json();
    // thumbnails: Array of { id, dataUrl }

    const imageContent: Anthropic.Messages.ContentBlockParam[] = [];

    for (const photo of thumbnails) {
      imageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: photo.dataUrl.replace(/^data:image\/\w+;base64,/, ""),
        },
      });
      imageContent.push({
        type: "text",
        text: `[Photo ID: ${photo.id}]`,
      });
    }

    const prompt = `You are curating photos for a premium photo book. Here are ${thumbnails.length} photos to evaluate.

CREATOR'S VISION (from interview):
${interviewAnswers.summary}

Score each photo 1-10 based on:
1. **Technical quality** (sharpness, exposure, composition, lighting) — blurry/dark/badly framed = low score
2. **Emotional impact** — does this photo make you feel something? Candid moments > posed shots
3. **Story relevance** — how well does it match what the creator described above?
4. **Uniqueness** — if two or more photos show nearly the same scene/moment/pose, keep only the strongest and score the rest 1-3. We want DIVERSITY of moments.

CRITICAL: You can see ALL the photos at once. Use this to make holistic decisions — compare across the full set and eliminate redundancy. Only the best version of each moment should score high.

Return a JSON array with objects:
{"photoId": "...", "score": 1-10, "reason": "brief reason", "tags": ["portrait", "landscape", "group", "food", "detail", "action", "scenic", "candid"]}

Return ONLY the JSON array.`;

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
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const scores = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return NextResponse.json({ scores });
  } catch (error) {
    console.error("Curation error:", error);
    const message = error instanceof Error ? error.message : "Failed to curate photos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
