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
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '4px',
        color: copied ? '#4ade80' : '#858585',
        padding: '3px 7px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        fontFamily: "'Geist Mono', Consolas, monospace",
        cursor: 'pointer',
      }}
    >
      {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// Configure marked extension to escape raw HTML and secure markdown links
marked.use({
  walkTokens(token: any) {
    if (token.type === 'html') {
      token.text = token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    } else if (token.type === 'link') {
      if (token.href && /^\s*javascript:/i.test(token.href)) {
        token.href = '#';
      }
    }
  },
  renderer: {
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const safeHref = href && !/^\s*javascript:/i.test(href) ? href : '#';
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    },
  },
});

function sanitizeMarkdownHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');
}

// --- High-Fidelity Markdown Formatter ---
export const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      const parsed = marked.parse(content, { gfm: true, breaks: true }) as string;
      return sanitizeMarkdownHtml(parsed);
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

// --- KYBER Brand Mark (Stealth Blade K Monogram: | >>) ---
export function KyberLogo({
  size = 48,
  className,
  colorSpine = '#ffffff',
  colorBlade = '#ffffff',
}: {
  size?: number;
  className?: string;
  colorSpine?: string;
  colorBlade?: string;
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
      {/* Monolithic Vertical Spine */}
      <rect x="18" y="16" width="13" height="68" rx="2.5" fill={colorSpine} />
      {/* Primary Internal Chevron Blade */}
      <path d="M52 16 L31 50 L52 84 H39 L22 50 L39 16 H52 Z" fill={colorSpine} />
      {/* Forward Auxiliary Blade (Antigravity Blue / Electric Ice) */}
      <path d="M82 16 L61 50 L82 84 H69 L52 50 L69 16 H82 Z" fill={colorBlade} />
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
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#ffffff', background: 'rgba(255, 255, 255, 0.12)', padding: '1px 3px', borderRadius: '3px', fontFamily: 'monospace' }}>
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

// --- High-Fidelity Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '24px 16px',
            background: '#19191b',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '8px',
            margin: '12px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f87171' }}>
            {this.props.fallbackTitle || 'Something went wrong rendering this view'}
          </div>
          <div
            style={{
              fontSize: '11px',
              fontFamily: "'Geist Mono', Consolas, monospace",
              color: '#a1a1aa',
              maxHeight: '120px',
              overflowY: 'auto',
              maxWidth: '100%',
              background: '#121213',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              wordBreak: 'break-all',
            }}
          >
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              background: '#0078d4',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Reset View</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
