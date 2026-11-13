import { NextRequest, NextResponse } from 'next/server';
import { readKeys, writeKeys } from '@/lib/keyVault';
import { verifyAndListModels } from '@/lib/providers';
import { ProviderId } from '@/types/framecode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function getLast4(key?: string): string | null {
  const trimmed = key?.trim();
  if (!trimmed) return null;
  return trimmed.slice(-4);
}

export async function GET() {
  try {
    const keys = await readKeys();
    return NextResponse.json(
      {
        configured: {
          claude: Boolean(keys.claude),
          openrouter: Boolean(keys.openrouter),
          gemini: Boolean(keys.gemini),
        },
        last4: {
          claude: getLast4(keys.claude),
          openrouter: getLast4(keys.openrouter),
          gemini: getLast4(keys.gemini),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read keys configuration';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey } = body as { provider: ProviderId; apiKey: string };

    if (!provider || !['claude', 'openrouter', 'gemini'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider specified' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const trimmedKey = apiKey.trim();

    // Verify key with provider models API first
    let models;
    try {
      models = await verifyAndListModels(provider, trimmedKey);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Failed to verify API key with provider';
      return NextResponse.json({ error: errMessage }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Save key into encrypted cookie
    const currentKeys = await readKeys();
    await writeKeys({
      ...currentKeys,
      [provider]: trimmedKey,
    });

    return NextResponse.json(
      { success: true, models, last4: getLast4(trimmedKey) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save API key';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider } = body as { provider: ProviderId };

    if (!provider || !['claude', 'openrouter', 'gemini'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider specified' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const currentKeys = await readKeys();
    delete currentKeys[provider];

    await writeKeys(currentKeys);

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove API key';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
