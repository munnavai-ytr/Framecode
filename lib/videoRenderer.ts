import {
  canRenderMediaOnWeb,
  renderMediaOnWeb,
  renderStillOnWeb,
} from '@remotion/web-renderer';
import React from 'react';

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export interface WebRendererSupport {
  supported: boolean;
  message?: string;
}

export async function checkWebRendererSupport(width = 720, height = 1280): Promise<WebRendererSupport> {
  if (typeof window === 'undefined') {
    return { supported: false, message: 'Server-side rendering is not supported.' };
  }

  // Check WebCodecs availability
  const hasWebCodecs =
    typeof (window as unknown as { VideoEncoder: unknown }).VideoEncoder !== 'undefined';

  if (!hasWebCodecs) {
    return {
      supported: false,
      message: 'Please use the latest Chrome.',
    };
  }

  try {
    const check = await canRenderMediaOnWeb({
      container: 'mp4',
      width,
      height,
    });

    if (!check.canRender) {
      const errorIssue = check.issues.find((i) => i.severity === 'error');
      return {
        supported: false,
        message: errorIssue ? errorIssue.message : 'Please use the latest Chrome.',
      };
    }

    return { supported: true };
  } catch {
    return {
      supported: false,
      message: 'Please use the latest Chrome.',
    };
  }
}

/**
 * Converts a Blob into a base64 string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Captures 3 still frames (beginning, middle, end) for visual AI review.
 */
export async function captureStillsForReview(
  component: React.ComponentType,
  config: VideoConfig
): Promise<string[]> {
  const { width, height, fps, durationInFrames } = config;

  const sampleFrames = [
    Math.min(15, Math.floor(durationInFrames * 0.1)),
    Math.floor(durationInFrames * 0.5),
    Math.max(0, durationInFrames - 20),
  ];

  const base64Images: string[] = [];

  for (const frame of sampleFrames) {
    try {
      const still = await renderStillOnWeb({
        composition: {
          component,
          id: 'Composition',
          width,
          height,
          durationInFrames,
          fps,
        },
        frame,
      });

      const blob = await still.blob({ format: 'jpeg', quality: 0.7 });
      const b64 = await blobToBase64(blob);
      base64Images.push(b64);
    } catch (err) {
      console.warn(`Failed to capture frame ${frame} for review:`, err);
    }
  }

  return base64Images;
}

/**
 * Renders full MP4 video in the browser using WebCodecs.
 */
export async function renderVideoToMp4(
  component: React.ComponentType,
  config: VideoConfig,
  onProgress: (percent: number) => void
): Promise<{ blob: Blob; url: string }> {
  const { width, height, fps, durationInFrames } = config;

  const result = await renderMediaOnWeb({
    composition: {
      component,
      id: 'Composition',
      width,
      height,
      durationInFrames,
      fps,
    },
    container: 'mp4',
    onProgress: (p) => {
      if (typeof p.progress === 'number') {
        onProgress(Math.round(p.progress * 100));
      } else if (p.renderedFrames && durationInFrames > 0) {
        onProgress(Math.round((p.renderedFrames / durationInFrames) * 100));
      }
    },
  });

  const blob = await result.getBlob();
  const url = URL.createObjectURL(blob);
  return { blob, url };
}
