import { GoogleGenAI, Part } from '@google/genai';
import { ProviderId, ModelOption } from '@/types/framecode';
import { jsonSchemaToGeminiSchema } from './schemas';

export interface GenerateJsonOptions {
  provider: ProviderId;
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
  images?: string[]; // base64 strings
  schema: Record<string, unknown>;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface GenerateImageOptions {
  provider: ProviderId;
  model: string;
  apiKey: string;
  prompt: string;
  aspectRatio?: string;
  signal?: AbortSignal;
}

const MAX_IMAGE_BASE64_LEN = 4_000_000;

const PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: 'Claude',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
};

function formatProviderName(provider: ProviderId): string {
  return PROVIDER_NAMES[provider] || provider;
}

function cleanBase64(b64: string): string {
  if (b64.includes(',')) {
    return b64.split(',')[1];
  }
  return b64;
}

function sanitizeErrorMessage(msg: string, apiKey: string): string {
  let cleaned = msg || 'An unknown error occurred.';
  if (apiKey) {
    cleaned = cleaned.replaceAll(apiKey, '[REDACTED]');
  }
  if (cleaned.length > 300) {
    cleaned = cleaned.slice(0, 300) + '...';
  }
  return cleaned;
}

function mapStatusToError(status: number, providerName: string, rawText?: string): string {
  if (status === 401 || status === 403) {
    return `Your ${providerName} API key was rejected. Check it in Settings.`;
  }
  if (status === 429) {
    return `Rate limit or quota reached on your ${providerName} account. Try again later or switch model.`;
  }
  if (status === 402) {
    return `Not enough credits on your ${providerName} account.`;
  }
  if (status === 404) {
    return `This model is not available for your key. Pick another model.`;
  }
  return (rawText || `HTTP ${status} error from ${providerName}`).slice(0, 300);
}

