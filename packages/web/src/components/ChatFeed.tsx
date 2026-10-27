import React, { useState, useRef } from 'react';
import {
  Brain,
  ChevronRight,
  FileText,
  Terminal,
  Image as ImageIcon,
  Globe,
  ThumbsUp,
  ThumbsDown,
  Search,
  Layers,
  Play,
  Pause,
  Mic,
} from 'lucide-react';
import { ChatMessage, AudioAttachment } from '@agy-companion/protocol';
import { CopyButton, MarkdownContent, FileTypeBadge, triggerHaptic } from './CommonUI';

const AudioPlayerBubble: React.FC<{ audio: AudioAttachment }> = ({ audio }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    triggerHaptic(15);
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && (!duration || isNaN(duration))) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const audioSrc = `data:${audio.mimeType || 'audio/webm'};base64,${audio.base64}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#161616',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        padding: '6px 10px',
        marginTop: '8px',
        maxWidth: '280px',
      }}
    >
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#282828',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa' }}>
          <span style={{ fontWeight: 600, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Mic size={11} color="#ffffff" />
            <span>{audio.name || 'Voice Note'}</span>
          </span>
          <span style={{ fontFamily: 'monospace' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div
          onClick={e => {
            if (!audioRef.current || duration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = clickPos * duration;
          }}
          style={{
            height: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            overflow: 'hidden',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: '#ffffff',
              borderRadius: '2px',
            }}
          />
        </div>
      </div>
    </div>
  );
};

interface ChatFeedProps {
  chatMessages: ChatMessage[];
  expandedThoughts: Record<string, boolean>;
  setExpandedThoughts: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenModal: (modal: 'diff' | 'terminal' | 'artifacts' | 'browser') => void;
  hasArtifacts: boolean;
  isStreaming: boolean;
  currentThinking: string | null;
  isCurrentThoughtExpanded: boolean;
  setIsCurrentThoughtExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  thinkingElapsed: number;
  isQueued: boolean;
  onDismissQueued?: () => void;
  ideStatus?: 'active' | 'dormant';
  onLaunchIde?: () => void;
}

export const ChatFeed = React.memo<ChatFeedProps>(({
  chatMessages,
  expandedThoughts,
  setExpandedThoughts,
  onOpenModal,
  hasArtifacts,
  isStreaming,
  currentThinking,
  isCurrentThoughtExpanded,
  setIsCurrentThoughtExpanded,
  thinkingElapsed,
  isQueued,
  onDismissQueued,
  ideStatus = 'active',
  onLaunchIde,
}) => {
  const isLastMessageAnswered =
    chatMessages.length > 0 &&
    chatMessages[chatMessages.length - 1]?.role === 'assistant' &&
    Boolean(chatMessages[chatMessages.length - 1]?.content);

  return (
    <>
      {ideStatus === 'dormant' && onLaunchIde && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '6px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: '11px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }} />
            Antigravity IDE is closed on PC
          </span>
          <button
            onClick={() => {
              triggerHaptic(30);
              onLaunchIde();
            }}
            style={{
              background: '#22c55e',
              color: '#000000',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Play size={10} fill="#000000" />
            Launch on PC
          </button>
        </div>
      )}
      {chatMessages.map((msg, index) => {
        if (msg.role === 'user') {
          return (
            <div
              key={msg.id || index}
              style={{
                background: '#0d0d0e',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#ededed',
                fontSize: 'clamp(13.5px, 3.8vw, 15px)',
                lineHeight: '1.55',
                overflowWrap: 'break-word',
                wordBreak: 'normal',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              {msg.content}
              {msg.audio && <AudioPlayerBubble audio={msg.audio} />}
              {msg.images && msg.images.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt="User upload"
                      style={{ maxWidth: '120px', maxHeight: '100px', borderRadius: '6px', objectFit: 'cover' }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (msg.role === 'assistant') {
          const isThoughtOpen = expandedThoughts[msg.id];
          return (
            <div
              key={msg.id || index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxWidth: '100%',
              }}
            >
              {/* Collapsible Thought Accordion */}
              {msg.thought && (
                <div>
                  <button
                    onClick={() => {
                      setExpandedThoughts(prev => ({ ...prev, [msg.id]: !prev[msg.id] }));
                      triggerHaptic(15);
                    }}
                    style={{
                      background: isThoughtOpen ? '#141416' : '#0d0d0e',
                      border: `1px solid ${isThoughtOpen ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: '6px',
                      color: isThoughtOpen ? '#ffffff' : '#a1a1aa',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      fontFamily: "'Geist Mono', Consolas, monospace",
                      transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                    }}
                  >
                    <Brain size={12} color={isThoughtOpen ? '#ffffff' : '#71717a'} />
                    <span style={{ fontWeight: 500 }}>Thinking Process</span>
                    <span style={{ fontSize: '10px', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>
                      ({msg.thought.split(/\s+/).filter(Boolean).length} words)
                    </span>
                    <ChevronRight
                      size={11}
                      color="#71717a"
                      style={{
                        transform: isThoughtOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                        marginLeft: '2px',
                      }}
                    />
                  </button>
                  {isThoughtOpen && (
                    <div
                      style={{
                        background: '#141415',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '11.5px',
                        color: '#d4d4d8',
                        fontFamily: "'Geist Mono', Consolas, monospace",
                        maxHeight: '260px',
                        overflowY: 'auto',
                        marginTop: '6px',
                        lineHeight: '1.55',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.thought}
                    </div>
                  )}
                </div>
              )}

              {/* Markdown Message Content */}
              <MarkdownContent content={msg.content} />

              {/* Quick-Action Tool Shelf (Diff, Terminal, Artifacts, Browser) */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#0d0d0e',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '2px 5px',
                  marginTop: '6px',
                  width: 'fit-content',
                }}
              >
                <button
                  onClick={() => {
                    onOpenModal('diff');
                    triggerHaptic(20);
                  }}
                  title="View File Changes"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 500,
                    fontFamily: "'Geist Mono', monospace",
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  <FileText size={12} color="#ededed" />
                  <span>diff</span>
                </button>

                <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.08)' }} />

                <button
                  onClick={() => {
                    onOpenModal('terminal');
                    triggerHaptic(20);
                  }}
                  title="View Terminal"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 500,
                    fontFamily: "'Geist Mono', monospace",
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  <Terminal size={12} color="#ededed" />
                  <span>terminal</span>
                </button>

                <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.08)' }} />

                <button
                  onClick={() => {
                    onOpenModal('artifacts');
                    triggerHaptic(20);
                  }}
                  title="View Artifacts"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 500,
                    fontFamily: "'Geist Mono', monospace",
                    position: 'relative',
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  <ImageIcon size={12} color="#ededed" />
                  <span>artifacts</span>
                  {hasArtifacts && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: '#ffffff',
                      }}
                    />
                  )}
                </button>

                <div style={{ width: '1px', height: '12px', background: 'rgba(255, 255, 255, 0.08)' }} />

                <button
                  onClick={() => {
                    onOpenModal('browser');
                    triggerHaptic(20);
                  }}
                  title="View Browser Preview"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 500,
                    fontFamily: "'Geist Mono', monospace",
                    transition: 'background 120ms ease, color 120ms ease',
                  }}
                >
                  <Globe size={12} color="#ededed" />
                  <span>browser</span>
                </button>
              </div>

              {/* Message Action Footer: Timestamp, Copy, Thumbs Up/Down */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '2px',
                  color: '#858585',
                  fontSize: '11px',
                }}
              >
                <span>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CopyButton text={msg.content} />
                  <button
                    onClick={() => triggerHaptic(15)}
                    style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '2px' }}
                  >
                    <ThumbsUp size={12} />
                  </button>
                  <button
                    onClick={() => triggerHaptic(15)}
                    style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '2px' }}
                  >
                    <ThumbsDown size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        if (msg.role === 'tool') {
          const isThoughtOpen = expandedThoughts[msg.id];
          const tc = msg.toolCall;
          const toolName = tc?.name || 'tool';
          const cmd = tc?.args?.CommandLine;
          const targetFile = tc?.args?.AbsolutePath || tc?.args?.TargetFile;
          const query = tc?.args?.Query;
          const fileName = targetFile ? targetFile.replace(/\\/g, '/').split('/').pop() : null;

          return (
            <div
              key={msg.id || index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxWidth: '100%',
              }}
            >
              {msg.thought && (
                <div>
                  <button
                    onClick={() => {
                      setExpandedThoughts(prev => ({ ...prev, [msg.id]: !prev[msg.id] }));
                      triggerHaptic(15);
                    }}
                    style={{
                      background: isThoughtOpen ? '#202022' : '#181818',
                      border: `1px solid ${isThoughtOpen ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: '6px',
                      color: isThoughtOpen ? '#f4f4f5' : '#a1a1aa',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      fontFamily: "'Geist Mono', Consolas, monospace",
                      transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                    }}
                  >
                    <Brain size={12} color={isThoughtOpen ? '#e4e4e7' : '#71717a'} />
                    <span style={{ fontWeight: 500 }}>Thinking Process</span>
                    <span style={{ fontSize: '10px', color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>
                      ({msg.thought.split(/\s+/).filter(Boolean).length} words)
                    </span>
                    <ChevronRight
                      size={11}
                      color="#71717a"
                      style={{
                        transform: isThoughtOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                        marginLeft: '2px',
                      }}
                    />
                  </button>
                  {isThoughtOpen && (
                    <div
                      style={{
                        background: '#141415',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '11.5px',
                        color: '#d4d4d8',
                        fontFamily: "'Geist Mono', Consolas, monospace",
                        maxHeight: '260px',
                        overflowY: 'auto',
                        marginTop: '6px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.55',
                      }}
                    >
                      {msg.thought}
                    </div>
                  )}
                </div>
              )}

              {/* Tool Step Card */}
              <div
                style={{
                  background: '#181818',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {toolName === 'run_command' && (
                    <>
                      <Terminal size={13} color="#858585" />
                      <span style={{ fontFamily: "'Geist Mono', Consolas, monospace", fontSize: '12px', color: '#cccccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        $ {cmd || msg.content}
                      </span>
                    </>
                  )}
                  {(toolName === 'view_file' || toolName === 'replace_file_content' || toolName === 'write_to_file') && (
                    <>
                      {fileName ? <FileTypeBadge name={fileName} /> : <FileText size={13} color="#858585" />}
                      <span style={{ fontSize: '12px', color: '#cccccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#858585' }}>{toolName === 'view_file' ? 'View' : 'Edit'} </span>
                        <span style={{ fontWeight: 600, color: '#ffffff' }}>{fileName || msg.content}</span>
                      </span>
                    </>
                  )}
                  {toolName === 'grep_search' && (
                    <>
                      <Search size={13} color="#858585" />
                      <span style={{ fontSize: '12px', color: '#cccccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#858585' }}>Search </span>
                        <span style={{ fontFamily: "'Geist Mono', Consolas, monospace", color: '#cccccc' }}>"{query || msg.content}"</span>
                      </span>
                    </>
                  )}
                  {toolName !== 'run_command' && toolName !== 'view_file' && toolName !== 'replace_file_content' && toolName !== 'write_to_file' && toolName !== 'grep_search' && (
                    <>
                      <Layers size={13} color="#858585" />
                      <span style={{ fontSize: '12px', color: '#cccccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {msg.content || toolName}
                      </span>
                    </>
                  )}
                </div>

                <span style={{ fontSize: '10px', color: '#858585', fontFamily: "'Geist Mono', monospace", flexShrink: 0 }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Live Active Model Thinking Stream */}
      {(isStreaming || currentThinking) && currentThinking && !isLastMessageAnswered && (
        <div
          style={{
            background: '#181818',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            onClick={() => {
              setIsCurrentThoughtExpanded(!isCurrentThoughtExpanded);
              triggerHaptic(15);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Model Thinking {thinkingElapsed > 0 ? `(${thinkingElapsed}s)` : ''}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontFamily: "'Geist Mono', monospace",
                  fontWeight: 600,
                }}
              >
                LIVE
              </span>
            </div>
            <ChevronRight
              size={14}
              color="#71717a"
              style={{
                transform: isCurrentThoughtExpanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </div>
          {isCurrentThoughtExpanded && (
            <div
              style={{
                background: '#141415',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '11.5px',
                color: '#d4d4d8',
                fontFamily: "'Geist Mono', Consolas, monospace",
                maxHeight: '220px',
                overflowY: 'auto',
                lineHeight: '1.55',
                whiteSpace: 'pre-wrap',
              }}
            >
              {currentThinking}
            </div>
          )}
        </div>
      )}

      {/* Queued state: Message dispatched from phone, awaiting Antigravity agent pickup */}
      {isQueued && !isStreaming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '6px',
            color: '#f59e0b',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'inline-block',
              }}
            />
            <span>Queued for Antigravity...</span>
          </div>
          {onDismissQueued && (
            <button
              onClick={() => {
                triggerHaptic(20);
                onDismissQueued();
              }}
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '4px',
                color: '#f59e0b',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Active Working Pulse when Agent is actively thinking/processing */}
      {isStreaming && !currentThinking && !isLastMessageAnswered && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 4px',
            color: '#ffffff',
            fontSize: '12px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#ffffff',
              display: 'inline-block',
            }}
          />
          <span>Antigravity is processing...</span>
        </div>
      )}
    </>
  );
});
