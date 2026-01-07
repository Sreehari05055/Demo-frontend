import { useRef, useState } from 'react'
import { marked } from 'marked' 
import './App.css'
const API_URL = 'http://localhost:8000/api/chat' // Update with your backend API URL
 
interface Message {
  sender: 'user' | 'bot'
  text: string
  raw?: string // Store raw markdown for bot
}
const MarkdownRenderer = ({ markdown }: { markdown: string }) => {
  const html = marked.parse(markdown, {
    breaks: true,
    gfm: true
  })
  return (
    <div
      className="prose blog-body max-w-none"
      style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
 
const styles = {
  container: {
    //width:'300%',
    maxWidth: 700,
    minWidth: 700,
    margin: '40px auto',
    border: '1px solid #ddd',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    height: 600,
    fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  },
  chatWindow: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 16,
    background: '#fafbfc'
  },
  messageRow: (isUser: boolean) => ({
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    marginBottom: 10
  }),
  messageBubble: (isUser: boolean) => ({
    background: isUser ? '#1976d2' : 'rgb(246 246 246)',
    color: isUser ? '#fff' : '#222',
    borderRadius: 16,
    padding: '10px 16px',
    maxWidth: '80%',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    fontFamily: isUser
      ? 'inherit'
      : 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 15
  }),
  inputContainer: {
    display: 'flex',
    borderTop: '1px solid #eee',
    padding: 12,
    background: '#fff'
  },
  input: {
    flex: '1 1 620px',
    minWidth: 520,
    border: 'none',
    outline: 'none',
    color: "#111",
    fontSize: 16,
    padding: 8,
    background: 'transparent',
    fontFamily: 'inherit'
  },
  sendButton: (disabled: boolean) => ({
    marginLeft: 8,
    padding: '8px 18px',
    background: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: 16
  }),
  loadingSpinner: {
    display: 'inline-block',
    width: 24,
    height: 24,
    verticalAlign: 'middle'
  }
  ,
  attachButton: {
    marginRight: 8,
    padding: '6px 10px',
    background: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 18,
    lineHeight: '18px'
  },
  fileName: {
    marginRight: 8,
    alignSelf: 'center' as const,
    fontSize: 13,
    color: '#333',
    maxWidth: 200,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => {
    const key = 'session_id'
    try {
      const existing = sessionStorage.getItem(key)
      if (existing) return existing
    } catch (e) {
      // ignore sessionStorage errors (e.g., SSR or blocked storage)
    }
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2,9)}`
    try {
      sessionStorage.setItem(key, id)
    } catch (e) {
      // ignore
    }
    return id
  })
  const abortControllerRef = useRef<AbortController | null>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
 
  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatWindowRef.current) {
        chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight
      }
    }, 100)
  }
 
  const handleSend = async () => {
    // allow send when there's text OR one/more selected files
    if (!input.trim() && !(selectedFile && selectedFile.length > 0)) return
    setMessages((prev) => [...prev, { sender: 'user', text: input }])
    setLoading(true)
    setMessages((prev) => [...prev, { sender: 'bot', text: '', raw: '' }])
    scrollToBottom()
    abortControllerRef.current = new AbortController()
    try {
      const headers: Record<string, string> = { 'X-Session-ID': sessionId }
      const opts: RequestInit = { method: 'POST', signal: abortControllerRef.current.signal }
      if (selectedFile && selectedFile.length > 0) {
        const fd = new FormData()
        fd.append('question', input)

        for (const f of selectedFile) {
          fd.append('file', f)
        }
        opts.body = fd
        opts.headers = headers
      } else {
        headers['Content-Type'] = 'application/json'
        opts.headers = headers
        opts.body = JSON.stringify({ question: input})
      }
      const response = await fetch(API_URL, opts)
      if (!response.body) throw new Error('No response body')
      const reader = response.body.getReader()
      let botRaw = ''
      let done = false
      let buffer = ''
      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = new TextDecoder().decode(value)
          buffer += chunk
          let match
          const regex = /data:\s*\{(?:'content'|"content")\s*:\s*(['"])([\s\S]*?)\1\s*\}/g
          let lastIndex = 0
          while ((match = regex.exec(buffer)) !== null) {
            const processedContent = match[2]
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\r/g, '\r')
              .replace(/\\\\/g, '\\')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
            botRaw += processedContent
            lastIndex = regex.lastIndex
            setMessages((prev) => {
              const updated = [...prev]
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].sender === 'bot') {
                  updated[i] = { ...updated[i], text: botRaw, raw: botRaw }
                  break
                }
              }
              return updated
            })
            scrollToBottom()
          }
          if (lastIndex > 0) {
            buffer = buffer.slice(lastIndex)
          }
        }
      }
    } catch (err: any) {
      console.log(err)
      setMessages((prev) => {
        const updated = [...prev]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].sender === 'bot') {
            updated[i] = {
              ...updated[i],
              text: 'Sorry, something went wrong.',
              raw: 'Sorry, something went wrong.'
            }
            break
          }
        }
        return updated
      })
    } finally {
      setLoading(false)
      setInput('')
      setSelectedFile(null)
      abortControllerRef.current = null
      scrollToBottom()
    }
  }
 
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleSend()
    }
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files ? Array.from(e.target.files) : []
    // allow only csv, xlsx, xls by extension (case-insensitive)
    const allowedExt = /\.(csv|xlsx|xls)$/i
    const accepted = rawFiles.filter((f) => allowedExt.test(f.name))
    const rejectedCount = rawFiles.length - accepted.length
    if (rejectedCount > 0) {
      // brief immediate feedback
      try { window.alert(`${rejectedCount} file(s) ignored — only CSV/XLS/XLSX allowed.`) } catch (e) { /* ignore */ }
    }
    setSelectedFile((prev) => {
      const combined = [...(prev || []), ...accepted]
      // dedupe by name+size
      const seen = new Set<string>()
      const unique: File[] = []
      for (const f of combined) {
        const key = `${f.name}-${f.size}`
        if (!seen.has(key)) {
          seen.add(key)
          unique.push(f)
        }
      }
      // limit to maximum 3 files
      const limited = unique.slice(0, 3)
      return limited.length ? limited : null
    })
  }

  const removeFile = (index: number) => {
    setSelectedFile((prev) => {
      if (!prev) return null
      const copy = [...prev]
      copy.splice(index, 1)
      return copy.length ? copy : null
    })
  }
 
  return (
    <>
<div style={styles.container}>
      <div ref={chatWindowRef} style={styles.chatWindow}>
        {messages.map((msg, idx) => (
          <div key={idx} style={styles.messageRow(msg.sender === 'user')}>
            <div style={styles.messageBubble(msg.sender === 'user')}>
              {msg.sender === 'bot' ? (
                <MarkdownRenderer markdown={msg.raw ?? msg.text} />
              ) : (
                msg.text
              )}
              {msg.sender === 'bot' && loading && idx === messages.length - 1 && (
                <span style={styles.loadingSpinner} aria-label="Loading">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 50 50"
                    style={{ display: 'block' }}
                  >
                    <circle
                      cx="25"
                      cy="25"
                      r="20"
                      fill="none"
                      stroke="#1976d2"
                      strokeWidth="5"
                      strokeDasharray="31.4 31.4"
                      strokeLinecap="round"
                      transform="rotate(-90 25 25)"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 25 25"
                        to="360 25 25"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </svg>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Selected files shown above the input row */}
      {selectedFile && (
        <div style={{ padding: '0 12px', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedFile.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  border: '1px solid #dfe6ee',
                  maxWidth: 360
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#111' }} title={f.name}>
                  {f.name}
                </div>
                <button
                  onClick={() => removeFile(i)}
                  style={{
                    marginLeft: 8,
                    background: '#e53e3e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    width: 22,
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  aria-label={`Remove ${f.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={styles.inputContainer}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={handleAttachClick}
            title="Attach file"
            style={styles.attachButton}
            disabled={loading}
          >
            +
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={loading}
            placeholder="Type your message..."
            style={styles.input}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !(selectedFile && selectedFile.length > 0))}
            style={styles.sendButton(loading || (!input.trim() && !(selectedFile && selectedFile.length > 0)))}
          >
            Send
          </button>
        </div>
      </div>
      <style>
        {`
          .blinking-cursor {
            font-weight: 100;
            font-size: 18px;
            color: #222;
            animation: blink 1s step-end infinite;
          }
          @keyframes blink {
            from, to { opacity: 1 }
            50% { opacity: 0 }
          }
          .prose pre, .prose code {
            background: #222 !important;
            color: #fff !important;
            border-radius: 6px;
            padding: 0.5em 0.8em;
            font-size: 14px;
            font-family: Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            overflow-x: auto;
          }
          .prose pre {
            margin: 0.5em 0;
          }
          .prose code {
            background: #222 !important;
            color: #fff !important;
            border-radius: 4px;
            padding: 2px 6px;
          }
          .prose table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
          }
          .prose th, .prose td {
            border: 1px solid #ccc;
            padding: 6px 10px;
            text-align: left;
          }
          .prose blockquote {
            border-left: 4px solid #1976d2;
            margin: 0.5em 0;
            padding: 0.5em 1em;
            color: #555;
            background: #f5f7fa;
          }
          .prose ul, .prose ol {
            margin: 0.5em 0 0.5em 1.5em;
          }
          .prose h1, .prose h2, .prose h3, .prose h4 {
            margin: 0.7em 0 0.3em 0;
            font-weight: 700;
          }
        `}
      </style>
    </div>    </>
  )
}

export default App
