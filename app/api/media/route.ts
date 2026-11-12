import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isPixabayHost(hostname: string): boolean {
  if (hostname === 'pixabay.com' || hostname === 'cdn.pixabay.com') return true;
  if (hostname.endsWith('.pixabay.com')) return true;
  return false;
}

export async function HEAD(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new NextResponse('Invalid URL', { status: 400 });
    }

    if (!isPixabayHost(parsed.hostname)) {
      return new NextResponse('Forbidden host', { status: 403 });
    }

    const upstreamRes = await fetch(targetUrl, { method: 'HEAD' });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);

    return new NextResponse(null, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error in /api/media HEAD proxy:', error);
    return new NextResponse('Proxy error', { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new NextResponse('Invalid URL', { status: 400 });
    }

    if (!isPixabayHost(parsed.hostname)) {
      return new NextResponse('Forbidden host', { status: 403 });
    }

    // Forward range header for smooth video seeking
    const rangeHeader = req.headers.get('range');
    const headers: HeadersInit = {};
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const upstreamRes = await fetch(targetUrl, {
      headers,
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    const contentType = upstreamRes.headers.get('content-type');
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges');

    if (contentType) responseHeaders.set('Content-Type', contentType);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error in /api/media proxy:', error);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
