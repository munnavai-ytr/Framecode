import { getBlob } from '@/lib/db';
import { prepareStockUrls } from '@/lib/stockUrls';

const stockCacheMap = new Map<string, string>();
const blobUrlCacheMap = new Map<string, string>();

if (typeof window !== 'undefined') {
  const cleanup = () => {
    blobUrlCacheMap.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    blobUrlCacheMap.clear();
  };

  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
}

export async function resolveAssetTokens(code: string): Promise<string> {
  if (!code) return code;

  let resolvedCode = code;

  // 1. Resolve stock tokens: stock://video/<id> or stock://image/<id>
  const stockRegex = /stock:\/\/(video|image)\/(\d+)/g;
  const stockMatches = Array.from(code.matchAll(stockRegex));

  for (const match of stockMatches) {
    const fullToken = match[0];
    const kind = match[1];
    const id = match[2];

    if (!stockCacheMap.has(fullToken)) {
      try {
        const res = await fetch(`/api/stock?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.result?.fileUrl) {
            stockCacheMap.set(fullToken, data.result.fileUrl);
          } else {
            throw new Error(`Asset ${fullToken} is not available`);
          }
        } else {
          throw new Error(`Asset ${fullToken} is not available`);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith('Asset ')) {
          throw err;
        }
        throw new Error(`Asset ${fullToken} is not available`);
      }
    }

    const realUrl = stockCacheMap.get(fullToken);
    if (!realUrl) {
      throw new Error(`Asset ${fullToken} is not available`);
    }

    resolvedCode = resolvedCode.replaceAll(fullToken, realUrl);
  }

  // 2. Resolve asset tokens: asset://<id>
  const assetRegex = /asset:\/\/([A-Za-z0-9-]+)/g;
  const assetMatches = Array.from(code.matchAll(assetRegex));

  for (const match of assetMatches) {
    const fullToken = match[0];
    const assetId = match[1];

    if (!blobUrlCacheMap.has(assetId)) {
      try {
        const blob = await getBlob(assetId);
        if (!blob) {
          throw new Error(`Asset ${fullToken} is not available`);
        }
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCacheMap.set(assetId, blobUrl);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith('Asset ')) {
          throw err;
        }
        throw new Error(`Asset ${fullToken} is not available`);
      }
    }

    const blobUrl = blobUrlCacheMap.get(assetId);
    if (!blobUrl) {
      throw new Error(`Asset ${fullToken} is not available`);
    }

    resolvedCode = resolvedCode.replaceAll(fullToken, blobUrl);
  }

  return resolvedCode;
}

/**
 * Universal code preparation pipeline:
 * 1. Resolves asset and stock tokens to real URLs / blob URLs.
 * 2. Runs prepareStockUrls (CORS/HEAD proxy helper for Pixabay).
 */
export async function prepareCode(code: string): Promise<string> {
  if (!code) return code;
  const tokenResolved = await resolveAssetTokens(code);
  const stockPrepared = await prepareStockUrls(tokenResolved);
  return stockPrepared;
}
