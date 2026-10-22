import React, { useState, useMemo } from 'react';
import { Copy, CheckCheck, File } from 'lucide-react';
import { marked } from 'marked';

// --- Haptic Feedback Helper ---
export const triggerHaptic = (pattern: number | number[] = 25) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
};

// --- Copy Button ---
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    triggerHaptic(20);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        color: copied ? '#4ade80' : '#858585',
        padding: '2px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        cursor: 'pointer',
      }}
    >
      {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// --- High-Fidelity Markdown Formatter ---
export const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(content, { gfm: true, breaks: true }) as string;
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className="prose-antigravity"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

// --- KYBER Brand Mark (Variation A.3: The Kinetic Shift) ---
export function KyberLogo({
  size = 48,
  className,
  colorLeft = '#ffffff',
  colorRight = '#a1a1aa',
}: {
  size?: number;
  className?: string;
  colorLeft?: string;
  colorRight?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Left Staggered Facet (Pure White) */}
      <polygon points="48.5,18 22,58 48.5,98" fill={colorLeft} />
      {/* Right Elevated Facet (Platinum Titanium) */}
      <polygon points="51.5,2 78,42 51.5,82" fill={colorRight} />
    </svg>
  );
}

// Backwards-compatibility alias
export const AntigravityLogo = KyberLogo;

// --- File Badge Helper (No Emojis) ---
export function FileTypeBadge({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#3178c6', background: 'rgba(49, 120, 198, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        TS
      </span>
    );
  }
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#f7df1e', background: 'rgba(247, 223, 30, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        JS
      </span>
    );
  }
  if (ext === 'json') {
    return (
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#cca700', fontFamily: 'monospace' }}>
        &#123;&#125;
      </span>
    );
  }
  if (ext === 'md') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        M&#8595;
      </span>
    );
  }
  if (ext === 'css' || ext === 'scss' || ext === 'less') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#42a5f5', background: 'rgba(66, 165, 245, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        #
      </span>
    );
  }
  if (ext === 'html') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#e44d26', background: 'rgba(228, 77, 38, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        &lt;&gt;
      </span>
    );
  }
  if (ext === 'sh' || ext === 'bash' || ext === 'ps1' || ext === 'bat') {
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#4ade80', background: 'rgba(74, 222, 128, 0.15)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
        $_
      </span>
    );
  }
  return <File size={13} color="#858585" />;
}
