import { NextRequest, NextResponse } from 'next/server';
import { getKey } from '@/lib/keyVault';
import { generateJson } from '@/lib/providers';
import { PLAN_SCHEMA, CODE_SCHEMA, FIX_SCHEMA, REVIEW_SCHEMA } from '@/lib/schemas';
import { ProviderId, Attachment } from '@/types/framecode';

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
- React/Remotion rules: Only standard HTML elements (div, span, img, svg, video), inline CSS styles or Tailwind classes, spring and interpolate easing, Sequence for scene timing. Import Video from '@remotion/media' for videos and Img for photos. Code must be self-contained and export a component named Composition or App.
- IMPORTANT TOKEN ASSET RULES: Refer to a stock video ONLY as the exact string stock://video/<id>, a stock photo ONLY as stock://image/<id>, and an uploaded file ONLY as asset://<id>. Never write a real URL, blob: URL or data: URL. Always set style={{ objectFit: 'cover', width: '100%', height: '100%' }} on <Video> or <Img> tags to fill the frame cleanly.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, mode, jsonMode } = body as {
      provider: ProviderId;
      model: string;
      mode: 'plan' | 'code' | 'fix' | 'review';
      jsonMode?: boolean;
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
      const { messages, attachments, images } = body as {
        messages: Array<{ role: string; content: string }>;
        attachments?: Attachment[];
        images?: string[];
      };

      const conversationPrompt = Array.isArray(messages)
        ? messages.map((m) => `${m.role}: ${m.content}`).join('\n')
        : String(messages || '');

      let attachmentInfo = '';
      if (Array.isArray(attachments) && attachments.length > 0) {
        attachmentInfo = `\nUser Attached Files:\n${attachments
          .map(
            (a) =>
              `- ${a.name} (id: ${a.id}, kind: ${a.kind}, mime: ${a.mime}, size: ${a.size} bytes${
                a.width ? `, ${a.width}x${a.height}` : ''
              }${a.duration ? `, duration: ${a.duration}s` : ''}) -> Reference token in code as asset://${a.id}`
          )
          .join('\n')}\n`;
      }

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
${attachmentInfo}
User Conversation:
${conversationPrompt}`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        jsonMode,
        system: SYSTEM_INSTRUCTION,
        prompt,
        images: Array.isArray(images) ? images : undefined,
        schema: PLAN_SCHEMA,
      });

      return NextResponse.json(result);
    }

    if (mode === 'code') {
      const { storyboard, stockAssets, attachments, previousCode, userPrompt, videoConfig } = body;

      const sanitizeStockForPrompt = Array.isArray(stockAssets)
        ? stockAssets.map((a) => ({
            kind: a.type === 'photo' ? 'image' : 'video',
            id: String(a.id),
            token: `stock://${a.type === 'photo' ? 'image' : 'video'}/${a.id}`,
            width: a.width,
            height: a.height,
            duration: a.duration,
          }))
        : [];

      const sanitizeAttachmentsForPrompt = Array.isArray(attachments)
        ? attachments.map((a: Attachment) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            token: `asset://${a.id}`,
            width: a.width,
            height: a.height,
            duration: a.duration,
          }))
        : [];

      const prompt = `Write ONE complete, self-contained Remotion React component in TypeScript (TSX).
Requirements:
- Export a component named 'Composition' (e.g. \`export const Composition = () => { ... }\` or \`export default function Composition() { ... }\`).
- Remotion & Media components: You can import from 'react', 'remotion', or '@remotion/media' (Video, Img, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence, AbsoluteFill).
- Use basic HTML elements (div, span, img, svg, video) and inline CSS style objects or Tailwind classes.
- Color palette: cohesive dark or vibrant theme matching the topic.
- Use safe margins (at least 60px from top and bottom for vertical reels).
- Make text punchy, bold, and modern.
- For each scene in the storyboard, wrap it in a <Sequence from={startFrame} durationInFrames={sceneDuration}>.
- ASSET TOKEN MANDATE: Refer to a stock video ONLY as stock://video/<id>, a stock photo ONLY as stock://image/<id>, and an uploaded file ONLY as asset://<id>. NEVER write a real URL, http URL, blob URL or data URL.
- Available Stock Tokens: ${JSON.stringify(sanitizeStockForPrompt, null, 2)}
- Available Uploaded Asset Tokens: ${JSON.stringify(sanitizeAttachmentsForPrompt, null, 2)}
- Target config: width=${videoConfig?.width || 720}, height=${videoConfig?.height || 1280}, fps=${videoConfig?.fps || 30}, durationInFrames=${videoConfig?.durationInFrames || 450}.
${previousCode ? `Previous code to update/improve based on user request ("${userPrompt}"):\n${previousCode}` : ''}
Storyboard:
${JSON.stringify(storyboard, null, 2)}

Return JSON with 'code' containing the full valid TSX string, and 'videoConfig'.`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        jsonMode,
        system: SYSTEM_INSTRUCTION,
        prompt,
        schema: CODE_SCHEMA,
      });

      return NextResponse.json(result);
    }

    if (mode === 'fix') {
      const { code, error, issues, storyboard, videoConfig, stockAssets, attachments } = body;

      const sanitizeStockForPrompt = Array.isArray(stockAssets)
        ? stockAssets.map((a) => ({
            token: `stock://${a.type === 'photo' ? 'image' : 'video'}/${a.id}`,
            width: a.width,
            height: a.height,
            duration: a.duration,
          }))
        : [];

      const sanitizeAttachmentsForPrompt = Array.isArray(attachments)
        ? attachments.map((a: Attachment) => ({
            token: `asset://${a.id}`,
            name: a.name,
            kind: a.kind,
          }))
        : [];

      const prompt = `Fix the Remotion React TSX code that produced errors or visual review issues.
Error / Issues:
${error ? `Runtime / Compilation Error: ${error}\n` : ''}
${issues && issues.length ? `Visual review issues:\n- ${issues.join('\n- ')}\n` : ''}

Original Code (MUST preserve asset tokens like stock://... or asset://...):
${code}

Available Asset Tokens:
- Stock: ${JSON.stringify(sanitizeStockForPrompt)}
- Uploads: ${JSON.stringify(sanitizeAttachmentsForPrompt)}

Storyboard context:
${JSON.stringify(storyboard || [], null, 2)}

Target Config:
${JSON.stringify(videoConfig || { width: 720, height: 1280, fps: 30, durationInFrames: 450 })}

REMINDER: Never insert real URLs or blob URLs. Always keep asset tokens (stock://video/<id>, stock://image/<id>, asset://<id>). Return JSON with full corrected 'code' and 'fixSummary'.`;

      const result = await generateJson({
        provider,
        apiKey,
        model,
        jsonMode,
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
        jsonMode,
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
