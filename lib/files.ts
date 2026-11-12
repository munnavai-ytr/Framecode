import { LibraryCategory } from '@/types/framecode';

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

export function isFileTooLarge(file: File | Blob): boolean {
  return file.size > MAX_FILE_SIZE_BYTES;
}

export function getFileTooLargeMessage(fileName: string): string {
  return `${fileName} is larger than 200 MB.`;
}

export function categorize(name: string, mime: string): LibraryCategory {
  const lowerMime = (mime || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  if (lowerMime.startsWith('video/')) return 'video';
  if (lowerMime.startsWith('image/')) return 'image';

  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }

  const docExtensions = [
    '.doc',
    '.docx',
    '.odt',
    '.rtf',
    '.txt',
    '.md',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.csv',
  ];
  if (docExtensions.some((ext) => lowerName.endsWith(ext))) {
    return 'document';
  }

  return 'file';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const num = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1);
  return `${num} ${sizes[i]}`;
}

export async function readMediaInfo(
  file: File | Blob
): Promise<{ width?: number; height?: number; duration?: number }> {
  const type = file.type || '';
  if (type.startsWith('image/')) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve({ width, height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      img.src = url;
    });
  }

  if (type.startsWith('video/')) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = Math.round(video.duration || 0);
        URL.revokeObjectURL(url);
        resolve({ width, height, duration });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      video.src = url;
    });
  }

  return {};
}

export async function makeThumb(
  blob: Blob,
  kind?: 'image' | 'video'
): Promise<Blob | null> {
  const actualKind = kind || (blob.type.startsWith('video/') ? 'video' : 'image');
  if (actualKind === 'image') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 320;
          let width = img.naturalWidth || 320;
          let height = img.naturalHeight || 320;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (b) => {
              URL.revokeObjectURL(url);
              resolve(b);
            },
            'image/jpeg',
            0.85
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  if (kind === 'video') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        const seekTime = Math.min(1, (video.duration || 0) / 2);
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const maxDim = 320;
          let width = video.videoWidth || 320;
          let height = video.videoHeight || 320;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (b) => {
              URL.revokeObjectURL(url);
              resolve(b);
            },
            'image/jpeg',
            0.85
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      video.src = url;
    });
  }

  return null;
}

export async function downscaleImageForVision(file: File | Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 768;
        let width = img.naturalWidth || 768;
        let height = img.naturalHeight || 768;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
