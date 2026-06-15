'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Participant {
  id: string;
  name?: string;
  email?: string;
}

interface Conversation {
  id: string;
  participants: Participant[];
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

function getParticipantLabel(participants: Participant[], currentUserId: string): string {
  const others = participants.filter((p) => p.id !== currentUserId);
  if (others.length === 0) return 'You';
  return others.map((p) => p.name ?? p.email ?? p.id).join(', ');
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convoLoading, setConvoLoading] = useState(true);
  const [convoError, setConvoError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const currentUserId =
    typeof window !== 'undefined' ? (localStorage.getItem('user_id') ?? '') : '';

  const fetchConversations = useCallback(async () => {
    setConvoLoading(true);
    setConvoError(null);
    try {
      const data = await apiClient<{ conversations: Conversation[] }>(
        '/v1/messages/conversations'
      );
      setConversations(data.conversations ?? []);
    } catch (err) {
      setConvoError('Failed to load conversations.');
      console.error(err);
    } finally {
      setConvoLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    setThreadLoading(true);
    setThreadError(null);
    try {
      const data = await apiClient<{ messages: Message[] }>(
        `/v1/messages/conversations/${convoId}/messages`
      );
      setMessages(data.messages ?? []);
    } catch (err) {
      setThreadError('Failed to load messages.');
      console.error(err);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!draft.trim() || !selectedId) return;
    setSending(true);
    try {
      await apiClient('/v1/messages', {
        method: 'POST',
        body: { conversationId: selectedId, content: draft.trim() },
      });
      setDraft('');
      await fetchMessages(selectedId);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const selectedConvo = conversations.find((c) => c.id === selectedId);

  return (
    <div className="flex h-full flex-col space-y-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-dark">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">In-app messaging with users.</p>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white" style={{ minHeight: '60vh' }}>
        {/* Conversation list */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conversations</p>
          </div>

          {convoLoading && (
            <div className="flex flex-1 items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {convoError && (
            <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {convoError}
            </div>
          )}

          {!convoLoading && !convoError && conversations.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">No conversations yet.</p>
            </div>
          )}

          {!convoLoading && !convoError && conversations.length > 0 && (
            <ul className="flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      selectedId === c.id ? 'bg-primary/5 border-r-2 border-primary' : ''
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-slate-700">
                      {getParticipantLabel(c.participants, currentUserId)}
                    </p>
                    {c.lastMessage && (
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {c.lastMessage.content}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-300">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Message thread */}
        <div className="flex flex-1 flex-col">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-400">Select a conversation to view messages.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-sm font-medium text-slate-700">
                  {selectedConvo
                    ? getParticipantLabel(selectedConvo.participants, currentUserId)
                    : '...'}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4">
                {threadLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}

                {threadError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {threadError}
                  </div>
                )}

                {!threadLoading && !threadError && messages.length === 0 && (
                  <p className="text-center text-sm text-slate-400">No messages yet.</p>
                )}

                {!threadLoading &&
                  messages.map((msg) => {
                    const isOwn = msg.senderId === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs rounded-xl px-4 py-2 text-sm lg:max-w-md ${
                            isOwn
                              ? 'bg-primary text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p className={`mt-1 text-right text-xs ${isOwn ? 'text-white/60' : 'text-slate-400'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-slate-100 p-4">
                <div className="flex items-end gap-3">
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send)"
                    className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center justify-center rounded-lg bg-primary p-2.5 text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
