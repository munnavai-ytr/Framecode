import { NextRequest, NextResponse } from 'next/server';

interface StockResult {
  id: string | number;
  type: 'video' | 'photo';
  previewUrl: string;
  fileUrl: string;
  duration?: number;
  width: number;
  height: number;
}

interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  size: number;
  thumbnail?: string;
}

interface PixabayVideoHit {
  id: number;
  duration: number;
  picture_id?: string;
  videos?: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
}

interface PixabayPhotoHit {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const query = searchParams.get('q') || searchParams.get('query');
    const typeParam = searchParams.get('type'); // 'photo' or 'video'

    const pixabayKey = process.env.PIXABAY_API_KEY;

    // 1. Fetch single stock item by ID (GET /api/stock?id=...)
    if (id) {
      if (!pixabayKey) {
        // Fallback placeholder item
        return NextResponse.json({
          result: {
            id,
            type: 'photo',
            previewUrl: `https://picsum.photos/seed/${id}/720/1280`,
            fileUrl: `https://picsum.photos/seed/${id}/720/1280`,
            width: 720,
            height: 1280,
          },
        });
      }

      // Try fetching as video hit first
      const videoRes = await fetch(
        `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&id=${encodeURIComponent(id)}`,
        { next: { revalidate: 86400 } }
      );

      if (videoRes.ok) {
        const vData = await videoRes.json();
        if (Array.isArray(vData.hits) && vData.hits.length > 0) {
          const hit: PixabayVideoHit = vData.hits[0];
          const mediumFile = hit.videos?.medium || hit.videos?.small || hit.videos?.large;
          if (mediumFile?.url) {
            return NextResponse.json({
              result: {
                id: hit.id,
                type: 'video',
                previewUrl: hit.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg` : mediumFile.url,
                fileUrl: mediumFile.url,
                duration: hit.duration,
                width: mediumFile.width || 1280,
                height: mediumFile.height || 720,
              },
            });
          }
        }
      }

      // Try fetching as photo hit
      const photoRes = await fetch(
        `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&id=${encodeURIComponent(id)}`,
        { next: { revalidate: 86400 } }
      );

      if (photoRes.ok) {
        const pData = await photoRes.json();
        if (Array.isArray(pData.hits) && pData.hits.length > 0) {
          const pHit: PixabayPhotoHit = pData.hits[0];
          return NextResponse.json({
            result: {
              id: pHit.id,
              type: 'photo',
              previewUrl: pHit.webformatURL,
              fileUrl: pHit.largeImageURL || pHit.webformatURL,
              width: pHit.imageWidth || 1280,
              height: pHit.imageHeight || 720,
            },
          });
        }
      }

      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // 2. Search stock items by query (GET /api/stock?q=...)
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    if (!pixabayKey) {
      const fallbackAssets: StockResult[] = [
        {
          id: `fallback-1-${query}`,
          type: 'photo',
          previewUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}1/720/1280`,
          fileUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}1/720/1280`,
          width: 720,
          height: 1280,
        },
        {
          id: `fallback-2-${query}`,
          type: 'photo',
          previewUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}2/720/1280`,
          fileUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}2/720/1280`,
          width: 720,
          height: 1280,
        },
      ];
      return NextResponse.json({ results: fallbackAssets, note: 'PIXABAY_API_KEY not configured, using fallback assets' });
    }

    const results: StockResult[] = [];

    // If photo is requested specifically
    if (typeParam === 'photo') {
      const photoRes = await fetch(
        `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&per_page=5`,
        { next: { revalidate: 86400 } }
      );

      if (photoRes.ok) {
        const pData = await photoRes.json();
        if (Array.isArray(pData.hits)) {
          for (const p of pData.hits as PixabayPhotoHit[]) {
            if (results.length >= 3) break;
            results.push({
              id: p.id,
              type: 'photo',
              previewUrl: p.webformatURL,
              fileUrl: p.largeImageURL || p.webformatURL,
              width: p.imageWidth || 1280,
              height: p.imageHeight || 720,
            });
          }
        }
      }
    } else {
      // Default: fetch video hits from Pixabay
      const videoRes = await fetch(
        `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&per_page=5`,
        { next: { revalidate: 86400 } }
      );

      if (videoRes.ok) {
        const vData = await videoRes.json();
        if (Array.isArray(vData.hits)) {
          for (const hit of vData.hits as PixabayVideoHit[]) {
            if (results.length >= 3) break;
            // Prefer "medium" file URL, fall back to "small" or "large"
            const mediaFile = hit.videos?.medium || hit.videos?.small || hit.videos?.large;
            if (mediaFile?.url) {
              results.push({
                id: hit.id,
                type: 'video',
                previewUrl: hit.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg` : mediaFile.url,
                fileUrl: mediaFile.url,
                duration: hit.duration,
                width: mediaFile.width || 1280,
                height: mediaFile.height || 720,
              });
            }
          }
        }
      }

      // If fewer than 2 videos found, supplement with Pixabay photos
      if (results.length < 2) {
        const photoRes = await fetch(
          `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&per_page=5`,
          { next: { revalidate: 86400 } }
        );

        if (photoRes.ok) {
          const pData = await photoRes.json();
          if (Array.isArray(pData.hits)) {
            for (const p of pData.hits as PixabayPhotoHit[]) {
              if (results.length >= 3) break;
              results.push({
                id: p.id,
                type: 'photo',
                previewUrl: p.webformatURL,
                fileUrl: p.largeImageURL || p.webformatURL,
                width: p.imageWidth || 1280,
                height: p.imageHeight || 720,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ results: results.slice(0, 3) });
  } catch (error) {
    console.error('Error fetching stock from Pixabay:', error);
    return NextResponse.json({ results: [], error: 'Failed to fetch stock assets' });
  }
}
