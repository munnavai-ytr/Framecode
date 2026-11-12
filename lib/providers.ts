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
}

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

function sanitizeErrorMessage(msg: string, apiKey: string, provider: ProviderId): string {
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
        throw new Error(mapStatusToError(res.status, providerName, errText));
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
              vision: true,
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
        throw new Error(mapStatusToError(res.status, providerName, errText));
      }

      const data = await res.json();
      const models: ModelOption[] = [];

      if (Array.isArray(data.data)) {
        for (const m of data.data) {
          models.push({
            id: m.id,
            name: m.display_name || m.id,
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
        throw new Error(mapStatusToError(keyRes.status, providerName, errText));
      }

      // Then fetch models list
      const modelsRes = await fetch('https://openrouter.ai/api/v1/models', {
        signal: timeoutSignal,
      });

      if (!modelsRes.ok) {
        const errText = await modelsRes.text().catch(() => '');
        throw new Error(mapStatusToError(modelsRes.status, providerName, errText));
      }

      const data = await modelsRes.json();
      const models: ModelOption[] = [];

      if (Array.isArray(data.data)) {
        for (const m of data.data) {
          const outputMods = m.architecture?.output_modalities as string[] | undefined;
          const inputMods = m.architecture?.input_modalities as string[] | undefined;
          const params = m.supported_parameters as string[] | undefined;

          if (!outputMods || outputMods.includes('text')) {
            models.push({
              id: m.id,
              name: m.name || m.id,
              vision: inputMods?.includes('image') ?? false,
              jsonMode: params?.includes('response_format') ?? false,
            });
          }
        }
      }

      models.sort((a, b) => a.name.localeCompare(b.name));
      return models;
    }

    throw new Error(`Unsupported provider "${provider}"`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('The model took too long to respond.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(sanitizeErrorMessage(msg, apiKey, provider));
  }
}

// -------------------------------------------------------------
// GENERATE JSON COMMON ADAPTER
// -------------------------------------------------------------
export async function generateJson(options: GenerateJsonOptions): Promise<Record<string, unknown>> {
  const { provider, model, apiKey, system, prompt, images, schema, jsonMode } = options;
  const providerName = formatProviderName(provider);

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
        signal: AbortSignal.timeout(55000),
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
        throw new Error(mapStatusToError(res.status, providerName, errText));
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
          signal: AbortSignal.timeout(55000),
          body: JSON.stringify({
            ...requestBody,
            messages: msgList,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(mapStatusToError(res.status, providerName, errText));
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

    throw new Error(`Unsupported provider "${provider}"`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('The model took too long to respond.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(sanitizeErrorMessage(msg, apiKey, provider));
  }
}