function createCombinedSignal(userSignal?: AbortSignal, timeoutMs = 55000): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
  }, timeoutMs);

  const onUserAbort = () => {
    controller.abort(userSignal?.reason || new DOMException('Aborted', 'AbortError'));
  };

  if (userSignal) {
    if (userSignal.aborted) {
      onUserAbort();
    } else {
      userSignal.addEventListener('abort', onUserAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (userSignal) {
        userSignal.removeEventListener('abort', onUserAbort);
      }
    },
  };
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

// -------------------------------------------------------------
// VERIFY AND LIST MODELS
// -------------------------------------------------------------
export async function verifyAndListModels(
  provider: ProviderId,
  apiKey: string
): Promise<ModelOption[]> {
  const providerName = formatProviderName(provider);
  const timeoutSignal = AbortSignal.timeout(55000);

  try {
    if (provider === 'gemini') {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
        {
          headers: { 'x-goog-api-key': apiKey },
          signal: timeoutSignal,
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(mapStatusToError(res.status, providerName, errText), res.status);
      }

      const data = await res.json();
      const models: ModelOption[] = [];

      if (Array.isArray(data.models)) {
        for (const m of data.models) {
          const name = m.name as string;
          const methods = (m.supportedGenerationMethods as string[]) || [];
          if (name && name.startsWith('models/gemini') && methods.includes('generateContent')) {
            const id = name.replace(/^models\//, '');
            models.push({
              id,
              name: m.displayName || id,
              provider: 'gemini',
              vision: true,
              imageOutput: id.toLowerCase().includes('image'),
            });
          }
        }
      }
      return models;
    }

    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: timeoutSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(mapStatusToError(res.status, providerName, errText), res.status);
      }

      const data = await res.json();
      const models: ModelOption[] = [];

      if (Array.isArray(data.data)) {
        for (const m of data.data) {
          models.push({
            id: m.id,
            name: m.display_name || m.id,
            provider: 'claude',
            vision: true,
          });
        }
      }
      return models;
    }

    if (provider === 'openrouter') {
      // First verify key
      const keyRes = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: timeoutSignal,
      });

      if (!keyRes.ok) {
        const errText = await keyRes.text().catch(() => '');
        throw new ProviderError(mapStatusToError(keyRes.status, providerName, errText), keyRes.status);
      }

      // Fetch text models and image-output models in parallel
      const [modelsRes, imageModelsRes] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/models', { signal: timeoutSignal }),
        fetch('https://openrouter.ai/api/v1/models?output_modalities=image', {
          signal: timeoutSignal,
        }).catch(() => null),
      ]);

      if (!modelsRes.ok) {
        const errText = await modelsRes.text().catch(() => '');
        throw new ProviderError(mapStatusToError(modelsRes.status, providerName, errText), modelsRes.status);
      }

      const data = await modelsRes.json();
      const imageData = imageModelsRes && imageModelsRes.ok ? await imageModelsRes.json().catch(() => null) : null;

      const imageModelIds = new Set<string>();
      const imageModelsRaw: Array<Record<string, unknown>> = [];
      if (imageData && Array.isArray(imageData.data)) {
        for (const m of imageData.data) {
          if (m && typeof m.id === 'string') {
            imageModelIds.add(m.id);
            imageModelsRaw.push(m);
          }
        }
      }

      const byId = new Map<string, ModelOption>();

      if (Array.isArray(data.data)) {
        for (const m of data.data) {
          const outputMods = m.architecture?.output_modalities as string[] | undefined;
          const inputMods = m.architecture?.input_modalities as string[] | undefined;
          const params = m.supported_parameters as string[] | undefined;

          const isImageOut = imageModelIds.has(m.id) || (outputMods?.includes('image') ?? false);
          if (!outputMods || outputMods.includes('text') || isImageOut) {
            byId.set(m.id, {
              id: m.id,
              name: m.name || m.id,
              provider: 'openrouter',
              vision: inputMods?.includes('image') ?? false,
              jsonMode: params?.includes('response_format') ?? false,
              imageOutput: isImageOut,
            });
          }
        }
      }

      for (const m of imageModelsRaw) {
        const id = m.id as string;
        const existing = byId.get(id);
        if (existing) {
          existing.imageOutput = true;
        } else {
          const arch = m.architecture as { input_modalities?: string[] } | undefined;
          const params = m.supported_parameters as string[] | undefined;
          byId.set(id, {
            id,
            name: (typeof m.name === 'string' && m.name) || id,
            provider: 'openrouter',
            vision: arch?.input_modalities?.includes('image') ?? false,
            jsonMode: params?.includes('response_format') ?? false,
            imageOutput: true,
          });
        }
      }

      const models = Array.from(byId.values());
      models.sort((a, b) => a.name.localeCompare(b.name));
      return models;
    }

    throw new ProviderError(`Unsupported provider "${provider}"`, 400);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new ProviderError('The model took too long to respond.', 504);
    }
    const status = (err as { status?: number })?.status || 502;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(sanitizeErrorMessage(msg, apiKey), status);
  }
}

