import { NextRequest, NextResponse } from 'next/server';
import { getKey } from '@/lib/keyVault';
import { verifyAndListModels } from '@/lib/providers';
import { ProviderId } from '@/types/framecode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const providerParam = url.searchParams.get('provider');

    if (!providerParam || !['claude', 'openrouter', 'gemini'].includes(providerParam)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const provider = providerParam as ProviderId;
    const apiKey = await getKey(provider);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'NO_API_KEY' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    try {
      const rawModels = await verifyAndListModels(provider, apiKey);
      const models = rawModels.map((m) => ({ ...m, provider }));
      return NextResponse.json(
        { models },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    } catch (err: unknown) {
      const rawStatus = (err as { status?: number })?.status;
      let status = 502;
      if (rawStatus === 401 || rawStatus === 403) {
        status = 401;
      } else if (rawStatus === 429) {
        status = 429;
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      return NextResponse.json(
        { error: message },
        { status, headers: NO_STORE_HEADERS }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    return NextResponse.json(
      { error: message },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
