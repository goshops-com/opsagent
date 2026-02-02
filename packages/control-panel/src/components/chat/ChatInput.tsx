"use client";

import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  sessionId: string;
  serverId: string;
}

export default function ChatInput({ sessionId, serverId }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: message.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send message");
      }

      setMessage("");
      // Refresh the page to show new messages
      // In a real implementation, we'd use WebSocket for real-time updates
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  };

  return (
    <div>
      {error && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: "8px",
            background: "#ef444420",
            border: "1px solid #ef444440",
            borderRadius: "6px",
            color: "#ef4444",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            flex: 1,
            position: "relative",
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask OpsAgent about your database... (Press Enter to send, Shift+Enter for new line)"
            disabled={isLoading}
            rows={1}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "14px",
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
              minHeight: "48px",
              maxHeight: "150px",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!message.trim() || isLoading}
          style={{
            padding: "12px 20px",
            background: message.trim() && !isLoading ? "#3b82f6" : "#2a2a2a",
            color: message.trim() && !isLoading ? "#fff" : "#6b7280",
            border: "none",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: message.trim() && !isLoading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s",
            minWidth: "100px",
            justifyContent: "center",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Sending...
            </>
          ) : (
            <>
              <Send size={16} />
              Send
            </>
          )}
        </button>
      </form>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          marginTop: "8px",
          fontSize: "11px",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        OpsAgent can execute database operations. High-risk operations require approval.
      </div>
    </div>
  );
}
