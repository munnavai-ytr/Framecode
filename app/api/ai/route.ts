import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentParameters } from '@google/genai';

function getValidModelName(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel && !envModel.startsWith('AQ.') && envModel !== process.env.GEMINI_API_KEY) {
    const stripped = envModel.replace(/^models\//, '');
    if (stripped.startsWith('gemini-') && stripped !== 'gemini-2.5-flash') {
      return stripped;
    }
  }
  return 'gemini-3.1-flash-lite';
}

const SYSTEM_INSTRUCTION = `You are Framecode, an expert AI video director and Remotion engineer.
You make vertical 9:16 videos by planning storyboards and writing clean, executable Remotion React code.
Guidelines:
- Friendly, clear and concise.
- Do NOT simply agree with everything the user says. Decide what is best. If a request is technically unrealistic (e.g. 10-minute video, 4K, heavy 3D shaders), say so politely in 1-2 sentences and offer the best alternative.
- Ask at most one question, and only when truly needed.
- Reply in the user's language.
- Defaults: vertical 9:16, width 720, height 1280, 30 fps, maximum 60 seconds (usually 10-30s is ideal). Use 1080x1920 only if explicitly requested.
- Video Quality: One consistent color palette, high contrast, large readable typography with safe margins.
- React/Remotion rules: Only standard HTML elements (div, span, img, svg, video), inline CSS styles or Tailwind classes, spring and interpolate easing, Sequence for scene timing. No external font imports or network fetches inside the component code. Code must be self-contained and export a component named Composition or App.
- Stock assets are Pixabay clips or photos. Pixabay videos are mostly landscape, so always set style={{ objectFit: 'cover', width: '100%', height: '100%' }} on <video> or <Img> tags to fill the vertical 9:16 frame cleanly.`;

// Helper that executes generateContent with automatic fallback for high-demand spikes
async function callGemini(
  ai: GoogleGenAI,
  primaryModel: string,
  params: Omit<GenerateContentParameters, 'model'>
) {
  const modelsToTry = Array.from(
    new Set([primaryModel, 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'])
  );
  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model,
      });
      return response;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-route] Model ${model} encountered: ${msg}.`);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw err;
      }
    }
  }

  throw lastError;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not set on the server.' },
        { status: 500 }
      );
    }

    const modelName = getValidModelName();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const body = await req.json();
    const { mode } = body;

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

      const response = await callGemini(ai, modelName, {
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              videoConfig: {
                type: Type.OBJECT,
                properties: {
                  width: { type: Type.INTEGER },
                  height: { type: Type.INTEGER },
                  fps: { type: Type.INTEGER },
                  durationInFrames: { type: Type.INTEGER },
                },
                required: ['width', 'height', 'fps', 'durationInFrames'],
              },
              storyboard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneIndex: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    durationInFrames: { type: Type.INTEGER },
                    onScreenText: { type: Type.STRING },
                    motionIdea: { type: Type.STRING },
                    stockQuery: { type: Type.STRING },
                  },
                  required: ['sceneIndex', 'title', 'durationInFrames', 'onScreenText', 'motionIdea'],
                },
              },
            },
            required: ['reply', 'videoConfig', 'storyboard'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return NextResponse.json(parsed);
    }

    if (mode === 'code') {
      const { storyboard, stockAssets, previousCode, userPrompt, videoConfig } = body;

      const prompt = `Write ONE complete, self-contained Remotion React component in TypeScript (TSX).
Requirements:
- Export a component named 'Composition' (e.g. \`export const Composition = () => { ... }\` or \`export default function Composition() { ... }\`).
- DO NOT import from 'react' or 'remotion' with standard import statements in the output, or if you do, use standard named imports from 'react' and 'remotion' (they are provided in scope: React, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence, AbsoluteFill, Img).
- Available Remotion APIs in scope: useCurrentFrame, useVideoConfig, spring, interpolate, Sequence, AbsoluteFill, Img.
- Use basic HTML elements (div, span, img, svg, video) and inline CSS style objects or Tailwind classes.
- Color palette: cohesive dark or vibrant theme matching the topic.
- Use safe margins (at least 60px from top and bottom for vertical reels).
- Make text punchy, bold, and modern.
- For each scene in the storyboard, wrap it in a <Sequence from={startFrame} durationInFrames={sceneDuration}>.
- Stock assets provided: ${JSON.stringify(stockAssets || [])}. If stock assets are provided, use their URLs via <Img src="..." /> or <video src="..." autoPlay loop muted playsInline /> with objectFit cover.
- Target config: width=${videoConfig?.width || 720}, height=${videoConfig?.height || 1280}, fps=${videoConfig?.fps || 30}, durationInFrames=${videoConfig?.durationInFrames || 450}.
${previousCode ? `Previous code to update/improve based on user request ("${userPrompt}"):\n${previousCode}` : ''}
Storyboard:
${JSON.stringify(storyboard, null, 2)}

Return JSON with 'code' containing the full valid TSX string, and 'videoConfig'.`;

      const response = await callGemini(ai, modelName, {
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: 'Complete TSX code for the Composition' },
              videoConfig: {
                type: Type.OBJECT,
                properties: {
                  width: { type: Type.INTEGER },
                  height: { type: Type.INTEGER },
                  fps: { type: Type.INTEGER },
                  durationInFrames: { type: Type.INTEGER },
                },
                required: ['width', 'height', 'fps', 'durationInFrames'],
              },
            },
            required: ['code', 'videoConfig'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return NextResponse.json(parsed);
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

      const response = await callGemini(ai, modelName, {
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: 'Full corrected TSX code' },
              fixSummary: { type: Type.STRING, description: 'One sentence explaining what was fixed' },
            },
            required: ['code', 'fixSummary'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return NextResponse.json(parsed);
    }

    if (mode === 'review') {
      const { code, images } = body;

      const imageParts = Array.isArray(images)
        ? images.map((img: string) => {
            const cleanBase64 = img.includes(',') ? img.split(',')[1] : img;
            return {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64,
              },
            };
          })
        : [];

      const prompt = `Review these 3 still frames rendered from our Remotion vertical video composition.
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

      const contents = {
        parts: [...imageParts, { text: prompt }],
      };

      const response = await callGemini(ai, modelName, {
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ok: { type: Type.BOOLEAN },
              issues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['ok', 'issues'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return NextResponse.json(parsed);
    }

    return NextResponse.json({ error: `Invalid mode "${mode}"` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('API /api/ai error:', err);

    if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json(
        { error: 'Free limit reached, please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: errorMsg || 'An AI error occurred' }, { status: 500 });
  }
}
