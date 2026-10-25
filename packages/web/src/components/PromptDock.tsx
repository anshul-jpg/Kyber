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
        bottom: 'calc(38px + env(safe-area-inset-bottom, 0px))',
        left: 0,
        right: 0,
        paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
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
            background: '#1e1e1e',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '8px 12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
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
                background: '#252526',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
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

          {/* Model Selector Dropdown */}
          {showModelDropdown && (
            <div
              style={{
                position: 'absolute',
                bottom: '54px',
                left: '42px',
                background: '#252526',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                width: '210px',
                zIndex: 60,
                padding: '4px',
              }}
            >
              {[
                'Gemini 3.8 Flash High',
                'Gemini 3.8 Flash Mid',
                'Gemini 3.8 Flash Low',
                'Claude Opus 4.5',
                'Claude Sonnet 4.5',
                'GPT-4.5',
                'GPT OSS',
              ].map(model => (
                <button
                  key={model}
                  onClick={() => {
                    setSelectedModel(model);
                    setShowModelDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    width: '100%',
                    background: selectedModel === model ? '#333333' : 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '8px 10px',
                    color: selectedModel === model ? '#ffffff' : '#cccccc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {model}
                </button>
              ))}
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
                        background: 'rgba(0, 122, 204, 0.16)',
                        border: '1px solid rgba(0, 122, 204, 0.4)',
                        borderRadius: '5px',
                        color: '#38bdf8',
                        padding: '2px 7px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Zap size={10} color="#38bdf8" />
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
                    border: '1px solid rgba(0, 122, 204, 0.4)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    color: '#e4e4e7',
                    fontSize: '11px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  <Mic size={12} color="#38bdf8" />
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
                    background: '#007acc',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
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
                  <Zap size={11} color="#38bdf8" />
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
                <span>{selectedModel}</span>
                <ChevronDown size={11} />
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: '#858585',
                  paddingLeft: '4px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: connected
                      ? companionMode === 'remote' || companionMode === 'autonomous'
                        ? '#007acc'
                        : '#10b981'
                      : '#858585',
                  }}
                />
                <span style={{ color: '#858585', fontWeight: 500 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isRecordingAudio && (
                <button
                  type="button"
                  onClick={cancelAudioRecording}
                  title="Discard Voice Note"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    width: '28px',
                    height: '28px',
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
                  background: isRecordingAudio ? '#007acc' : 'transparent',
                  border: 'none',
                  color: isRecordingAudio ? '#ffffff' : '#858585',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {isRecordingAudio ? <Check size={14} color="#ffffff" /> : <Mic size={15} />}
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
                    background: '#007acc',
                    border: 'none',
                    color: '#ffffff',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ArrowRight size={14} />
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
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Square size={10} fill="#ffffff" color="#ffffff" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Send Message"
                  style={{
                    background: '#282828',
                    border: 'none',
                    color: '#555555',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'default',
                  }}
                >
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
});
