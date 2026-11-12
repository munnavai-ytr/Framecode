import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

function getPreviewUrl(hit: PixabayVideoHit, fallbackFileUrl: string): string {
  const v = hit.videos;
  if (v?.medium?.thumbnail) return v.medium.thumbnail;
  if (v?.small?.thumbnail) return v.small.thumbnail;
  if (v?.tiny?.thumbnail) return v.tiny.thumbnail;
  if (v?.large?.thumbnail) return v.large.thumbnail;
  return fallbackFileUrl;
}

export async function GET(req: NextRequest) {
  try {
    const pixabayKey = process.env.PIXABAY_API_KEY;

    if (!pixabayKey) {
      return NextResponse.json(
        { error: 'Stock video search requires PIXABAY_API_KEY set on server' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const kind = searchParams.get('kind'); // 'video' or 'image'
    const query = searchParams.get('q') || searchParams.get('query');
    const typeParam = searchParams.get('type'); // 'photo' or 'video'

    // 1. Fetch single stock item by ID (GET /api/stock?id=... or ?kind=video|image&id=...)
    if (id) {
      if (kind === 'image') {
        const photoRes = await fetch(
          `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&id=${encodeURIComponent(id)}`,
          { next: { revalidate: 86400 } }
        );

        if (photoRes.ok) {
          const pData = await photoRes.json();
          if (Array.isArray(pData.hits) && pData.hits.length > 0) {
            const pHit: PixabayPhotoHit = pData.hits[0];
            const fileUrl = pHit.largeImageURL || pHit.webformatURL;
            const resData = {
              id: pHit.id,
              type: 'photo',
              previewUrl: pHit.webformatURL,
              fileUrl,
              width: pHit.imageWidth || 1280,
              height: pHit.imageHeight || 720,
            };
            return NextResponse.json({
              fileUrl,
              width: resData.width,
              height: resData.height,
              result: resData,
            });
          }
        }
        return NextResponse.json({ error: 'Image asset not found' }, { status: 404 });
      }

      if (kind === 'video') {
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
              const resData = {
                id: hit.id,
                type: 'video',
                previewUrl: getPreviewUrl(hit, mediumFile.url),
                fileUrl: mediumFile.url,
                duration: hit.duration,
                width: mediumFile.width || 1280,
                height: mediumFile.height || 720,
              };
              return NextResponse.json({
                fileUrl: mediumFile.url,
                width: resData.width,
                height: resData.height,
                duration: hit.duration,
                result: resData,
              });
            }
          }
        }
        return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
      }

      // Default try video first then photo if kind is not specified
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
            const resData = {
              id: hit.id,
              type: 'video',
              previewUrl: getPreviewUrl(hit, mediumFile.url),
              fileUrl: mediumFile.url,
              duration: hit.duration,
              width: mediumFile.width || 1280,
              height: mediumFile.height || 720,
            };
            return NextResponse.json({
              fileUrl: mediumFile.url,
              width: resData.width,
              height: resData.height,
              duration: hit.duration,
              result: resData,
            });
          }
        }
      }

      const photoRes = await fetch(
        `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&id=${encodeURIComponent(id)}`,
        { next: { revalidate: 86400 } }
      );

      if (photoRes.ok) {
        const pData = await photoRes.json();
        if (Array.isArray(pData.hits) && pData.hits.length > 0) {
          const pHit: PixabayPhotoHit = pData.hits[0];
          const fileUrl = pHit.largeImageURL || pHit.webformatURL;
          const resData = {
            id: pHit.id,
            type: 'photo',
            previewUrl: pHit.webformatURL,
            fileUrl,
            width: pHit.imageWidth || 1280,
            height: pHit.imageHeight || 720,
          };
          return NextResponse.json({
            fileUrl,
            width: resData.width,
            height: resData.height,
            result: resData,
          });
        }
      }

      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // 2. Search stock items by query (GET /api/stock?q=...)
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const results: StockResult[] = [];

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
      const videoRes = await fetch(
        `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&per_page=5`,
        { next: { revalidate: 86400 } }
      );

      if (videoRes.ok) {
        const vData = await videoRes.json();
        if (Array.isArray(vData.hits)) {
          for (const hit of vData.hits as PixabayVideoHit[]) {
            if (results.length >= 3) break;
            const mediaFile = hit.videos?.medium || hit.videos?.small || hit.videos?.large;
            if (mediaFile?.url) {
              results.push({
                id: hit.id,
                type: 'video',
                previewUrl: getPreviewUrl(hit, mediaFile.url),
                fileUrl: mediaFile.url,
                duration: hit.duration,
                width: mediaFile.width || 1280,
                height: mediaFile.height || 720,
              });
            }
          }
        }
      }

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
