"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  serverMessageId?: string;
  feedback?: "positive" | "negative" | null;
  feedbackComment?: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface FallbackData {
  topTeams: Array<{ name: string; reason: string; priority: number }>;
  farmingPriorities: Array<{ character: string; location: string; reason: string }>;
  eventRecommendations: Array<{ event: string; recommendation: string }>;
  generatedAt: string;
}

// Fallback suggestions used before API response arrives
const DEFAULT_SUGGESTIONS = [
  "What team should I build next?",
  "Who should I farm for DD7?",
  "Best Crucible defense with my roster?",
  "Is Apocalypse worth investing in?",
];

const WELCOME_MESSAGE = `Welcome to the **AI Roster Advisor**! 🤖

I can help you with personalized roster advice based on your actual roster and the latest MSF meta intelligence from top creators.

**What I can help with:**
- Team building recommendations
- Farming priorities
- Dark Dimension planning
- Crucible and Arena strategy
- Character investment decisions

Try one of the suggestions below, or ask me anything about MSF!`;

export default function AdvisorPageClient({ isPremium = false }: { isPremium?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [fallbackData, setFallbackData] = useState<FallbackData | null>(null);
  const [feedbackInputId, setFeedbackInputId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch personalized, randomized suggestions on mount
  useEffect(() => {
    fetch("/api/advisor/suggestions")
      .then((res) => res.ok ? res.json() : null)
      .then((data: { suggestions?: string[] } | null) => {
        if (data?.suggestions && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        }
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/advisor/conversations");
      if (res.ok) {
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    if (isPremium) {
      loadConversations();
    }
  }, [loadConversations, isPremium]);

  const loadConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/advisor/conversations/${convId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          conversation: {
            id: string;
            messages: Array<{ id: string; role: "user" | "assistant"; content: string; feedback?: string | null; feedbackComment?: string | null }>;
          };
        };
        setActiveConversationId(data.conversation.id);
        setMessages(
          data.conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            serverMessageId: m.role === "assistant" ? m.id : undefined,
            feedback: (m.feedback as "positive" | "negative") || undefined,
            feedbackComment: m.feedbackComment || undefined,
          }))
        );
        setSidebarOpen(false);
      }
    } catch {
      // Non-blocking
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSend = async (text?: string) => {
    const question = text || input.trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          conversationId: activeConversationId,
        }),
      });

      if (!response.ok) {
        if (response.status === 503) {
          // AI service unavailable — load fallback
          try {
            const fallbackRes = await fetch("/api/advisor/fallback");
            if (fallbackRes.ok) {
              const data = (await fallbackRes.json()) as FallbackData;
              setFallbackData(data);
            }
          } catch {
            // Non-blocking
          }
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        const errorObj = errorData as { error?: string; code?: string };
        if (errorObj.code === "DAILY_LIMIT_EXCEEDED" || errorObj.code === "TOKEN_BUDGET_EXCEEDED") {
          setRateLimited(true);
          return;
        }
        const errorMsg = errorObj.error || "Something went wrong. Please try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: errorMsg,
          },
        ]);
        return;
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const decoder = new TextDecoder();
      let accumulatedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              // Refresh conversation list after message completes
              loadConversations();
              break;
            }
            try {
              const parsed = JSON.parse(data) as { content?: string; conversationId?: string; confidence?: number; messageId?: string };
              if (parsed.conversationId && !activeConversationId) {
                setActiveConversationId(parsed.conversationId);
              }
              if (parsed.messageId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, serverMessageId: parsed.messageId }
                      : m
                  )
                );
              }
              if (parsed.confidence !== undefined) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, confidence: parsed.confidence }
                      : m
                  )
                );
              }
              if (parsed.content) {
                accumulatedContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: accumulatedContent }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I had trouble connecting. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (msgId: string, serverMsgId: string, rating: "positive" | "negative") => {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, feedback: rating } : m
      )
    );

    if (rating === "negative") {
      setFeedbackInputId(msgId);
      setFeedbackText("");
    } else {
      setFeedbackInputId(null);
    }

    try {
      await fetch("/api/advisor/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: serverMsgId, rating }),
      });
    } catch {
      // Non-blocking
    }
  };

  const submitFeedbackComment = async (msgId: string, serverMsgId: string) => {
    if (!feedbackText.trim()) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, feedbackComment: feedbackText.trim() } : m
      )
    );
    setFeedbackInputId(null);

    try {
      await fetch("/api/advisor/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: serverMsgId, rating: "negative", comment: feedbackText.trim() }),
      });
    } catch {
      // Non-blocking
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar overlay (mobile) — premium only */}
      {isPremium && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Conversation sidebar — premium only */}
      {isPremium && (
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-[var(--color-surface)] border-r border-[var(--color-surface-light)] transition-transform duration-200 md:relative md:translate-x-0 md:z-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          data-testid="conversation-sidebar"
        >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-surface-light)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Conversations</h3>
            <button
              onClick={startNewConversation}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
              data-testid="new-conversation-btn"
            >
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-light)]"
                }`}
                data-testid="conversation-item"
              >
                <div className="truncate font-medium">{conv.title}</div>
                <div className="text-xs opacity-60 mt-0.5">
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">
                No conversations yet
              </p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Main chat area */}
      <div className="flex h-full flex-1 flex-col min-w-0">
        {/* Chat header with sidebar toggle — premium only */}
        {isPremium && (
        <div className="flex items-center border-b border-[var(--color-surface-light)] px-4 py-2 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mr-3 rounded p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            data-testid="sidebar-toggle"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-medium text-[var(--color-foreground)]">AI Advisor</span>
        </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {/* Sparkle icon */}
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-light)] flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-2">
              AI Roster Advisor
            </h2>

            <div
              className="text-sm text-[var(--color-muted)] mb-6 max-w-sm whitespace-pre-line"
              data-testid="welcome-message"
            >
              {WELCOME_MESSAGE.replace(/\*\*/g, "")}
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2" data-testid="suggestion-chips">
              {suggestions.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSend(chip)}
                  className="rounded-full border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-foreground)] transition-all hover:bg-[var(--color-surface-light)] hover:border-[var(--color-accent)]"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-[var(--color-accent)] text-white rounded-br-md"
                  : "bg-[var(--color-surface-light)] text-[var(--color-foreground)] rounded-bl-md"
              }`}
            >
              {/* Confidence badge for assistant messages */}
              {msg.role === "assistant" && msg.confidence !== undefined && (
                <span
                  className={`absolute -top-2 -right-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    msg.confidence >= 70
                      ? "bg-green-500/20 text-green-400"
                      : msg.confidence >= 40
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                  }`}
                  data-testid="confidence-badge"
                >
                  {msg.confidence >= 70 ? "High" : msg.confidence >= 40 ? "Medium" : "Low"}
                </span>
              )}
              {msg.role === "assistant" ? (
                <>
                  <div
                    className="prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: formatMarkdown(msg.content),
                    }}
                  />
                  {msg.confidence !== undefined && msg.confidence < 40 && (
                    <p className="text-xs text-red-400 mt-2 italic" data-testid="low-confidence-message">
                      I don&apos;t have enough data to answer this confidently. I&apos;ve logged this question — check back in a day or two.
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--color-muted)] mt-2" data-testid="freshness-indicator">
                    Meta data last refreshed: recently
                  </p>
                  {/* Feedback buttons */}
                  {msg.serverMessageId && (
                    <div className="mt-2 flex items-center gap-2" data-testid="feedback-buttons">
                      <button
                        onClick={() => handleFeedback(msg.id, msg.serverMessageId!, "positive")}
                        disabled={msg.feedback === "positive"}
                        className={`rounded p-1.5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                          msg.feedback === "positive"
                            ? "bg-green-500/20 text-green-400"
                            : "text-[var(--color-muted)] hover:text-green-400 hover:bg-green-500/10"
                        }`}
                        data-testid="thumbs-up-btn"
                        aria-label="Helpful"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={msg.feedback === "positive" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleFeedback(msg.id, msg.serverMessageId!, "negative")}
                        disabled={msg.feedback === "negative"}
                        className={`rounded p-1.5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                          msg.feedback === "negative"
                            ? "bg-red-500/20 text-red-400"
                            : "text-[var(--color-muted)] hover:text-red-400 hover:bg-red-500/10"
                        }`}
                        data-testid="thumbs-down-btn"
                        aria-label="Not helpful"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={msg.feedback === "negative" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {/* Feedback comment input for thumbs down */}
                  {feedbackInputId === msg.id && msg.feedback === "negative" && (
                    <div className="mt-2 animate-[fadeIn_0.2s_ease-in-out]" data-testid="feedback-comment-input">
                      <input
                        type="text"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && msg.serverMessageId) {
                            e.preventDefault();
                            submitFeedbackComment(msg.id, msg.serverMessageId);
                          }
                        }}
                        placeholder="What was wrong?"
                        className="w-full rounded border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
                        data-testid="feedback-text-input"
                      />
                      <button
                        onClick={() => msg.serverMessageId && submitFeedbackComment(msg.id, msg.serverMessageId)}
                        className="mt-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80"
                        data-testid="feedback-submit-btn"
                      >
                        Submit
                      </button>
                    </div>
                  )}
                </>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-surface-light)] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex space-x-1" data-testid="typing-indicator">
                <div className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-[var(--color-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Fallback content when AI is unavailable */}
      {fallbackData && (
        <div className="mx-4 mb-3 space-y-3" data-testid="fallback-content">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-center" data-testid="fallback-banner">
            <p className="text-sm font-semibold text-yellow-400">
              Live AI Advisor is temporarily unavailable
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-1">
              Here are today&apos;s pre-generated recommendations.
            </p>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-2">Top Teams to Build</h3>
            <div className="space-y-2">
              {fallbackData.topTeams.map((team, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[var(--color-accent)] shrink-0">#{team.priority}</span>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{team.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{team.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-2">Farming Priorities</h3>
            <div className="space-y-2">
              {fallbackData.farmingPriorities.map((item, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-[var(--color-foreground)]">{item.character}</span>
                  <span className="text-[var(--color-muted)]"> — {item.location}</span>
                  <p className="text-xs text-[var(--color-muted)]">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade prompt when rate limited */}
      {rateLimited && (
        <div className="mx-4 mb-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-4 text-center" data-testid="upgrade-prompt">
          <p className="text-sm font-semibold text-[var(--color-foreground)] mb-1">
            You&apos;ve used all 3 free questions today!
          </p>
          <p className="text-xs text-[var(--color-muted)] mb-3">
            Upgrade to Premium for unlimited AI advice, roster-personalized answers, and conversation memory.
          </p>
          <a
            href="/subscribe"
            className="inline-block rounded-full bg-[var(--color-accent)] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
            data-testid="upgrade-cta"
          >
            Upgrade to Premium
          </a>
        </div>
      )}

      {/* Input bar */}
      <div className="sticky bottom-0 border-t border-[var(--color-surface-light)] bg-[var(--color-background)] px-4 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your roster..."
            className="flex-1 rounded-full border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            disabled={isLoading}
            data-testid="chat-input"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition-opacity disabled:opacity-40"
            data-testid="send-button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * Simple markdown to HTML converter for chat messages.
 */
function formatMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent)] underline">$1</a>')
    .replace(/\n/g, "<br>");
}
