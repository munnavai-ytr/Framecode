/**
 * Scans code for Pixabay media URLs and verifies accessibility.
 * Replaces direct Pixabay URLs with /api/media proxy URLs if direct CORS/HEAD checks fail.
 */
export async function prepareStockUrls(code: string): Promise<string> {
  if (!code) return code;

  // Regex to match URLs from pixabay.com or cdn.pixabay.com
  const urlRegex = /https?:\/\/(?:cdn\.)?pixabay\.com\/[^\s"'`<>]+/g;
  const matches = Array.from(new Set(code.match(urlRegex) || []));

  if (matches.length === 0) return code;

  let processedCode = code;

  for (const url of matches) {
    let worksDirectly = false;
    try {
      // Test direct HEAD request with 3s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        worksDirectly = true;
      }
    } catch {
      worksDirectly = false;
    }

    if (!worksDirectly) {
      const proxyUrl = `/api/media?url=${encodeURIComponent(url)}`;
      processedCode = processedCode.replaceAll(url, proxyUrl);
    }
  }

  return processedCode;
}
