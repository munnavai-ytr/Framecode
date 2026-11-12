import React from 'react';
import { ProviderId } from '@/types/framecode';

interface ProviderLogoProps {
  provider: ProviderId;
  className?: string;
}

export function ProviderLogo({ provider, className = 'w-4 h-4' }: ProviderLogoProps) {
  if (provider === 'claude') {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: '#D97757' }}
      >
        <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
      </svg>
    );
  }

  if (provider === 'gemini') {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: '#60A5FA' }}
      >
        <path d="M12 3v18M3 12h18M5.637 5.637l12.728 12.728M5.637 18.364L18.365 5.636" />
      </svg>
    );
  }

  // openrouter
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: '#FAF9F5' }}
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <line x1="8.5" y1="7.5" x2="15.5" y2="7.5" />
      <line x1="7.5" y1="8.5" x2="10.5" y2="15.5" />
      <line x1="16.5" y1="8.5" x2="13.5" y2="15.5" />
    </svg>
  );
}
