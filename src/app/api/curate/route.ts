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

    let allScores: { photoId: string; score: number; reason: string; tags: string[]; contentHash: string }[] = [];

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
          ? `You are curating ${thumbnails.length} photos for a photo book. Here is a batch of ${batch.length}.

CREATOR'S VISION (from interview):
${interviewAnswers.summary}

Score each photo 1-10 based on:
1. **Technical quality** (sharpness, exposure, composition, lighting) — blurry/dark/badly framed = low score
2. **Emotional impact** — does this photo make you feel something? Candid moments > posed shots
3. **Story relevance** — how well does it match what the creator described above?
4. **Uniqueness** — describe what's in each photo with a short "contentHash" (e.g. "two_people_beach_sunset", "group_dinner_table_laughing"). This will be used to eliminate near-duplicates across batches.

CRITICAL: If two photos in this batch show nearly the same scene/moment/pose, give the weaker one a score of 1-3. We want DIVERSITY of moments.

Return a JSON array with objects:
{"photoId": "...", "score": 1-10, "reason": "brief reason", "tags": ["portrait", "landscape", "group", "food", "detail", "action", "scenic", "candid"], "contentHash": "brief_scene_description"}

Return ONLY the JSON array.`
          : `You are doing the FINAL selection for a photo book. These ${batch.length} photos are the shortlist.

CREATOR'S VISION:
${interviewAnswers.summary}

PREVIOUSLY SELECTED content hashes (from other batches — avoid selecting photos that duplicate these scenes):
${allScores.filter(s => s.score >= 7).map(s => s.contentHash).join(", ") || "none yet"}

Score each 1-10 with STRICT standards:
1. **Story fit** — Does this advance the narrative the creator described?
2. **Diversity** — We need variety: different scenes, people, settings, activities. If this photo covers a moment already well-represented, score it LOW (1-4).
3. **People focus** — Based on the interview, weight people shots vs scenery appropriately
4. **Technical excellence** — Only the sharpest, best-composed shots should score 8+
5. **Emotional resonance** — Does this photo capture a genuine moment?

DUPLICATE ELIMINATION: Check contentHash values. If a photo depicts a scene very similar to one already scoring 7+, give it a 1-3 regardless of quality.

Return a JSON array:
{"photoId": "...", "score": 1-10, "reason": "brief reason", "tags": [...], "contentHash": "brief_scene_description"}

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
