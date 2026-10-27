import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  ArrowLeft,
  ChevronDown,
  Plus,
  Image as ImageIcon,
  AtSign,
  CheckSquare,
  Clock,
  X,
  Mic,
  Square,
  ArrowRight,
  Zap,
  Pencil,
  Play,
  Pause,
  Trash2,
  Check,
} from 'lucide-react';
import { triggerHaptic } from './CommonUI';
import { acquireWakeLock, releaseWakeLock } from '../utils/screenLock';
import { CompanionMode, ExecutionPolicy, QuickAction } from '@agy-companion/protocol';

interface ModifiedFile {
  file: string;
  ins: number;
  del: number;
  isNew: boolean;
  fullPath?: string;
}

interface AttachedImage {
  preview: string;
  name: string;
  base64: string;
}

export interface AttachedAudio {
  base64: string;
  mimeType: string;
  duration: number;
  name?: string;
  previewUrl?: string;
}

interface PromptDockProps {
  promptText: string;
  setPromptText: React.Dispatch<React.SetStateAction<string>>;
  isStreaming: boolean;
  currentThinking?: string | null;
  isQueued?: boolean;
  connected: boolean;
  companionMode: CompanionMode;
  onToggleMode?: (mode: CompanionMode) => void;
  executionPolicy?: ExecutionPolicy;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  attachedImages: AttachedImage[];
  setAttachedImages: React.Dispatch<React.SetStateAction<AttachedImage[]>>;
  attachedAudio: AttachedAudio | null;
  setAttachedAudio: React.Dispatch<React.SetStateAction<AttachedAudio | null>>;
  queuedPrompts: string[];
  setQueuedPrompts: React.Dispatch<React.SetStateAction<string[]>>;
  onForceSendPrompt: (promptText: string) => void;
  onCancelQueuedPrompt: (index: number) => void;
  onEditQueuedPrompt: (index: number, text: string) => void;
  quickActions: QuickAction[];
  onRunQuickAction: (qa: QuickAction) => void;
  onSendPrompt: (explicitText?: string) => void;
  onQueuePrompt: (explicitText?: string) => void;
  onEmergencyStop: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PromptDock = React.memo<PromptDockProps>(({
  promptText,
  setPromptText,
  isStreaming,
  currentThinking,
  isQueued,
  connected,
  companionMode,
  onToggleMode,
  executionPolicy = 'force_ask',
  selectedModel,
  setSelectedModel,
  attachedImages,
  setAttachedImages,
  attachedAudio,
  setAttachedAudio,
  queuedPrompts,
  setQueuedPrompts,
  onForceSendPrompt,
  onCancelQueuedPrompt,
  onEditQueuedPrompt,
  quickActions,
  onRunQuickAction,
  onSendPrompt,
  onQueuePrompt,
  onEmergencyStop,
  fileInputRef,
  textareaRef,
  onFileChange,
}) => {
  const [showAddContextMenu, setShowAddContextMenu] = useState<boolean>(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [localText, setLocalText] = useState<string>(promptText || '');

  // Audio recording state
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingSecondsRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setLocalText(promptText || '');
  }, [promptText]);

  useEffect(() => {
    if (isRecordingAudio) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isRecordingAudio]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRecordingAudio) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isRecordingAudio]);

  useEffect(() => {
    return () => {
      releaseWakeLock();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startAudioRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported on this browser/environment.');
        return;
      }
      triggerHaptic(30);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const duration = recordingSecondsRef.current || 1;
        const m = Math.floor(duration / 60);
        const s = duration % 60;
        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || '';
          setAttachedAudio({
            base64,
            mimeType: blob.type || 'audio/webm',
            duration,
            name: `Voice Note (${timeStr})`,
            previewUrl: URL.createObjectURL(blob),
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error('[PromptDock] Failed to start audio recording:', err);
      setIsRecordingAudio(false);
      triggerHaptic(50);
    }
  };

  const stopAudioRecording = () => {
    releaseWakeLock();
    triggerHaptic(20);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAudio(false);
  };

  const cancelAudioRecording = () => {
    releaseWakeLock();
    triggerHaptic(15);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    }
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
  };

  const togglePreviewPlayback = () => {
    triggerHaptic(15);
    if (!attachedAudio?.previewUrl) return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(attachedAudio.previewUrl);
      previewAudioRef.current.onended = () => setIsPreviewPlaying(false);
    }
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.src = attachedAudio.previewUrl;
      previewAudioRef.current.play()
        .then(() => setIsPreviewPlaying(true))
        .catch(() => setIsPreviewPlaying(false));
    }
  };

  const isBusy = isStreaming || Boolean(currentThinking) || Boolean(isQueued);
  const hasInput = Boolean(localText.trim() || attachedImages.length > 0 || attachedAudio);

  return (
    <footer
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
        paddingTop: '8px',
        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.75) 30%, #000000 85%)',
        boxSizing: 'border-box',
        zIndex: 35,
        pointerEvents: 'none',
      }}
    >
      {/* Hidden File Input */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      <div
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          pointerEvents: 'auto',
        }}
      >
        {/* Input Card Container */}
        <div
          style={{
            background: '#0a0a0c',
            border: '1px solid #1f1f1f',
            borderRadius: '12px',
            padding: '8px 12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            position: 'relative',
          }}
        >
          {/* Add Context Menu Popup */}
          {showAddContextMenu && (
            <div
              style={{
                position: 'absolute',
                bottom: '54px',
                left: '10px',
                background: '#181818',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                width: '180px',
                zIndex: 60,
                padding: '6px 0',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#858585',
                  padding: '4px 12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Add Context
              </div>

              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowAddContextMenu(false);
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#cccccc',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ImageIcon size={14} color="#858585" />
                <span>Media</span>
              </button>

              <button
                onClick={() => {
                  setLocalText(prev => prev + '@');
                  setPromptText(prev => prev + '@');
                  setShowAddContextMenu(false);
                  textareaRef.current?.focus();
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#cccccc',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <AtSign size={14} color="#858585" />
                <span>Mentions</span>
              </button>

              <button
                onClick={() => {
                  setLocalText(prev => (prev ? prev + ' /' : '/'));
                  setPromptText(prev => (prev ? prev + ' /' : '/'));
                  setShowAddContextMenu(false);
                  textareaRef.current?.focus();
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#cccccc',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <CheckSquare size={14} color="#858585" />
                <span>Actions</span>
              </button>


            </div>
          )}

          {/* Antigravity IDE 1:1 Model Selector Popover */}
          {showModelDropdown && (
            <div
              style={{
                position: 'absolute',
                bottom: '54px',
                left: '12px',
                background: '#1e1e1e',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
                width: 'min(310px, calc(100vw - 24px))',
                zIndex: 70,
                padding: '8px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#858585',
                  padding: '4px 6px 8px 6px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  marginBottom: '6px',
                  lineHeight: '1.35',
                }}
              >
                Selected models are shared across members on your workspace.
              </div>

              {/* Model 1: Gemini 3.8 Flash with Low | Medium | High */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: selectedModel.startsWith('Gemini 3.8 Flash') ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                }}
              >
                <div
                  onClick={() => {
                    const currentEffort = selectedModel.includes('Low') ? 'Low' : selectedModel.includes('High') ? 'High' : 'Medium';
                    setSelectedModel(`Gemini 3.8 Flash ${currentEffort}`);
                    setShowModelDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    fontSize: '12px',
                    fontWeight: selectedModel.startsWith('Gemini 3.8 Flash') ? 600 : 400,
                    color: selectedModel.startsWith('Gemini 3.8 Flash') ? '#ffffff' : '#cccccc',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  Gemini 3.8 Flash
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '5px',
                    padding: '2px',
                    gap: '2px',
                  }}
                >
                  {(['Low', 'Medium', 'High'] as const).map(effort => {
                    const isSelected = selectedModel.startsWith('Gemini 3.8 Flash') && (
                      effort === 'Medium' ? (!selectedModel.includes('Low') && !selectedModel.includes('High')) || selectedModel.includes('Medium')
                      : selectedModel.includes(effort)
                    );
                    return (
                      <button
                        key={effort}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModel(`Gemini 3.8 Flash ${effort}`);
                          setShowModelDropdown(false);
                          triggerHaptic(20);
                        }}
                        style={{
                          background: isSelected ? '#333333' : 'transparent',
                          color: isSelected ? '#ffffff' : '#858585',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '10.5px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {effort}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Model 2: Claude Sonnet 4.6 (Thinking) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('Claude Sonnet 4.6 (Thinking)');
                  setShowModelDropdown(false);
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: selectedModel === 'Claude Sonnet 4.6 (Thinking)' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 8px',
                  color: selectedModel === 'Claude Sonnet 4.6 (Thinking)' ? '#ffffff' : '#cccccc',
                  fontSize: '12px',
                  fontWeight: selectedModel === 'Claude Sonnet 4.6 (Thinking)' ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>Claude Sonnet 4.6 (Thinking)</span>
              </button>

              {/* Model 3: Claude Opus 4.6 (Thinking) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('Claude Opus 4.6 (Thinking)');
                  setShowModelDropdown(false);
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: selectedModel === 'Claude Opus 4.6 (Thinking)' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 8px',
                  color: selectedModel === 'Claude Opus 4.6 (Thinking)' ? '#ffffff' : '#cccccc',
                  fontSize: '12px',
                  fontWeight: selectedModel === 'Claude Opus 4.6 (Thinking)' ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>Claude Opus 4.6 (Thinking)</span>
              </button>

              {/* Model 4: GPT-OSS 120B (Medium) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('GPT-OSS 120B (Medium)');
                  setShowModelDropdown(false);
                  triggerHaptic(20);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: selectedModel === 'GPT-OSS 120B (Medium)' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 8px',
                  color: selectedModel === 'GPT-OSS 120B (Medium)' ? '#ffffff' : '#cccccc',
                  fontSize: '12px',
                  fontWeight: selectedModel === 'GPT-OSS 120B (Medium)' ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>GPT-OSS 120B (Medium)</span>
              </button>
            </div>
          )}

          {/* Queued Prompts Tray */}
          {queuedPrompts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
              {queuedPrompts.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '11.5px',
                    color: '#cccccc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <Clock size={11} color="#858585" />
                    <span style={{ fontWeight: 600, color: '#858585' }}>Queued ({idx + 1}):</span>
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: '#cccccc' }}>
                      {q}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => onForceSendPrompt(q)}
                      title="Abort current task and force send this prompt now"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '5px',
                        color: '#ffffff',
                        padding: '2px 7px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Zap size={10} color="#ffffff" />
                      <span>Force Send</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditQueuedPrompt(idx, q)}
                      title="Edit this queued message"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '5px',
                        color: '#e2e8f0',
                        padding: '2px 6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Pencil size={10} color="#e2e8f0" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelQueuedPrompt(idx)}
                      title="Cancel queued prompt"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '5px',
                        color: '#a1a1aa',
                        padding: '2px 6px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={11} color="#a1a1aa" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attached Audio & Images Chips Tray */}
          {(attachedImages.length > 0 || attachedAudio) && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', alignItems: 'center' }}>
              {attachedAudio && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#282828',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    color: '#e4e4e7',
                    fontSize: '11px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  <Mic size={12} color="#ffffff" />
                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {attachedAudio.name || 'Voice Note'}
                  </span>
                  <button
                    type="button"
                    onClick={togglePreviewPlayback}
                    title={isPreviewPlaying ? 'Pause' : 'Play preview'}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {isPreviewPlaying ? <Pause size={9} /> : <Play size={9} style={{ marginLeft: '1px' }} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewAudioRef.current) {
                        previewAudioRef.current.pause();
                      }
                      setIsPreviewPlaying(false);
                      setAttachedAudio(null);
                      triggerHaptic(15);
                    }}
                    title="Remove Voice Note"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#858585',
                      cursor: 'pointer',
                      padding: '1px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {attachedImages.map((img, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#282828',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '3px 6px',
                    flexShrink: 0,
                  }}
                >
                  <img src={img.preview} alt={img.name} style={{ width: '22px', height: '22px', borderRadius: '4px' }} />
                  <span style={{ fontSize: '11px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.name}
                  </span>
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '1px' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Audio Recording Bar */}
          {isRecordingAudio && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '6px 10px',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#ef4444',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5' }}>
                  Recording...
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#ffffff', fontWeight: 600 }}>
                  {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={cancelAudioRecording}
                  title="Discard voice recording"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '5px',
                    color: '#f87171',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '3px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Trash2 size={11} color="#f87171" />
                  <span>Discard</span>
                </button>
                <button
                  type="button"
                  onClick={stopAudioRecording}
                  title="Finish and attach voice note"
                  style={{
                    background: '#ffffff',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#000000',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 9px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Check size={11} color="#ffffff" />
                  <span>Done</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Templates Tray */}
          {quickActions.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '6px',
                marginBottom: '8px',
                overflowX: 'auto',
                paddingBottom: '2px',
                scrollbarWidth: 'none',
              }}
            >
              {quickActions.map(qa => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() => onRunQuickAction(qa)}
                  title={qa.command}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#1c1c1e',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '3px 8px',
                    color: '#e4e4e7',
                    fontSize: '11px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Zap size={11} color="#ffffff" />
                  <span>{qa.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Textarea Input */}
          <textarea
            ref={textareaRef}
            placeholder={isStreaming ? 'Agent is working... Type follow-up to queue' : 'Ask anything. @ to mention, / for actions'}
            value={localText}
            onChange={e => {
              const val = e.target.value;
              setLocalText(val);
              const target = e.target;
              requestAnimationFrame(() => {
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              });
            }}
            onBlur={() => {
              setPromptText(localText);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isBusy) {
                  onQueuePrompt(localText);
                } else {
                  onSendPrompt(localText);
                }
              }
            }}
            enterKeyHint="enter"
            rows={1}
            style={{
              width: '100%',
              minHeight: '26px',
              maxHeight: '120px',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '13.5px',
              lineHeight: '1.45',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              padding: '2px 0 6px 0',
            }}
          />

          {/* Bottom Row Inside Input Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '4px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Left Sub-Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAddContextMenu(!showAddContextMenu);
                  setShowModelDropdown(false);
                  triggerHaptic(20);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#858585',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <Plus size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowModelDropdown(!showModelDropdown);
                  setShowAddContextMenu(false);
                  triggerHaptic(20);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#858585',
                  fontSize: '11.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                }}
              >
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedModel.startsWith('Gemini 3.8 Flash')
                    ? `Gemini 3.8 Flash (${selectedModel.replace('Gemini 3.8 Flash', '').trim() || 'Medium'})`
                    : selectedModel}
                </span>
                <ChevronDown size={11} />
              </button>

              <div
                onClick={() => {
                  if (onToggleMode) {
                    triggerHaptic(25);
                    const isRemote = companionMode === 'remote' || companionMode === 'autonomous';
                    onToggleMode(isRemote ? 'desk' : 'remote');
                  }
                }}
                title={onToggleMode ? 'Tap to switch Desk / Remote companion mode' : 'Companion Mode'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: '#858585',
                  padding: '3px 7px',
                  borderRadius: '5px',
                  cursor: onToggleMode ? 'pointer' : 'default',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  userSelect: 'none',
                  transition: 'background 120ms ease',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: connected
                      ? companionMode === 'remote' || companionMode === 'autonomous'
                        ? '#ffffff'
                        : '#10b981'
                      : '#71717a',
                  }}
                />
                <span style={{ color: '#a1a1aa', fontWeight: 500 }}>
                  {connected
                    ? companionMode === 'remote' || companionMode === 'autonomous'
                      ? 'Remote'
                      : companionMode === 'auto'
                      ? 'Auto'
                      : 'Desk'
                    : 'Offline'}
                </span>
              </div>
            </div>

            {/* Right Sub-Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isRecordingAudio && (
                <button
                  type="button"
                  onClick={cancelAudioRecording}
                  title="Discard Voice Note"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Trash2 size={13} color="#f87171" />
                </button>
              )}
              <button
                type="button"
                onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                title={isRecordingAudio ? 'Finish & Attach Voice Note' : 'Record Voice Note'}
                style={{
                  background: isRecordingAudio ? '#ffffff' : 'transparent',
                  border: 'none',
                  color: isRecordingAudio ? '#000000' : '#858585',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
              >
                {isRecordingAudio ? <Check size={14} color="#000000" /> : <Mic size={15} />}
              </button>

              {/* Dynamic Action Button: Send/Queue when user typed, Stop when busy, disabled send when idle */}
              {hasInput ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    if (isBusy) {
                      onQueuePrompt(localText);
                    } else {
                      onSendPrompt(localText);
                    }
                  }}
                  title={isBusy ? 'Queue Message' : 'Send Message'}
                  style={{
                    background: '#ffffff',
                    border: 'none',
                    color: '#000000',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 120ms ease, transform 100ms cubic-bezier(0.2, 0, 0, 1)',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <ArrowRight size={15} color="#000000" strokeWidth={2.5} />
                </button>
              ) : isBusy ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic([60, 40, 60]);
                    onEmergencyStop();
                  }}
                  title="Stop Execution (Interrupt)"
                  style={{
                    background: '#dc2626',
                    border: 'none',
                    color: '#ffffff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Square size={11} fill="#ffffff" color="#ffffff" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Send Message"
                  style={{
                    background: '#242426',
                    border: 'none',
                    color: '#52525b',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'default',
                  }}
                >
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
});
