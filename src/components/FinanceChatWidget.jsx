import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chatFinance } from "../services/cloudFunctions";

const GREETING =
  "Hello! I'm your ExpensePilot AI. I can help with budgets, spending, cash flow, and savings.\n\nWhat would you like to review?";

function MessageRow({ role, text }) {
  const user = role === "user";

  const safeText = String(text || "").trim();

  const bulletItems = useMemo(() => {
    if (user) return null;
    if (!safeText) return null;

    // Prefer explicit "- " bullets if present.
    const lines = safeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const dashBullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter(Boolean);
    if (dashBullets.length) return dashBullets.slice(0, 8);

    // Convert "1. foo 2. bar 3. baz" into bullets.
    if (/\b1\.\s+/.test(safeText)) {
      const parts = safeText
        .split(/\b\d+\.\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) return parts.slice(0, 8);
    }

    // Convert semicolon-separated or comma-separated short lists into bullets.
    const semiParts = safeText.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
    if (semiParts.length >= 2) return semiParts.slice(0, 8);

    const commaParts = safeText.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    if (commaParts.length >= 3 && commaParts.every((p) => p.length <= 80)) return commaParts.slice(0, 8);

    return null;
  }, [safeText, user]);

  return (
    <div className={`finance-chat-row${user ? " finance-chat-row--user" : ""}`}>
      {user ? null : (
        <div className="finance-chat-avatar finance-chat-avatar--ai" aria-hidden="true">
          <span className="material-symbols-outlined">robot_2</span>
        </div>
      )}

      <div className={`finance-chat-bubble${user ? " finance-chat-bubble--user" : ""}`}>
        {bulletItems ? (
          <ul className="finance-chat-bulletlist" aria-label="AI bullet answer">
            {bulletItems.map((item, idx) => (
              <li key={`${idx}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>{safeText}</p>
        )}
      </div>

      {user ? (
        <div className="finance-chat-avatar finance-chat-avatar--user" aria-hidden="true">
          <span className="material-symbols-outlined">person</span>
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceChatWidget({ openNonce = 0, transactions = [] }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState(() => [{ id: "greeting", role: "assistant", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (openNonce > 0) {
      setClosing(false);
      setOpen(true);
    }
  }, [openNonce]);

  useEffect(() => {
    if (!(open || closing)) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, closing]);

  useEffect(() => {
    if (!open) return;
    const el = logRef.current;
    if (!el) return;
    // Keep latest messages in view.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [open, messages, sending]);

  const closeWithAnimation = () => {
    if (!open || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 170);
  };

  const canSend = useMemo(() => {
    return !sending && input.trim().length > 0;
  }, [sending, input]);

  const suggestionScope = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    const monthKeys = list
      .map((t) => String(t?.date || "").slice(0, 7))
      .filter((k) => /^\d{4}-\d{2}$/.test(k));
    const unique = [...new Set(monthKeys)].sort();
    const mostRecent = unique.length ? unique[unique.length - 1] : "";

    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const chosen = mostRecent || nowKey;
    const [yy, mm] = chosen.split("-").map((x) => Number(x));
    const monthLabel =
      yy && mm ? new Date(yy, mm - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "this month";

    const hasTwoPlusMonths = unique.length >= 2;
    const prev = hasTwoPlusMonths ? unique[unique.length - 2] : "";
    const prevLabel =
      prev && /^\d{4}-\d{2}$/.test(prev)
        ? new Date(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })
        : "";

    return { monthKey: chosen, monthLabel, hasTwoPlusMonths, prevKey: prev, prevLabel };
  }, [transactions]);

  const submit = async () => {
    if (!canSend) return;
    const prompt = input.trim().slice(0, 500);
    const userMessage = { id: `u-${Date.now()}`, role: "user", text: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    try {
      const data = await chatFinance(prompt);
      const answer =
        String(data?.answer || "").trim() ||
        "I couldn't generate a reply. Check your connection and try again.";
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: e?.message || "I could not process that right now. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const fullscreen =
    open || closing
      ? createPortal(
          <div className="finance-chat-fullscreen-layer" role="presentation">
            <div className="finance-chat-fullscreen-backdrop" aria-hidden="true" />
            <section
              className={`finance-chat-fullscreen${closing ? " is-closing" : ""}`}
              aria-label="Finance chat assistant"
            >
              <header className="finance-chat-head">
                <div className="finance-chat-head-left">
                  <div className="finance-chat-head-icon" aria-hidden="true">
                    <span className="material-symbols-outlined">robot_2</span>
                  </div>
                  <div className="finance-chat-head-text">
                    <strong className="finance-chat-title">ExpensePilot AI</strong>
                    <span className="finance-chat-status">
                      <span className="finance-chat-status-dot" aria-hidden="true" />
                      Ready to analyze your spending
                    </span>
                  </div>
                </div>
                <div className="finance-chat-head-actions">
                  <button
                    type="button"
                    className="finance-chat-icon-btn"
                    onClick={closeWithAnimation}
                    aria-label="Close chat"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              </header>

              <div ref={logRef} className="finance-chat-log" role="log" aria-live="polite">
                {messages.map((m) => (
                  <MessageRow key={m.id} role={m.role} text={m.text} />
                ))}
                {sending ? (
                  <div className="finance-chat-row finance-chat-row--typing">
                    <div className="finance-chat-avatar finance-chat-avatar--ai" aria-hidden="true">
                      <span className="material-symbols-outlined">robot_2</span>
                    </div>
                    <div className="finance-chat-bubble finance-chat-bubble--typing" aria-label="AI is typing">
                      <span className="finance-chat-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="finance-chat-suggestions" aria-label="Quick actions">
                {[
                  {
                    icon: "description",
                    label: `Show ${suggestionScope.monthLabel} summary`,
                    prompt: `Show a summary for ${suggestionScope.monthLabel}.`,
                  },
                  {
                    icon: "trending_up",
                    label: `Top 3 expenses (${suggestionScope.monthLabel})`,
                    prompt: `Show my top 3 expenses for ${suggestionScope.monthLabel}.`,
                  },
                  { icon: "flag", label: "Savings goals", prompt: "How are my savings goals tracking?" },
                  ...(suggestionScope.hasTwoPlusMonths
                    ? [
                        {
                          icon: "compare_arrows",
                          label: `${suggestionScope.prevLabel} vs ${suggestionScope.monthLabel}`,
                          prompt: `Compare my spending in ${suggestionScope.prevLabel} vs ${suggestionScope.monthLabel}.`,
                        },
                      ]
                    : []),
                ].map((x) => (
                  <button
                    key={x.label}
                    type="button"
                    className="finance-chat-chip"
                    onClick={() => {
                      setInput(x.prompt);
                      requestAnimationFrame(() => void submit());
                    }}
                    disabled={sending}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {x.icon}
                    </span>
                    <span>{x.label}</span>
                  </button>
                ))}
              </div>

              <div className="finance-chat-inputbar">
                <input
                  className="finance-chat-inputline"
                  placeholder="Ask ExpensePilot about your finances..."
                  value={input}
                  maxLength={500}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
                <button type="button" className="finance-chat-sendbtn" onClick={() => void submit()} disabled={!canSend}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    send
                  </span>
                </button>
              </div>
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {fullscreen}
      {!(open || closing) ? (
        <div className="finance-chat-root">
          <button
            type="button"
            className="finance-chat-launcher"
            onClick={() => {
              setClosing(false);
              setOpen(true);
            }}
            aria-label="Open finance chat"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              robot_2
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}
