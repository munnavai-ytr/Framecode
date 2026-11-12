import { NextRequest, NextResponse } from 'next/server';
import { readKeys } from '@/lib/keyVault';
import { verifyAndListModels } from '@/lib/providers';
import { ModelOption, ProviderId } from '@/types/framecode';

export const runtime = 'nodejs';

const DEFAULT_MODELS: Record<ProviderId, ModelOption[]> = {
  claude: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'claude', vision: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'claude', vision: false },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', vision: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', vision: true },
  ],
  openrouter: [
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'openrouter', vision: true },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'openrouter', vision: true },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'openrouter', vision: false },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'openrouter', vision: false },
  ],
};

export async function GET(req: NextRequest) {
  try {
    const keys = await readKeys();
    const url = new URL(req.url);
    const requestedProvider = url.searchParams.get('provider') as ProviderId | null;

    const providers: ProviderId[] = requestedProvider
      ? [requestedProvider]
      : ['claude', 'openrouter', 'gemini'];

    let allModels: ModelOption[] = [];

    for (const p of providers) {
      const apiKey = keys[p];
      if (apiKey) {
        try {
          const fetched = await verifyAndListModels(p, apiKey);
          if (fetched && fetched.length > 0) {
            allModels = allModels.concat(fetched);
          } else {
            allModels = allModels.concat(DEFAULT_MODELS[p]);
          }
        } catch {
          allModels = allModels.concat(DEFAULT_MODELS[p]);
        }
      } else {
        allModels = allModels.concat(DEFAULT_MODELS[p]);
      }
    }

    return NextResponse.json({
      models: allModels,
      configured: {
        claude: Boolean(keys.claude),
        openrouter: Boolean(keys.openrouter),
        gemini: Boolean(keys.gemini),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
