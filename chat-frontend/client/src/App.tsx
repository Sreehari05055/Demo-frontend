import { QueryClientProvider } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { marked } from "marked";
import { useMemo, useRef, useState } from "react";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { PDFViewer } from "./components/PDFViewer";

const CHAT_API_URL = "http://localhost:8000/api/chat";
const INGEST_API_URL = "http://localhost:8000/api/ingest/";

type Source = {
  content: string;
  id: string;
  title: string;
  doc_id: string;
  page_label: string;
  bboxes: any[];
  score: number;
};

type Message = {
  sender: "user" | "bot";
  text: string;
  raw?: string;
  sources?: Source[];
};

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    return marked.parse(markdown, {
      breaks: true,
      gfm: true,
    });
  }, [markdown]);

  return (
    <div
      className="rag-prose"
      dangerouslySetInnerHTML={{ __html: html }}
      data-testid="text-bot-message-markdown"
    />
  );
}

function AppShell() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [docs, setDocs] = useState<File[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsMessage, setDocsMessage] = useState<string | null>(null);

  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showPDF, setShowPDF] = useState(false);

  const [sessionId] = useState(() => {
    const key = "session_id";
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
    } catch {
      // ignore
    }
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      sessionStorage.setItem(key, id);
    } catch {
      // ignore
    }
    return id;
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const docsFileInputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (!chatWindowRef.current) return;
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }, 80);
  };

  const handleSend = async () => {
    if (!input.trim() && !(selectedFile && selectedFile.length > 0)) return;

    setMessages((prev) => [...prev, { sender: "user", text: input }]);
    setLoading(true);
    setMessages((prev) => [...prev, { sender: "bot", text: "", raw: "" }]);
    scrollToBottom();

    abortControllerRef.current = new AbortController();

    try {
      const headers: Record<string, string> = { "X-Session-ID": sessionId };
      const opts: RequestInit = {
        method: "POST",
        signal: abortControllerRef.current.signal,
      };

      if (selectedFile && selectedFile.length > 0) {
        const fd = new FormData();
        fd.append("question", input);
        for (const f of selectedFile) fd.append("file", f);
        opts.body = fd;
        opts.headers = headers;
      } else {
        headers["Content-Type"] = "application/json";
        opts.headers = headers;
        opts.body = JSON.stringify({ question: input });
      }

      const response = await fetch(CHAT_API_URL, opts);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      let botRaw = "";
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (!value) continue;

        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          const jsonStr = line.replace("data: ", "").trim();
          if (jsonStr === "[DONE]") {
            done = true;
            break;
          }

          try {
            const data = JSON.parse(jsonStr);

            if (data.sources) {
              setMessages((prev) => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].sender === "bot") {
                    updated[i] = { ...updated[i], sources: data.sources };
                    break;
                  }
                }
                return updated;
              });

              if (data.sources.length > 0) {
                setActiveSource(data.sources[0]);
                setShowRightPanel(true);
              }
              continue;
            }

            if (data.content === undefined || data.content === null) continue;

            let newContent = "";
            if (Array.isArray(data.content)) {
              if (data.content.length > 0 && data.content[0]?.text) {
                newContent = data.content[0].text;
              }
            } else {
              newContent = String(data.content);
            }

            if (!newContent) continue;

            botRaw += newContent;
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].sender === "bot") {
                  updated[i] = { ...updated[i], text: botRaw, raw: botRaw };
                  break;
                }
              }
              return updated;
            });
            scrollToBottom();
          } catch {
            // ignore stream parse errors
          }
        }
      }

      // If the model sent an automatic assistant greeting (common in some models),
      // we used to remove it, but it was too aggressive. 
      // Keeping all responses for now to ensure nothing disappears.
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].sender === "bot") {
            updated[i] = {
              ...updated[i],
              text: "Sorry, something went wrong.",
              raw: "Sorry, something went wrong.",
            };
            break;
          }
        }
        return updated;
      });
    } finally {
      setLoading(false);
      setInput("");
      setSelectedFile(null);
      abortControllerRef.current = null;
      scrollToBottom();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) handleSend();
  };

  const handleAttachClick = () => {
    chatFileInputRef.current?.click();
  };

  const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files ? Array.from(e.target.files) : [];
    const allowedExt = /\.(csv|xlsx|xls)$/i;
    const accepted = rawFiles.filter((f) => allowedExt.test(f.name));
    const rejectedCount = rawFiles.length - accepted.length;
    if (rejectedCount > 0) {
      try {
        window.alert(`${rejectedCount} file(s) ignored — only CSV/XLS/XLSX allowed.`);
      } catch {
        // ignore
      }
    }

    setSelectedFile((prev) => {
      const combined = [...(prev || []), ...accepted];
      const seen = new Set<string>();
      const unique: File[] = [];
      for (const f of combined) {
        const key = `${f.name}-${f.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(f);
      }
      const limited = unique.slice(0, 3);
      return limited.length ? limited : null;
    });
  };

  const removeChatFile = (index: number) => {
    setSelectedFile((prev) => {
      if (!prev) return null;
      const copy = [...prev];
      copy.splice(index, 1);
      return copy.length ? copy : null;
    });
  };

  const handleDocsChoose = () => docsFileInputRef.current?.click();

  const handleDocsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files ? Array.from(e.target.files) : [];
    const allowed = /\.(pdf|docx|doc|html|txt|md|png|jpg|jpeg|tiff|bmp)$/i;
    const accepted = raw.filter((f) => allowed.test(f.name));
    const rejected = raw.length - accepted.length;
    if (rejected > 0) {
      try {
        window.alert(
          `${rejected} file(s) ignored — only PDF/DOC/DOCX/HTML/TXT/MD/PNG/JPG/JPEG/TIFF/BMP allowed.`,
        );
      } catch {
        // ignore
      }
    }
    setDocs(accepted.length ? accepted : null);
  };

  const removeDocFile = (i: number) => {
    setDocs((prev) => {
      if (!prev) return null;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy.length ? copy : null;
    });
  };

  const handleDocsUpload = async () => {
    if (!docs || docs.length === 0) return;
    setDocsLoading(true);
    setDocsMessage(null);

    try {
      const fd = new FormData();
      for (const f of docs) fd.append("file", f);

      const res = await fetch(INGEST_API_URL, { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
      const data = await res.json().catch(() => null);
      setDocsMessage(
        data && data.message ? String(data.message) : "Files uploaded successfully.",
      );
      setDocs(null);
    } catch {
      setDocsMessage("Upload failed. Check the server and try again.");
    } finally {
      setDocsLoading(false);
    }
  };

  const canSend = !loading && (!!input.trim() || !!(selectedFile && selectedFile.length));

  return (
    <div className="rag-panel h-screen w-full overflow-hidden" data-testid="page-rag-shell">
      <div className="w-full h-full">
        <div className="rag-surface h-full w-full overflow-hidden">
          <PanelGroup
            direction="horizontal"
            className="h-full"
          >
            <Panel defaultSize={20} minSize={15} className="min-w-[240px]">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div>
                    <div
                      className="text-sm font-semibold tracking-tight"
                      data-testid="text-panel-title-docs"
                    >
                      Files for RAG
                    </div>
                    <div
                      className="text-xs text-white/60"
                      data-testid="text-panel-subtitle-docs"
                    >
                      Upload source docs to ingest
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDocsChoose}
                      disabled={docsLoading}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10 transition"
                      data-testid="button-docs-choose"
                    >
                      Choose
                    </button>
                    <button
                      type="button"
                      onClick={handleDocsUpload}
                      disabled={docsLoading || !docs || docs.length === 0}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      data-testid="button-docs-upload"
                    >
                      {docsLoading ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <input
                    ref={docsFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.html,.txt,.md,.png,.jpg,.jpeg,.tiff,.bmp"
                    className="hidden"
                    onChange={handleDocsFileChange}
                    data-testid="input-docs-files"
                  />

                  <div className="rag-surface-2 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="text-xs text-white/60"
                        data-testid="text-docs-hint"
                      >
                        PDF / DOC / DOCX / HTML / TXT / MD / PNG / JPG / JPEG / TIFF / BMP
                      </div>
                      <div
                        className="text-xs text-white/60"
                        data-testid="text-docs-count"
                      >
                        {(docs?.length || 0) > 0 ? `${docs?.length} selected` : "0 selected"}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2" data-testid="list-docs-files">
                      {docs && docs.length > 0 ? (
                        docs.map((f, i) => (
                          <div
                            key={`${f.name}-${f.size}`}
                            className="group flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
                            data-testid={`pill-doc-${i}`}
                            title={f.name}
                          >
                            <div
                              className="truncate text-sm text-white/90"
                              data-testid={`text-doc-name-${i}`}
                            >
                              {f.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDocFile(i)}
                              className="h-6 w-6 rounded-full bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition flex items-center justify-center"
                              data-testid={`button-doc-remove-${i}`}
                              aria-label={`Remove ${f.name}`}
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-white/55" data-testid="text-docs-empty">
                          No files selected.
                        </div>
                      )}
                    </div>

                    {docsMessage && (
                      <div
                        className={`mt-3 text-sm ${
                          docsMessage.toLowerCase().includes("failed")
                            ? "text-red-300"
                            : "text-primary"
                        }`}
                        data-testid="status-docs-upload"
                      >
                        {docsMessage}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-xs text-white/50" data-testid="text-docs-footer">
                    Tip: keep your most important docs small and well-structured for faster ingestion.
                  </div>
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-px bg-white/10 hover:bg-white/20 transition" />

            <Panel defaultSize={40} minSize={35} className="min-w-[420px]">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div>
                    <div
                      className="text-sm font-semibold tracking-tight"
                      data-testid="text-panel-title-chat"
                    >
                      Chat
                    </div>
                    <div
                      className="text-xs text-white/60"
                      data-testid="text-panel-subtitle-chat"
                    >
                      Ask questions over your knowledge base
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRightPanel((prev) => !prev)}
                      className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${
                        showRightPanel 
                          ? "bg-primary text-primary-foreground" 
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                      title={showRightPanel ? "Hide Intelligence" : "Show Intelligence"}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div
                  ref={chatWindowRef}
                  className="flex-1 p-4 overflow-y-auto rag-scrollbar"
                  data-testid="panel-chat-messages"
                >
                  {messages.length === 0 ? (
                    <div
                      className="h-full flex items-center justify-center"
                      data-testid="state-chat-empty"
                    >
                      <div className="max-w-md text-center">
                        <div
                          className="text-lg font-semibold tracking-tight"
                          data-testid="text-empty-title"
                        >
                          Start a conversation
                        </div>
                        <div
                          className="mt-2 text-sm text-white/60"
                          data-testid="text-empty-subtitle"
                        >
                          Upload docs on the left, then ask your agent anything. Responses stream in real-time.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="list-chat-messages">
                      {(() => {
                        let globalSourceCounter = 0;
                        return messages.map((msg, idx) => {
                          const isUser = msg.sender === "user";
                          const messageSourceIndices = (msg.sources || []).map(() => ++globalSourceCounter);
                          
                          return (
                            <div
                              key={idx}
                              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                              data-testid={`row-message-${idx}`}
                            >
                              <div
                                className={`max-w-[88%] ${
                                  isUser
                                    ? "bg-white/10 border border-white/15 rounded-2xl px-4 py-3"
                                    : "bg-transparent border-none px-0 py-2"
                                }`}
                                data-testid={`bubble-message-${idx}`}
                              >
                                {msg.sender === "bot" ? (
                                    <div className="flex items-start gap-4">
                                      <div
                                        className="flex-1 min-w-0"
                                        data-testid={`content-message-${idx}`}
                                      >
                                        <div className="w-full break-words">
                                          <MarkdownRenderer markdown={msg.raw ?? msg.text} />
                                        </div>

                                        {msg.sources && msg.sources.length > 0 && (
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            {msg.sources.map((src, sIdx) => (
                                              <button
                                                key={sIdx}
                                                onClick={() => {
                                                  setActiveSource(src);
                                                  setShowRightPanel(true);
                                                  setShowPDF(true);
                                                }}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                  activeSource?.id === src.id
                                                    ? "bg-primary text-primary-foreground border border-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
                                                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 border border-white/10"
                                                }`}
                                              >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                <span>Source {messageSourceIndices[sIdx]}</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}

                                        {loading && idx === messages.length - 1 && (
                                          <div className="mt-2 flex items-center">
                                            <div className="gooey-container" aria-label="Bot is thinking">
                                              <div className="gooey-dot" />
                                              <div className="gooey-dot" />
                                              <div className="gooey-dot" />
                                              <div className="gooey-dot" />
                                              <div className="gooey-dot" />
                                            </div>
                                            <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true" focusable="false">
                                              <defs>
                                                <filter id="goo" x="-50%" y="-50%" width="200%" height="200%">
                                                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
                                                </filter>
                                              </defs>
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                ) : (
                                  <div
                                    className="text-[15px] leading-6 text-white/95"
                                    data-testid={`text-user-message-${idx}`}
                                  >
                                    {msg.text}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {selectedFile && selectedFile.length > 0 && (
                  <div className="px-4 pb-0" data-testid="panel-chat-files">
                    <div className="flex flex-wrap gap-2">
                      {selectedFile.map((f, i) => (
                        <div
                          key={`${f.name}-${f.size}`}
                          className="group flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
                          title={f.name}
                          data-testid={`pill-chat-file-${i}`}
                        >
                          <div
                            className="truncate text-sm text-white/90"
                            data-testid={`text-chat-file-name-${i}`}
                          >
                            {f.name}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeChatFile(i)}
                            className="h-6 w-6 rounded-full bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition flex items-center justify-center"
                            data-testid={`button-chat-file-remove-${i}`}
                            aria-label={`Remove ${f.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 pt-3">
                  <div className="rag-input rounded-2xl p-2 flex items-end gap-2">
                    <input
                      ref={chatFileInputRef}
                      type="file"
                      multiple
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleChatFileChange}
                      data-testid="input-chat-files"
                    />

                    <button
                      type="button"
                      onClick={handleAttachClick}
                      disabled={loading}
                      className="h-11 w-11 shrink-0 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                      data-testid="button-chat-attach"
                      title="Attach CSV/XLS/XLSX"
                      aria-label="Attach file"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="opacity-95"
                        data-testid="icon-attach"
                      >
                        <path
                          d="M21.44 11.05l-8.49 8.49a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.19 9.19a2 2 0 01-2.83-2.83l8.84-8.84"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      disabled={loading}
                      placeholder="Ask your agent…"
                      className="h-11 w-full bg-transparent px-1 text-[15px] text-white placeholder:text-white/45 outline-none"
                      data-testid="input-chat-message"
                    />

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!canSend}
                      className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                      data-testid="button-chat-submit"
                      aria-label="Send message"
                      title="Send"
                    >
                      {loading ? (
                        <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" data-testid="icon-send-loading" />
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="opacity-95"
                          data-testid="icon-send"
                        >
                          <path
                            d="M22 2L11 13"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M22 2L15 22L11 13L2 9L22 2Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-white/45" data-testid="text-chat-helper">
                    Press Enter to send. Attach supports CSV/XLS/XLSX.
                  </div>
                </div>
              </div>
            </Panel>

            {showRightPanel && (
              <>
                <PanelResizeHandle className="w-px bg-white/10 hover:bg-white/20 transition" />
                <Panel defaultSize={45} minSize={30} className="min-w-[400px]">
                  <div className="flex h-full flex-col bg-background border-l border-white/10">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-sm font-semibold tracking-tight">Source Intelligence</span>
                      </div>
                      <button
                        onClick={() => setShowRightPanel(false)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>

                    <div className="flex-1 overflow-hidden relative flex flex-col">
                      {!showPDF && messages.length > 0 && messages.some(m => m.sources && m.sources.length > 0) ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 rag-scrollbar bg-black/5">
                          <div className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-2 px-2">Document Sources</div>
                          {(() => {
                            let sourceCounter = 0;
                            return messages.flatMap((m) => 
                              (m.sources || []).map((src) => {
                                sourceCounter++;
                                const currentId = sourceCounter;
                                return (
                                  <button
                                    key={`source-${currentId}`}
                                    onClick={() => {
                                      setActiveSource(src);
                                      setShowPDF(true);
                                    }}
                                    className="w-full text-left p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 transition-all group relative overflow-hidden"
                                  >
                                    <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                    </div>
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                                        {currentId}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-white/90 truncate">{src.doc_id}</div>
                                        <div className="text-[10px] text-white/50 uppercase">Page {src.page_label}</div>
                                      </div>
                                    </div>
                                    <div className="text-xs text-white/60 line-clamp-3 leading-relaxed">
                                      {src.content}
                                    </div>
                                  </button>
                                );
                              })
                            );
                          })()}
                        </div>
                      ) : activeSource && showPDF ? (
                        <div className="flex-1 flex flex-col h-full bg-background relative">
                          <button 
                            onClick={() => setShowPDF(false)}
                            className="absolute top-4 left-4 z-10 h-8 px-3 rounded-lg bg-black/60 text-white/80 border border-white/10 hover:bg-black/80 hover:text-white transition-all flex items-center gap-2 text-xs font-medium backdrop-blur-md"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            Back to sources
                          </button>
                          <PDFViewer 
                            docId={activeSource.doc_id}
                            pageNumber={activeSource.page_label}
                            bboxes={activeSource.bboxes}
                            content={activeSource.content}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white/40">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-20">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4"/>
                            <path d="M12 8h.01"/>
                          </svg>
                          <div className="text-sm font-medium">No source selected</div>
                          <div className="text-xs mt-1">Select a source badge in the chat to see preview</div>
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