// -------------------------------------------------------------
// GENERATE JSON COMMON ADAPTER
// -------------------------------------------------------------
export async function generateJson(options: GenerateJsonOptions): Promise<Record<string, unknown>> {
  const { provider, model, apiKey, system, prompt, images, schema, jsonMode, signal } = options;
  const providerName = formatProviderName(provider);
  const { signal: combinedSignal, cleanup } = createCombinedSignal(signal, 55000);

  try {
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const contentsParts: Part[] = [];
      if (images && images.length > 0) {
        for (const img of images) {
          contentsParts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64(img),
            },
          });
        }
      }
      contentsParts.push({ text: prompt });

      const geminiSchema = jsonSchemaToGeminiSchema(schema);

      const response = await ai.models.generateContent({
        model,
        contents: { parts: contentsParts },
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseSchema: geminiSchema,
          abortSignal: combinedSignal,
        },
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error('The model output was cut off. Try again or pick another model.');
      }

      const text = response.text || '';
      return JSON.parse(text);
    }

    if (provider === 'claude') {
      const userContent: unknown[] = [{ type: 'text', text: prompt }];
      if (images && images.length > 0) {
        for (const img of images) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: cleanBase64(img),
            },
          });
        }
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        signal: combinedSignal,
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system,
          messages: [{ role: 'user', content: userContent }],
          tools: [
            {
              name: 'respond',
              description: 'Return the final structured answer',
              input_schema: schema,
            },
          ],
          tool_choice: { type: 'tool', name: 'respond' },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(mapStatusToError(res.status, providerName, errText), res.status);
      }

      const data = await res.json();
      if (data.stop_reason === 'max_tokens') {
        throw new Error('The model output was cut off. Try again or pick another model.');
      }

      const toolUseBlock = data.content?.find((b: { type: string }) => b.type === 'tool_use');
      if (toolUseBlock?.input && typeof toolUseBlock.input === 'object') {
        return toolUseBlock.input;
      }

      throw new Error('Claude did not return a valid tool response. Try another model.');
    }

    if (provider === 'openrouter') {
      const fullPromptText = `${prompt}\n\nReturn ONLY a JSON object that matches this JSON Schema:\n${JSON.stringify(schema, null, 2)}`;

      const buildUserContent = () => {
        if (images && images.length > 0) {
          return [
            { type: 'text', text: fullPromptText },
            ...images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${cleanBase64(img)}` },
            })),
          ];
        }
        return fullPromptText;
      };

      const messages: unknown[] = [
        { role: 'system', content: system },
        { role: 'user', content: buildUserContent() },
      ];

      const requestBody: Record<string, unknown> = {
        model,
        messages,
      };

      if (jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const executeRequest = async (msgList: unknown[]) => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'Framecode',
          },
          signal: combinedSignal,
          body: JSON.stringify({
            ...requestBody,
            messages: msgList,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new ProviderError(mapStatusToError(res.status, providerName, errText), res.status);
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        if (choice?.finish_reason === 'length') {
          throw new Error('The model output was cut off. Try again or pick another model.');
        }

        return (choice?.message?.content as string) || '';
      };

      const parseAndValidateText = (rawText: string): Record<string, unknown> | null => {
        let text = rawText.trim();
        if (text.startsWith('```')) {
          const firstNewline = text.indexOf('\n');
          if (firstNewline !== -1) text = text.slice(firstNewline + 1);
        }
        if (text.endsWith('```')) {
          text = text.slice(0, text.lastIndexOf('```')).trim();
        }

        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

        const jsonSub = text.slice(startIdx, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonSub);
          if (typeof parsed !== 'object' || parsed === null) return null;

          // Verify required keys if specified in schema
          const requiredKeys = (schema.required as string[]) || [];
          for (const key of requiredKeys) {
            if (!(key in parsed)) {
              return null;
            }
          }
          return parsed;
        } catch {
          return null;
        }
      };

      const firstResponseText = await executeRequest(messages);
      const parsedObj = parseAndValidateText(firstResponseText);
      if (parsedObj) return parsedObj;

      // Retry ONCE with user message
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: firstResponseText },
        { role: 'user', content: 'Your last reply was not valid JSON. Return only the JSON object.' },
      ];

      const secondResponseText = await executeRequest(retryMessages);
      const retryParsedObj = parseAndValidateText(secondResponseText);
      if (retryParsedObj) return retryParsedObj;

      throw new Error('The model did not return valid JSON. Try another model.');
    }

    throw new ProviderError(`Unsupported provider "${provider}"`, 400);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new ProviderError('The model took too long to respond. Try again or pick another model.', 504);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    const status = (err as { status?: number })?.status || 500;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(sanitizeErrorMessage(msg, apiKey), status);
  } finally {
    cleanup();
  }
}

