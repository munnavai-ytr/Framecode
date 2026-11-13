'use client';

import React, { useMemo } from 'react';
import { Claude, Gemini, OpenRouter, ModelIcon, modelMappings } from '@lobehub/icons';
import { ProviderId } from '@/types/framecode';

interface ProviderLogoProps {
  provider: ProviderId;
  size?: number;
  className?: string;
}

export function ProviderLogo({ provider, size = 16, className = '' }: ProviderLogoProps) {
  if (provider === 'claude') {
    return <Claude.Color size={size} className={`shrink-0 ${className}`} />;
  }

  if (provider === 'gemini') {
    return <Gemini.Color size={size} className={`shrink-0 ${className}`} />;
  }

  return <OpenRouter size={size} className={`shrink-0 text-text ${className}`} />;
}

interface ModelLogoProps {
  modelId: string;
  provider?: ProviderId;
  size?: number;
  className?: string;
}

function findMatchedModelInput(modelId: string): string | null {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return null;

  const afterSlash = normalized.includes('/') ? normalized.split('/').slice(1).join('/') : '';
  const vendor = normalized.includes('/') ? normalized.split('/')[0] : '';

  const candidates = [normalized, afterSlash, vendor].filter(Boolean);
  for (const candidate of candidates) {
    for (const item of modelMappings) {
      if (item.keywords.some((kw) => new RegExp(kw, 'i').test(candidate))) {
        return candidate;
      }
    }
  }

  return null;
}

export function ModelLogo({
  modelId,
  provider,
  size = 32,
  className = '',
}: ModelLogoProps) {
  const matchedInput = useMemo(() => findMatchedModelInput(modelId), [modelId]);

  const fallbackLetter = useMemo(() => {
    const clean = modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
    const ch = clean.trim().charAt(0) || provider?.charAt(0) || 'M';
    return ch.toUpperCase();
  }, [modelId, provider]);

  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-text overflow-hidden ${className}`}
    >
      {matchedInput ? (
        <ModelIcon model={matchedInput} size={Math.round(size * 0.62)} type="color" />
      ) : (
        <span className="text-xs font-semibold text-text select-none">{fallbackLetter}</span>
      )}
    </div>
  );
}
