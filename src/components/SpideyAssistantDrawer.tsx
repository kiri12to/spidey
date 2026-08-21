import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Bot, 
  Sparkles, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  Server, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  Sliders,
  Bookmark,
  Trash2
} from 'lucide-react';
import { ChatMessage, LocalAiSettings, UserSettings } from '../types';
import { sendChatMessage } from '../services/aiAssistant';
import { spideyApi } from '../services/spideyApi';

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init-1',
      sender: 'spidey',
      text: `Hey ${settings.userName || 'Anas'}. I'm here watching your timeline. What are we getting done?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [memoriesList, setMemoriesList] = useState<string[]>(spideyApi.getMemories());
  const [isTestingLocalAi, setIsTestingLocalAi] = useState(false);
  const [localAiPingStatus, setLocalAiPingStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to memories change
  useEffect(() => {
    return spideyApi.subscribe(() => {
      setMemoriesList(spideyApi.getMemories());
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if (!textToSend || isLoading) return;

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
      const result = await sendChatMessage(
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
      };

      setMessages((prev) => [...prev, spideyMsg]);

      if (result.actionExecuted && onExecuteActionTrigger) {
        onExecuteActionTrigger(result.actionExecuted.type);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `spidey-${Date.now()}`,
          sender: 'spidey',
          text: `Hit a snag processing that, ${settings.userName || 'Anas'}. Let's try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestLocalConnection = async () => {
    setIsTestingLocalAi(true);
    setLocalAiPingStatus('idle');

    try {
      const isOllama = settings.localAi.provider === 'ollama';
      let testUrl = settings.localAi.endpointUrl.trim() || 'http://localhost:11434/api/chat';
      
      if (isOllama) {
        // Strip /api/chat or /api/generate to ping /api/tags
        const baseUrl = testUrl.replace(/\/api\/(chat|generate)\/?$/, '');
        testUrl = `${baseUrl}/api/tags`;
      }

      const res = await fetch(testUrl, {
        method: isOllama ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isOllama ? undefined : JSON.stringify({
          model: settings.localAi.modelName || 'llama3.1:8b',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });

      if (res.ok) {
        setLocalAiPingStatus('success');
      } else {
        setLocalAiPingStatus('failed');
      }
    } catch (e) {
      setLocalAiPingStatus('failed');
    } finally {
      setIsTestingLocalAi(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md h-full bg-[#0d0d10] border-l border-neutral-800/80 shadow-2xl flex flex-col justify-between text-zinc-200 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800/80 bg-[#09090b]/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Spidey female noir avatar */}
            <div className="relative w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-red-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6" strokeWidth="1.2" opacity="0.6" />
              </svg>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#09090b]" />
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-sm tracking-wider text-zinc-100 uppercase">
                  Spidey
                </span>
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-red-950/70 border border-red-900/60 text-red-300">
                  Companion
                </span>
              </div>
              <p className="text-[11px] font-mono-code text-zinc-400">
                Focus Hub for {settings.userName || 'Anas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setShowMemories(!showMemories);
                if (showConfig) setShowConfig(false);
              }}
              title="What Spidey Remembers"
              className={`p-1.5 rounded-md border text-xs transition flex items-center gap-1 ${
                showMemories
                  ? 'bg-neutral-800 text-red-400 border-neutral-700'
                  : 'bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-zinc-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {memoriesList.length > 0 && (
                <span className="text-[10px] font-bold text-red-400">{memoriesList.length}</span>
              )}
            </button>

            <button
              onClick={() => {
                setShowConfig(!showConfig);
                if (showMemories) setShowMemories(false);
              }}
              title="Local AI Server Settings"
              className={`p-1.5 rounded-md border text-xs transition ${
                showConfig
                  ? 'bg-neutral-800 text-red-400 border-neutral-700'
                  : 'bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Spidey Memories Panel */}
        {showMemories && (
          <div className="p-3.5 bg-[#121216] border-b border-neutral-800 text-xs font-mono-code space-y-2.5 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-zinc-200 font-semibold flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-red-400" />
                What Spidey Remembers ({memoriesList.length})
              </span>
              {memoriesList.length > 0 && (
                <button
                  onClick={() => spideyApi.clearMemories()}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear All
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              Spidey learns details from conversations (via <code className="text-zinc-300">[[REMEMBER: ...]]</code>) and references them in dialogue.
            </p>
            {memoriesList.length === 0 ? (
              <div className="text-[11px] text-zinc-500 italic py-1">
                No memories saved yet. Share habits or preferences with Spidey in chat!
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {memoriesList.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-neutral-900/90 border border-neutral-800 text-zinc-300 text-[11px] flex items-start justify-between gap-2"
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

        {/* Local AI Server Settings Accordion */}
        {showConfig && (
          <div className="p-3.5 bg-[#121216] border-b border-neutral-800 text-xs font-mono-code space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-red-400" />
                Local AI Connector (Llama 3.1:8b)
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.localAi.enabled}
                  onChange={(e) =>
                    onUpdateSettings({
                      localAi: { ...settings.localAi, enabled: e.target.checked },
                    })
                  }
                  className="rounded bg-neutral-900 border-neutral-700 text-red-600 focus:ring-0"
                />
                <span className="text-[11px] text-zinc-400">Enable Local Model</span>
              </label>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Connect Spidey directly to your offline local LLM via Ollama <code className="text-zinc-300">/api/chat</code>.
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-0.5">Endpoint URL</label>
                <input
                  type="text"
                  value={settings.localAi.endpointUrl}
                  onChange={(e) =>
                    onUpdateSettings({
                      localAi: { ...settings.localAi, endpointUrl: e.target.value },
                    })
                  }
                  placeholder="http://localhost:11434/api/chat"
                  className="w-full px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200 placeholder-zinc-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Provider Format</label>
                  <select
                    value={settings.localAi.provider}
                    onChange={(e) =>
                      onUpdateSettings({
                        localAi: { ...settings.localAi, provider: e.target.value as any },
                      })
                    }
                    className="w-full px-2 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200"
                  >
                    <option value="ollama">Ollama (/api/chat)</option>
                    <option value="openai_compatible">OpenAI / LM Studio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Model Name</label>
                  <input
                    type="text"
                    value={settings.localAi.modelName}
                    onChange={(e) =>
                      onUpdateSettings({
                        localAi: { ...settings.localAi, modelName: e.target.value },
                      })
                    }
                    placeholder="llama3.1:8b"
                    className="w-full px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between">
                <button
                  onClick={handleTestLocalConnection}
                  disabled={isTestingLocalAi}
                  className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 rounded border border-neutral-700 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${isTestingLocalAi ? 'animate-spin text-red-400' : ''}`} />
                  <span>{isTestingLocalAi ? 'Pinging...' : 'Test Connection'}</span>
                </button>

                {localAiPingStatus === 'success' && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> Server Connected
                  </span>
                )}

                {localAiPingStatus === 'failed' && (
                  <span className="text-[11px] text-red-400 flex items-center gap-1">
                    <WifiOff className="w-3 h-3" /> Server Offline
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs font-mono-code leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-neutral-800 text-zinc-100 border border-neutral-700/80 rounded-br-none'
                    : 'bg-[#141419] text-zinc-200 border border-neutral-800/90 rounded-bl-none'
                } ${msg.isError ? 'border-red-900/60 bg-red-950/30' : ''}`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Action Confirmation Badge */}
                {msg.actionExecuted && (
                  <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center gap-1.5 text-[11px] text-red-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{msg.actionExecuted.details}</span>
                  </div>
                )}
              </div>

              <span className="text-[10px] font-mono-code text-zinc-600 px-1 mt-0.5">
                {msg.timestamp}
              </span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-mono-code text-zinc-500 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>Spidey is inspecting the dossier...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 bg-[#09090b]/80 border-t border-neutral-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => handleSendMessage('Brief me on my tasks today')}
            className="px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap"
          >
            Brief me today
          </button>
          <button
            onClick={() => handleSendMessage('Check overdue tasks')}
            className="px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap"
          >
            Check overdue
          </button>
          <button
            onClick={() => handleSendMessage('Start 25 minute focus timer')}
            className="px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap"
          >
            Start 25m Timer
          </button>
          <button
            onClick={() => handleSendMessage('Add task Workout tomorrow at 6 PM')}
            className="px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-mono-code text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap"
          >
            + Add Workout
          </button>
        </div>

        {/* Chat Input Bar */}
        <div className="p-3.5 bg-[#09090b] border-t border-neutral-800 flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Command Spidey (e.g. 'add task Study at 3pm')..."
            className="flex-1 px-3 py-2 bg-[#121217] border border-neutral-800/90 rounded-lg text-xs font-mono-code text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-neutral-700"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="p-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-800 text-white rounded-lg transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