// -------------------------------------------------------------
// GENERATE IMAGE ADAPTER
// -------------------------------------------------------------
export async function generateImage(
  options: GenerateImageOptions
): Promise<{ mime: string; data: string }> {
  const { provider, model, apiKey, prompt, aspectRatio = '1:1', signal } = options;

  if (provider === 'claude') {
    throw new ProviderError('Claude cannot create images.', 400);
  }

  const providerName = formatProviderName(provider);
  const { signal: combinedSignal, cleanup } = createCombinedSignal(signal, 55000);

  try {
    if (provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const callGeminiImage = async (generationConfig: Record<string, unknown>) => {
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          signal: combinedSignal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
          }),
        });
      };

      let res = await callGeminiImage({
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio, imageSize: '1K' },
      });

      if (res.status === 400) {
        res = await callGeminiImage({
          responseModalities: ['TEXT', 'IMAGE'],
        });
      }

      if (res.status === 400) {
        res = await callGeminiImage({
          responseModalities: ['IMAGE'],
        });
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderError(mapStatusToError(res.status, providerName, errText), res.status);
      }

      const data = await res.json();
      const parts = (data.candidates?.[0]?.content?.parts || []) as Array<{
        thought?: boolean;
        inlineData?: { mimeType?: string; data?: string };
      }>;

      let chosen: { mimeType?: string; data?: string } | null = null;
      for (const part of parts) {
        if (part.thought === true) continue;
        if (part.inlineData?.data) {
          chosen = part.inlineData;
        }
      }

      if (!chosen?.data) {
        throw new ProviderError('Gemini did not return an image. Try another model.', 502);
      }

      if (chosen.data.length > MAX_IMAGE_BASE64_LEN) {
        throw new ProviderError(
          'The image is too large to return from the server. Try a smaller aspect ratio or another model.',
          413
        );
      }

      return {
        mime: chosen.mimeType || 'image/png',
        data: chosen.data,
      };
    }

    if (provider === 'openrouter') {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Framecode',
      };

      const imagesRes = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers,
        signal: combinedSignal,
        body: JSON.stringify({
          model,
          prompt,
        }),
      });

      if (imagesRes.ok) {
        const imgJson = await imagesRes.json();
        const b64 = imgJson?.data?.[0]?.b64_json as string | undefined;
        if (b64) {
          if (b64.length > MAX_IMAGE_BASE64_LEN) {
            throw new ProviderError(
              'The image is too large to return from the server. Try a smaller aspect ratio or another model.',
              413
            );
          }
          return { mime: 'image/png', data: b64 };
        }
      } else if (imagesRes.status !== 404 && imagesRes.status !== 405) {
        const errText = await imagesRes.text().catch(() => '');
        throw new ProviderError(
          mapStatusToError(imagesRes.status, providerName, errText),
          imagesRes.status
        );
      }

      const callChatImage = async (modalities: string[]) => {
        return fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers,
          signal: combinedSignal,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            modalities,
          }),
        });
      };

      let chatRes = await callChatImage(['image', 'text']);
      if (!chatRes.ok && (chatRes.status === 400 || chatRes.status === 422)) {
        chatRes = await callChatImage(['image']);
      }

      if (!chatRes.ok) {
        const errText = await chatRes.text().catch(() => '');
        throw new ProviderError(
          mapStatusToError(chatRes.status, providerName, errText),
          chatRes.status
        );
      }

      const chatJson = await chatRes.json();
      const imageUrl = chatJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url as
        | string
        | undefined;

      if (!imageUrl) {
        throw new ProviderError('OpenRouter did not return an image. Try another model.', 502);
      }

      if (imageUrl.startsWith('data:')) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
        if (!match) {
          throw new ProviderError('Unsupported image format returned by OpenRouter.', 502);
        }
        const mime = match[1];
        const b64 = match[2];
        if (b64.length > MAX_IMAGE_BASE64_LEN) {
          throw new ProviderError(
            'The image is too large to return from the server. Try a smaller aspect ratio or another model.',
            413
          );
        }
        return { mime, data: b64 };
      }

      throw new ProviderError('OpenRouter returned an external image URL instead of base64 data.', 502);
    }

    throw new ProviderError(`Unsupported provider "${provider}"`, 400);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new ProviderError(
        'The model took too long to respond. Try again or pick another model.',
        504
      );
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    const status = (err as { status?: number })?.status || 500;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(sanitizeErrorMessage(msg, apiKey), status);
  } finally {
    cleanup();
  }
}
