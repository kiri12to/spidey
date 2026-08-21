import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  Bookmark, 
  Trash2, 
  Mic, 
  RotateCcw, 
  Settings as SettingsIcon,
  Server
} from 'lucide-react';
import { ChatMessage, UserSettings } from '../types';
import { sendUserMessage, pingLocalAi } from '../agent';
import { spideyApi } from '../services/spideyApi';
import { loadStoredChatMessages, saveStoredChatMessages } from '../services/storage';
import { playSpideyReplySound } from '../services/sound';

interface SpideyAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onExecuteActionTrigger?: (actionType: string) => void;
}

export const SpideyAssistantDrawer: React.FC<SpideyAssistantDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onExecuteActionTrigger,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadStoredChatMessages();
    if (saved && saved.length > 0) {
      return saved;
    }
    return [
      {
        id: 'msg-init-1',
        sender: 'spidey',
        text: `Watching the board. What's on your mind?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: settings.localAi?.modelName || 'local-ai',
      },
    ];
  });

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [memoriesList, setMemoriesList] = useState<string[]>(spideyApi.getMemories());
  const [isTestingLocalAi, setIsTestingLocalAi] = useState(false);
  const [localAiPingStatus, setLocalAiPingStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [lastPingMessage, setLastPingMessage] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Check speech recognition support
  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      setSpeechSupported(true);
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setInputValue(transcript);
      };

      rec.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!speechSupported || !recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Could not start voice recognition:', err);
      }
    }
  };

  // Subscribe to memories change
  useEffect(() => {
    return spideyApi.subscribe(() => {
      setMemoriesList(spideyApi.getMemories());
    });
  }, []);

  // Save messages to storage when changed
  useEffect(() => {
    saveStoredChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isOpen]);

  const handleClearHistory = () => {
    const fresh: ChatMessage[] = [
      {
        id: `msg-init-${Date.now()}`,
        sender: 'spidey',
        text: `Clean slate. Standing by.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: settings.localAi?.modelName || 'local-ai',
      },
    ];
    setMessages(fresh);
    saveStoredChatMessages(fresh);
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if (!textToSend || isLoading) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const result = await sendUserMessage(
        textToSend,
        messages,
        settings.localAi,
        settings.userName || 'Anas'
      );

      const spideyMsg: ChatMessage = {
        id: `spidey-${Date.now()}`,
        sender: 'spidey',
        text: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionExecuted: result.actionExecuted,
        modelUsed: result.modelUsed,
      };

      setMessages((prev) => [...prev, spideyMsg]);
      playSpideyReplySound();

      if (result.actionExecuted && onExecuteActionTrigger) {
        onExecuteActionTrigger(result.actionExecuted.type);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `spidey-${Date.now()}`,
          sender: 'spidey',
          text: err.message || `Couldn't reach local model endpoint.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
          modelUsed: settings.localAi?.modelName || 'local-ai',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestLocalConnection = async () => {
    setIsTestingLocalAi(true);
    setLocalAiPingStatus('idle');
    setLastPingMessage('');

    try {
      const res = await pingLocalAi(settings.localAi);
      if (res.success) {
        setLocalAiPingStatus('success');
        setLastPingMessage(res.message);
      } else {
        setLocalAiPingStatus('failed');
        setLastPingMessage(res.message);
      }
    } catch (e: any) {
      setLocalAiPingStatus('failed');
      setLastPingMessage(e.message || 'Connection failed');
    } finally {
      setIsTestingLocalAi(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      id="spidey-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        id="spidey-drawer-container"
        className="w-full max-w-md h-full bg-[#09090b] border-l border-neutral-800/80 shadow-2xl flex flex-col justify-between text-zinc-200 animate-in slide-in-from-right duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Noir Header */}
        <div id="spidey-header" className="px-4 py-3.5 border-b border-neutral-800/70 bg-[#0c0c0e] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Minimal glyph */}
            <div className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-red-500/90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9" strokeWidth="1.2" opacity="0.5" />
              </svg>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm tracking-wider text-zinc-100 uppercase">
                Spidey
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                {settings.localAi?.modelName || 'local-ai'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="clear-spidey-chat-btn"
              onClick={handleClearHistory}
              title="Clear conversation"
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800/60 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              id="spidey-memories-btn"
              onClick={() => {
                setShowMemories(!showMemories);
                if (showConfig) setShowConfig(false);
              }}
              title="Memories"
              className={`p-1.5 rounded-md text-xs transition flex items-center gap-1 ${
                showMemories
                  ? 'bg-neutral-800 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800/60'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {memoriesList.length > 0 && (
                <span className="text-[10px] font-mono text-red-400">{memoriesList.length}</span>
              )}
            </button>

            <button
              id="spidey-settings-toggle-btn"
              onClick={() => {
                setShowConfig(!showConfig);
                if (showMemories) setShowMemories(false);
              }}
              title="Model Settings"
              className={`p-1.5 rounded-md text-xs transition ${
                showConfig
                  ? 'bg-neutral-800 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800/60'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>

            <button
              id="close-spidey-drawer-btn"
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-neutral-800/60 transition ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Memories Slide-down */}
        {showMemories && (
          <div id="spidey-memories-panel" className="p-3.5 bg-[#111114] border-b border-neutral-800 text-xs font-mono space-y-2 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-red-400" />
                Memories ({memoriesList.length})
              </span>
              {memoriesList.length > 0 && (
                <button
                  id="clear-all-memories-btn"
                  onClick={() => spideyApi.clearMemories()}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            {memoriesList.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic py-1">
                No memories stored yet.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {memoriesList.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-neutral-900 border border-neutral-800/80 text-zinc-300 text-[11px] flex items-start justify-between gap-2"
                  >
                    <span>• {m}</span>
                    <button
                      onClick={() => spideyApi.deleteMemory(idx)}
                      className="text-zinc-500 hover:text-red-400 transition shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Slide-down */}
        {showConfig && (
          <div id="spidey-config-panel" className="p-4 bg-[#111114] border-b border-neutral-800 text-xs space-y-3 animate-in slide-in-from-top-2 duration-150 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-zinc-200 font-semibold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-red-400" />
                Local AI Configuration
              </span>
              <span className="text-[10px] text-zinc-500">Ollama / OpenAI</span>
            </div>

            <div className="space-y-2 pt-1">
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                  Server Endpoint
                </label>
                <input
                  type="text"
                  value={settings.localAi?.endpointUrl || 'http://localhost:11434/api/chat'}
                  onChange={(e) =>
                    onUpdateSettings({
                      localAi: { ...settings.localAi, endpointUrl: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                    Provider
                  </label>
                  <select
                    value={settings.localAi?.provider || 'ollama'}
                    onChange={(e) =>
                      onUpdateSettings({
                        localAi: { ...settings.localAi, provider: e.target.value as any },
                      })
                    }
                    className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai_compatible">OpenAI API</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                    Model Tag
                  </label>
                  <input
                    type="text"
                    value={settings.localAi?.modelName || 'qwen3:8b'}
                    onChange={(e) =>
                      onUpdateSettings({
                        localAi: { ...settings.localAi, modelName: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTestLocalConnection}
                  disabled={isTestingLocalAi}
                  className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-zinc-200 transition"
                >
                  {isTestingLocalAi ? 'Pinging...' : 'Test Connection'}
                </button>
                {localAiPingStatus === 'success' && (
                  <span className="text-[11px] text-emerald-400 truncate max-w-[220px]">
                    {lastPingMessage || 'Ready'}
                  </span>
                )}
                {localAiPingStatus === 'failed' && (
                  <span className="text-[11px] text-red-400 truncate max-w-[220px]">
                    {lastPingMessage || 'Offline'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Minimal Noir Message Stream */}
        <div id="spidey-chat-messages" className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-150`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-neutral-800 text-zinc-100 rounded-br-xs'
                      : msg.isError
                      ? 'bg-red-950/30 border border-red-900/50 text-red-300 rounded-bl-xs'
                      : 'bg-neutral-900/90 border border-neutral-800/80 text-zinc-200 rounded-bl-xs'
                  }`}
                >
                  {msg.text}

                  {/* Executed Action Badge */}
                  {msg.actionExecuted && (
                    <div className="mt-2 pt-1.5 border-t border-neutral-800/60 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{msg.actionExecuted.details}</span>
                    </div>
                  )}
                </div>

                <span className="text-[9px] text-zinc-600 mt-1 px-1 font-mono">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-1.5 p-2.5 bg-neutral-900/60 border border-neutral-800/60 rounded-xl rounded-bl-xs w-20 text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 animate-pulse [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 animate-pulse [animation-delay:0.4s]" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Minimal Noir Input Bar */}
        <div id="spidey-input-bar" className="p-3 border-t border-neutral-800/80 bg-[#0c0c0e]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {speechSupported && (
              <button
                type="button"
                id="spidey-voice-btn"
                onClick={toggleVoiceInput}
                className={`p-2 rounded-lg transition ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-neutral-900 text-zinc-400 hover:text-zinc-200 border border-neutral-800'
                }`}
                title={isListening ? 'Listening...' : 'Voice Input'}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            <input
              ref={inputRef}
              id="spidey-chat-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Express yourself, manage tasks, or talk..."
              disabled={isLoading}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-600/60 transition font-sans"
            />

            <button
              type="submit"
              id="spidey-send-btn"
              disabled={!inputValue.trim() || isLoading}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 text-zinc-100 transition flex items-center justify-center border border-neutral-700"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

