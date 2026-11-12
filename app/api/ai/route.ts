import { NextRequest, NextResponse } from 'next/server';
import { getKey } from '@/lib/keyVault';
import { generateJson } from '@/lib/providers';
import { PLAN_SCHEMA, CODE_SCHEMA, FIX_SCHEMA, REVIEW_SCHEMA } from '@/lib/schemas';
import { ProviderId } from '@/types/framecode';

export const runtime = 'nodejs';

const SYSTEM_INSTRUCTION = `You are Framecode, an expert AI video director and Remotion engineer.
You make vertical 9:16 videos by planning storyboards and writing clean, executable Remotion React code.
Guidelines:
- Friendly, clear and concise.
- Do NOT simply agree with everything the user says. Decide what is best. If a request is technically unrealistic (e.g. 10-minute video, 4K, heavy 3D shaders), say so politely in 1-2 sentences and offer the best alternative.
- Ask at most one question, and only when truly needed.
- Reply in the user's language.
- Defaults: vertical 9:16, width 720, height 1280, 30 fps, maximum 60 seconds (usually 10-30s is ideal). Use 1080x1920 only if explicitly requested.
- Video Quality: One consistent color palette, high contrast, large readable typography with safe margins.
- React/Remotion rules: Only standard HTML elements (div, span, img, svg, video), inline CSS styles or Tailwind classes, spring and interpolate easing, Sequence for scene timing. Import Video from '@remotion/media' or use <Video src="..." style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> for video clips, and <Img src="..." /> for photos. No external font imports or network fetches inside the component code. Code must be self-contained and export a component named Composition or App.
- Stock assets are Pixabay clips or photos. Pixabay videos are mostly landscape, so always set style={{ objectFit: 'cover', width: '100%', height: '100%' }} on <Video> or <Img> tags to fill the vertical 9:16 frame cleanly.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, mode } = body as {
      provider: ProviderId;
      model: string;
      mode: 'plan' | 'code' | 'fix' | 'review';
    };

    if (!provider || !['claude', 'openrouter', 'gemini'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
    }

    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing model selection' }, { status: 400 });
    }

    const apiKey = await getKey(provider);
    if (!apiKey) {
      return NextResponse.json(
        {
          error: `No API key configured for ${provider.toUpperCase()}. Please add your API key in Settings.`,
          action: 'open-settings',
        },
        { status: 400 }
      );
    }

    if (mode === 'plan') {
      const { messages } = body;
      const conversationPrompt = Array.isArray(messages)
        ? messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')
        : String(messages || '');

      const prompt = `Based on the user request, plan a high-impact vertical video.
Provide:
1. A short, friendly reply explaining the creative direction.
2. videoConfig with width (default 720), height (default 1280), fps (default 30), and durationInFrames (e.g. 450 for 15s).
3. A storyboard array of scenes. Each scene needs:
   - sceneIndex (1-based integer)
   - title (short scene title)
   - durationInFrames (integer, sum must equal videoConfig.durationInFrames)
   - onScreenText (key headline/hook text)
   - motionIdea (animation concept with spring/easing)
   - stockQuery (optional short search query for Pixabay stock video/photo if relevant, or empty string)

User Conversation:
${conversationPrompt}`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        system: SYSTEM_INSTRUCTION,
        prompt,
        schema: PLAN_SCHEMA,
      });

      return NextResponse.json(result);
    }

    if (mode === 'code') {
      const { storyboard, stockAssets, previousCode, userPrompt, videoConfig } = body;

      const prompt = `Write ONE complete, self-contained Remotion React component in TypeScript (TSX).
Requirements:
- Export a component named 'Composition' (e.g. \`export const Composition = () => { ... }\` or \`export default function Composition() { ... }\`).
- Remotion & Media components: You can import from 'react', 'remotion', or '@remotion/media' (Video, Img, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence, AbsoluteFill).
- Use basic HTML elements (div, span, img, svg, video) and inline CSS style objects or Tailwind classes.
- Color palette: cohesive dark or vibrant theme matching the topic.
- Use safe margins (at least 60px from top and bottom for vertical reels).
- Make text punchy, bold, and modern.
- For each scene in the storyboard, wrap it in a <Sequence from={startFrame} durationInFrames={sceneDuration}>.
- Stock assets provided: ${JSON.stringify(stockAssets || [])}. If stock assets are provided, use their URLs via <Img src="..." /> for photos or <Video src="..." style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> for videos.
- Target config: width=${videoConfig?.width || 720}, height=${videoConfig?.height || 1280}, fps=${videoConfig?.fps || 30}, durationInFrames=${videoConfig?.durationInFrames || 450}.
${previousCode ? `Previous code to update/improve based on user request ("${userPrompt}"):\n${previousCode}` : ''}
Storyboard:
${JSON.stringify(storyboard, null, 2)}

Return JSON with 'code' containing the full valid TSX string, and 'videoConfig'.`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        system: SYSTEM_INSTRUCTION,
        prompt,
        schema: CODE_SCHEMA,
      });

      return NextResponse.json(result);
    }

    if (mode === 'fix') {
      const { code, error, issues, storyboard, videoConfig } = body;

      const prompt = `Fix the Remotion React TSX code that produced errors or visual review issues.
Error / Issues:
${error ? `Runtime / Compilation Error: ${error}\n` : ''}
${issues && issues.length ? `Visual review issues:\n- ${issues.join('\n- ')}\n` : ''}

Original Code:
${code}

Storyboard context:
${JSON.stringify(storyboard || [], null, 2)}

Target Config:
${JSON.stringify(videoConfig || { width: 720, height: 1280, fps: 30, durationInFrames: 450 })}

Return JSON with the full corrected 'code' and a brief 'fixSummary'.`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        system: SYSTEM_INSTRUCTION,
        prompt,
        schema: FIX_SCHEMA,
      });

      return NextResponse.json(result);
    }

    if (mode === 'review') {
      const { code, images } = body;
      const imageList = Array.isArray(images) ? images : [];

      const prompt = `Review these rendered still frame screenshots from our Remotion vertical video composition.
Check for:
1. Cut off or clipped text, or text overflowing beyond the 9:16 boundaries.
2. Low contrast between text and background.
3. Blank, empty, or unrendered canvas frames.
4. Overlapping visual elements that make reading difficult.

Code being reviewed:
${(code || '').slice(0, 1500)}

Return JSON:
- ok: true if frames look good, false if there are clear visual issues.
- issues: array of concise string descriptions of visual problems (empty array if ok: true).`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        system: SYSTEM_INSTRUCTION,
        prompt,
        images: imageList,
        schema: REVIEW_SCHEMA,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Invalid mode "${mode}"` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('API /api/ai error:', err);

    return NextResponse.json({ error: errorMsg || 'An AI error occurred' }, { status: 500 });
  }
}
