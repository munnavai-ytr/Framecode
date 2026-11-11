import { ChatSession, VideoProject } from '@/types/framecode';

const SAMPLE_CODE_1 = `import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence } from 'remotion';

export const Composition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 14 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const subY = spring({ frame: frame - 15, fps, from: 30, to: 0, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F1E1D', color: '#FAF9F5', fontFamily: 'system-ui, sans-serif' }}>
      <Sequence from={0} durationInFrames={240}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#A8A59E', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 16 }}>Ceramic Precision</div>
          <h1 style={{ fontSize: 52, fontWeight: 800, transform: \`scale(\${titleScale})\`, opacity, margin: 0, letterSpacing: -1, lineHeight: 1.1 }}>KRONOS</h1>
          <div style={{ transform: \`translateY(\${subY}px)\`, marginTop: 24, padding: '8px 16px', borderRadius: 8, backgroundColor: '#2A2927', border: '1px solid #3A3835', fontSize: 14, color: '#D97757', fontWeight: 600 }}>TITANIUM BURR 48MM</div>
        </div>
      </Sequence>
      <Sequence from={240} durationInFrames={360}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 38, fontWeight: 700, margin: '0 0 16px 0', color: '#FAF9F5' }}>Micron Calibration</div>
          <p style={{ fontSize: 18, color: '#A8A59E', margin: 0, lineHeight: 1.4 }}>Zero retention. Stepless click dial for precision espresso extraction.</p>
          <div style={{ marginTop: 40, width: 80, height: 3, backgroundColor: '#D97757', borderRadius: 2 }} />
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const SAMPLE_CODE_2 = `import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence } from 'remotion';

