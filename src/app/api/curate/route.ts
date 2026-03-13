import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { thumbnails, interviewAnswers, pass } = await req.json();
    // thumbnails: Array of { id, dataUrl }
    // pass: "first" | "second"

    const batchSize = 20;
    const batches: { id: string; dataUrl: string }[][] = [];
    for (let i = 0; i < thumbnails.length; i += batchSize) {
      batches.push(thumbnails.slice(i, i + batchSize));
    }

    let allScores: { photoId: string; score: number; reason: string; tags: string[] }[] = [];

    for (const batch of batches) {
      const imageContent: Anthropic.Messages.ContentBlockParam[] = [];

      for (const photo of batch) {
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

      const prompt =
        pass === "first"
          ? `You are curating photos for a photo book. Score each photo from 1-10 based on:
- Technical quality (sharpness, exposure, composition)
- Visual interest and emotional impact
- Uniqueness (penalize near-duplicates - if you see very similar photos, only score the best one highly)

Context from the creator:
- Occasion: ${interviewAnswers.occasion}
- Desired mood: ${interviewAnswers.mood}
- Must include: ${interviewAnswers.mustInclude}
- Additional notes: ${interviewAnswers.additionalContext}

Return a JSON array with objects containing: photoId, score (1-10), reason (brief), tags (array of descriptive tags like "group", "landscape", "food", "portrait", "action", "detail").
Return ONLY the JSON array, no other text.`
          : `You are doing the final selection for a photo book. These are the shortlisted photos.
Score each from 1-10, considering:
- How well it fits the story: ${interviewAnswers.occasion}
- Desired mood: ${interviewAnswers.mood}
- Diversity of moments (we want variety - different scenes, people, activities)
- Whether the person/thing mentioned here appears: ${interviewAnswers.mustInclude}

Return a JSON array with objects containing: photoId, score (1-10), reason (brief), tags (array).
Return ONLY the JSON array, no other text.`;

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
      if (jsonMatch) {
        const scores = JSON.parse(jsonMatch[0]);
        allScores = [...allScores, ...scores];
      }
    }

    return NextResponse.json({ scores: allScores });
  } catch (error) {
    console.error("Curation error:", error);
    return NextResponse.json({ error: "Failed to curate photos" }, { status: 500 });
  }
}
