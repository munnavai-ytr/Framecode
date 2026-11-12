import React from 'react';
import * as Remotion from 'remotion';
import * as RemotionMedia from '@remotion/media';
import { transform } from 'sucrase';
import { scanCode } from './codeGuard';

export interface CompilationResult {
  component: React.ComponentType | null;
  error: string | null;
}

/**
 * Strips markdown code blocks like ```tsx ... ``` if present.
 */
export function cleanCodeString(code: string): string {
  let cleaned = code.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, cleaned.lastIndexOf('```')).trim();
  }
  return cleaned;
}

const SHADOWED_GLOBALS = [
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'navigator',
  'location',
  'eval',
  'Function',
];

/**
 * Compiles and evaluates Remotion TSX code in the browser sandbox.
 */
export function compileRemotionCode(rawCode: string): CompilationResult {
  try {
    const cleaned = cleanCodeString(rawCode);

    // Transform TypeScript & JSX to standard JavaScript CommonJS format
    const transformed = transform(cleaned, {
      transforms: ['jsx', 'typescript', 'imports'],
      jsxRuntime: 'classic',
      production: true,
    });

    // Run security scan
    const guardError = scanCode(transformed.code);
    if (guardError) {
      return {
        component: null,
        error: guardError,
      };
    }

    const customRequire = (name: string) => {
      if (name === 'react' || name === 'react/jsx-runtime') {
        return React;
      }
      if (name === 'remotion') {
        return Remotion;
      }
      if (name === '@remotion/media') {
        return RemotionMedia;
      }
      throw new Error(`Module "${name}" is not available in browser sandbox.`);
    };

    const exportsObj: {
      Composition?: React.ComponentType;
      default?: React.ComponentType;
      App?: React.ComponentType;
      [key: string]: unknown;
    } = {};

    const moduleObj = { exports: exportsObj };

    const fnArgs = [
      'require',
      'exports',
      'module',
      'React',
      'Remotion',
      'RemotionMedia',
      'useCurrentFrame',
      'useVideoConfig',
      'spring',
      'interpolate',
      'Sequence',
      'AbsoluteFill',
      'Img',
      ...SHADOWED_GLOBALS,
      `'use strict';\n${transformed.code}`,
    ];

    // Execute in sandboxed Function scope with React and Remotion primitives
    const runFunction = new Function(...fnArgs);

    const shadowValues = SHADOWED_GLOBALS.map(() => undefined);

    runFunction(
      customRequire,
      exportsObj,
      moduleObj,
      React,
      Remotion,
      RemotionMedia,
      Remotion.useCurrentFrame,
      Remotion.useVideoConfig,
      Remotion.spring,
      Remotion.interpolate,
      Remotion.Sequence,
      Remotion.AbsoluteFill,
      Remotion.Img,
      ...shadowValues
    );

    // Look for exported component
    const Component =
      moduleObj.exports.Composition ||
      moduleObj.exports.default ||
      moduleObj.exports.App ||
      exportsObj.Composition ||
      exportsObj.default ||
      exportsObj.App;

    if (!Component || (typeof Component !== 'function' && typeof Component !== 'object')) {
      return {
        component: null,
        error: 'The code did not export a valid React component named Composition or default.',
      };
    }

    return {
      component: Component as React.ComponentType,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      component: null,
      error: errorMsg,
    };
  }
}