export const Composition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideY = spring({ frame, fps, from: 40, to: 0 });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F1E1D', color: '#FAF9F5', fontFamily: 'system-ui, sans-serif' }}>
      <Sequence from={0} durationInFrames={300}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '0 48px' }}>
          <div style={{ fontSize: 14, color: '#D97757', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Zero Downtime</div>
          <h1 style={{ fontSize: 42, fontWeight: 700, margin: '0 0 24px 0', opacity, transform: \`translateY(\${slideY}px)\` }}>Instant Schema Diff</h1>
          <div style={{ fontFamily: 'monospace', backgroundColor: '#2A2927', border: '1px solid #3A3835', padding: 20, borderRadius: 12, fontSize: 15, lineHeight: 1.6 }}>
            <div style={{ color: '#A8A59E' }}>-- Safe forward migration</div>
            <div style={{ color: '#4ADE80' }}>+ ALTER TABLE users ADD tier text;</div>
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const SAMPLE_CODE_3 = `import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence } from 'remotion';

export const Composition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rot = interpolate(frame, [0, 300], [0, 10]);
  const s = spring({ frame, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F1E1D', color: '#FAF9F5', fontFamily: 'serif' }}>
      <Sequence from={0} durationInFrames={450}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 40px', textAlign: 'center' }}>
          <span style={{ fontSize: 18, color: '#A8A59E', letterSpacing: 6, textTransform: 'uppercase', marginBottom: 20, fontFamily: 'system-ui' }}>Volume IV</span>
          <h1 style={{ fontSize: 56, fontWeight: 400, transform: \`scale(\${s}) rotate(\${rot}deg)\`, margin: 0, fontStyle: 'italic' }}>Form & Motion</h1>
          <div style={{ width: 60, height: 1, backgroundColor: '#3A3835', margin: '30px auto' }} />
          <p style={{ fontSize: 16, color: '#A8A59E', fontFamily: 'system-ui', margin: 0 }}>Every frame generated from pure TypeScript.</p>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const SAMPLE_CODE_4 = `import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence } from 'remotion';

export const Composition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeScale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F1E1D', color: '#FAF9F5', fontFamily: 'system-ui, sans-serif' }}>
      <Sequence from={0} durationInFrames={360}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 40px', textAlign: 'center' }}>
          <div style={{ transform: \`scale(\${badgeScale})\`, padding: '6px 14px', borderRadius: 999, backgroundColor: '#2A2927', border: '1px solid #3A3835', color: '#D97757', fontSize: 13, fontWeight: 700, marginBottom: 20 }}>RELEASE 2.4</div>
          <h1 style={{ fontSize: 44, fontWeight: 800, margin: '0 0 20px 0' }}>Supercharged Performance</h1>
          <p style={{ fontSize: 16, color: '#A8A59E', margin: 0 }}>10x faster frame rendering directly in your browser tab.</p>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const SAMPLE_CODE_5 = `import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence } from 'remotion';

export const Composition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ring = interpolate(frame, [0, 90], [0, 100], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F1E1D', color: '#FAF9F5', fontFamily: 'system-ui, sans-serif' }}>
      <Sequence from={0} durationInFrames={450}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 40px', textAlign: 'center' }}>
          <div style={{ width: 140, height: 140, borderRadius: '50%', border: '8px solid #2A2927', borderTopColor: '#D97757', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30, transform: 'rotate(-45deg)' }}>
            <span style={{ transform: 'rotate(45deg)', fontSize: 28, fontWeight: 800, color: '#FAF9F5' }}>{Math.round(ring)}%</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 700, margin: '0 0 12px 0' }}>Daily Streak</h1>
          <p style={{ fontSize: 16, color: '#A8A59E', margin: 0 }}>Consistency engineered into every habit.</p>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

const createDummyVideo = (
  id: string,
  title: string,
  code: string,
  durationSec: number = 20,
  currentSec: number = 6
): VideoProject => {
  return {
    id,
    title,
    aspectRatio: '9:16',
    durationSec,
    currentSec,
    fps: 30,
    resolution: '720x1280',
    code,
    videoConfig: {
      width: 720,
      height: 1280,
      fps: 30,
      durationInFrames: durationSec * 30,
    },
    scenes: [
      { id: `${id}-1`, title: '01. Kinetic Reveal', duration: '0:06', visualStyle: 'Minimal dark matte', codeSummary: 'Spring physics + typography' },
      { id: `${id}-2`, title: '02. Feature Focus', duration: '0:08', visualStyle: 'Precision layout', codeSummary: 'Interpolated motion' },
      { id: `${id}-3`, title: '03. Outro Lockup', duration: '0:06', visualStyle: 'Clean CTA', codeSummary: 'Sequence timing' },
    ],
    primaryCodeSnippet: code,
  };
};

export const INITIAL_PAST_CHATS: ChatSession[] = [
  {
    id: 'chat-1',
    title: '3D Product Launch Reel',
    timestamp: '2 hours ago',
    latestCode: SAMPLE_CODE_1,
    messages: [
      {
        id: 'msg-1-1',
        role: 'user',
        content: 'Create a 9:16 vertical reel for a minimal ceramic coffee grinder launch. Fast cuts, macro typography, and sleek kinetic motion.',
        timestamp: '10:24 AM',
      },
      {
        id: 'msg-1-2',
        role: 'assistant',
        content: "I've structured a 2-scene kinetic composition using Remotion with Spring physics and clean macro typography. Here is the rendering breakdown:",
        timestamp: '10:25 AM',
        tasks: [
          {
            id: 't-1-1',
            label: 'Wrote storyboard - 2 scenes',
            status: 'done',
            detailTitle: 'storyboard.json',
            codeSnippet: `{\n  "ratio": "9:16",\n  "fps": 30,\n  "durationInFrames": 600,\n  "scenes": [\n    { "id": "intro", "frames": 240, "action": "macro_pan" },\n    { "id": "precision", "frames": 360, "action": "callout_reveal" }\n  ]\n}`,
          },
          {
            id: 't-1-2',
            label: 'Wrote Composition.tsx',
            status: 'done',
            detailTitle: 'Composition.tsx',
            codeSnippet: SAMPLE_CODE_1,
          },
          {
            id: 't-1-3',
            label: 'Rendered composition preview',
            status: 'done',
            progress: 100,
            detailTitle: 'web-renderer.log',
            codeSnippet: `[remotion] Compiled composition in browser sandbox.\n[remotion] Ready for live playback or MP4 export.`,
          },
        ],
        video: createDummyVideo('vid-1', 'Kronos Ceramic Grinder Reel', SAMPLE_CODE_1, 20, 6),
      },
    ],
    terminalLines: [
      { id: 'l1', text: '$ remotion compile Composition.tsx (720x1280 @ 30fps)', type: 'command', timestamp: '10:24:41' },
      { id: 'l2', text: '[remotion] Sandboxed code evaluation: OK', type: 'log', timestamp: '10:24:42' },
      { id: 'l3', text: '✓ Composition loaded in browser preview', type: 'success', timestamp: '10:24:43' },
    ],
    video: createDummyVideo('vid-1', 'Kronos Ceramic Grinder Reel', SAMPLE_CODE_1, 20, 6),
  },
  {
    id: 'chat-2',
    title: 'SaaS Feature Explainer',
    timestamp: 'Yesterday',
    latestCode: SAMPLE_CODE_2,
    messages: [
      {
        id: 'msg-2-1',
        role: 'user',
        content: 'Generate a 10s teaser explaining real-time collaborative database migrations with visual SQL diffs.',
        timestamp: '3:15 PM',
      },
      {
        id: 'msg-2-2',
        role: 'assistant',
        content: 'Created a UI-driven demo using animated syntax-highlighted code blocks and live diff transitions:',
        timestamp: '3:16 PM',
        tasks: [
          {
            id: 't-2-1',
            label: 'Wrote storyboard - 1 scene',
            status: 'done',
            detailTitle: 'storyboard.json',
            codeSnippet: `{\n  "concept": "SQL Schema Instant Diff",\n  "ratio": "9:16",\n  "durationInFrames": 300\n}`,
          },
          {
            id: 't-2-2',
            label: 'Wrote Composition.tsx',
            status: 'done',
            detailTitle: 'Composition.tsx',
            codeSnippet: SAMPLE_CODE_2,
          },
        ],
        video: createDummyVideo('vid-2', 'SaaS Schema Diff Explainer', SAMPLE_CODE_2, 10, 4),
      },
    ],
    terminalLines: [
      { id: 'l2-1', text: '$ remotion compile SchemaDiff.tsx', type: 'command', timestamp: '15:15:32' },
      { id: 'l2-2', text: '✓ Composition mounted in @remotion/player', type: 'success', timestamp: '15:15:33' },
    ],
    video: createDummyVideo('vid-2', 'SaaS Schema Diff Explainer', SAMPLE_CODE_2, 10, 4),
  },
  {
    id: 'chat-3',
    title: 'Typography Kinetic Intro',
    timestamp: '3 days ago',
    latestCode: SAMPLE_CODE_3,
    messages: [
      {
        id: 'msg-3-1',
        role: 'user',
        content: 'Create a pure typography reel with high-impact serif fonts, staggered words, and black/white editorial pacing.',
        timestamp: '11:02 AM',
      },
      {
        id: 'msg-3-2',
        role: 'assistant',
        content: 'Wrote an editorial typography sequence with smooth scale and rotation spring physics:',
        timestamp: '11:03 AM',
        tasks: [
          {
            id: 't-3-1',
            label: 'Wrote Composition.tsx',
            status: 'done',
            detailTitle: 'Composition.tsx',
            codeSnippet: SAMPLE_CODE_3,
          },
        ],
        video: createDummyVideo('vid-3', 'Kinetic Editorial Typography', SAMPLE_CODE_3, 15, 5),
      },
    ],
    terminalLines: [
      { id: 'l3-1', text: '$ remotion compile KineticIntro.tsx', type: 'command', timestamp: '11:02:45' },
      { id: 'l3-2', text: '✓ Ready in player', type: 'success', timestamp: '11:02:46' },
    ],
    video: createDummyVideo('vid-3', 'Kinetic Editorial Typography', SAMPLE_CODE_3, 15, 5),
  },
  {
    id: 'chat-4',
    title: 'Changelog Video Teaser',
    timestamp: 'May 12',
    latestCode: SAMPLE_CODE_4,
    messages: [
      {
        id: 'msg-4-1',
        role: 'user',
        content: 'Make a 12s release announcement reel showcasing version 2.4 performance upgrades.',
        timestamp: '2:40 PM',
      },
      {
        id: 'msg-4-2',
        role: 'assistant',
        content: 'Engineered a rapid release card highlight with smooth scale transitions:',
        timestamp: '2:41 PM',
        tasks: [
          {
            id: 't-4-1',
            label: 'Wrote Composition.tsx',
            status: 'done',
            detailTitle: 'Composition.tsx',
            codeSnippet: SAMPLE_CODE_4,
          },
        ],
        video: createDummyVideo('vid-4', 'Version 2.4 Feature Teaser', SAMPLE_CODE_4, 12, 5),
      },
    ],
    terminalLines: [
      { id: 'l4-1', text: '$ remotion compile ReleaseTeaser.tsx', type: 'command', timestamp: '14:40:12' },
      { id: 'l4-2', text: '✓ Verified preview', type: 'success', timestamp: '14:40:13' },
    ],
    video: createDummyVideo('vid-4', 'Version 2.4 Feature Teaser', SAMPLE_CODE_4, 12, 5),
  },
  {
    id: 'chat-5',
    title: 'Mobile App Walkthrough',
    timestamp: 'May 8',
    latestCode: SAMPLE_CODE_5,
    messages: [
      {
        id: 'msg-5-1',
        role: 'user',
        content: 'Create a 15s showcase for a habit tracker app with a animated progress ring and streak counter.',
        timestamp: '9:12 AM',
      },
      {
        id: 'msg-5-2',
        role: 'assistant',
        content: 'Created a circular progress indicator sequence with animated percentage counter:',
        timestamp: '9:13 AM',
        tasks: [
          {
            id: 't-5-1',
            label: 'Wrote Composition.tsx',
            status: 'done',
            detailTitle: 'Composition.tsx',
            codeSnippet: SAMPLE_CODE_5,
          },
        ],
        video: createDummyVideo('vid-5', 'Habit Tracker App Showcase', SAMPLE_CODE_5, 15, 6),
      },
    ],
    terminalLines: [
      { id: 'l5-1', text: '$ remotion compile HabitStreak.tsx', type: 'command', timestamp: '09:12:30' },
      { id: 'l5-2', text: '✓ Ready in player', type: 'success', timestamp: '09:12:31' },
    ],
    video: createDummyVideo('vid-5', 'Habit Tracker App Showcase', SAMPLE_CODE_5, 15, 6),
  },
];

export const QUICK_PROMPTS = [
  '9:16 Kinetic typography launch reel',
  'SaaS code diff & architecture explainer',
  'Minimalist hardware product release teaser',
  'Fast-paced changelog feature announcement',
];
