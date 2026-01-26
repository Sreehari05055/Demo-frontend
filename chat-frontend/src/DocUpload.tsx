import React, { useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/api/ingest/'

const styles = {
  container: {
    maxWidth: 700,
    minWidth: 700,
    margin: '40px auto',
    border: '1px solid #ddd',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    height: 360,
    fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  },
  topBar: {
    padding: 12,
    borderBottom: '1px solid #eee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: { fontWeight: 700 },
  fileList: { padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  filePill: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    background: '#f1f5f9',
    borderRadius: 8,
    border: '1px solid #dfe6ee',
    maxWidth: 360
  },
  actions: { padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }
}

export default function DocUpload() {
  const [files, setFiles] = useState<File[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleChoose = () => fileRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files ? Array.from(e.target.files) : []
    // allow common document types
    const allowed = /\.(pdf|docx|doc|html|txt|md|png|jpg|jpeg|tiff|bmp)$/i
    const accepted = raw.filter((f) => allowed.test(f.name))
    const rejected = raw.length - accepted.length
    if (rejected > 0) {
      try { window.alert(`${rejected} file(s) ignored — only PDF/DOC/DOCX/HTML/TXT/MD/PNG/JPG/JPEG/TIFF/BMP allowed.`) } catch (e) {}
    }
    setFiles(accepted.length ? accepted : null)
  }

  const removeFile = (i: number) => {
    setFiles((prev) => {
      if (!prev) return null
      const copy = [...prev]
      copy.splice(i, 1)
      return copy.length ? copy : null
    })
  }

  const handleUpload = async () => {
    if (!files || files.length === 0) return
    setLoading(true)
    setMessage(null)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('file', f)
      const res = await fetch(API_URL, { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Upload failed: ${res.status} ${text}`)
      }
      const data = await res.json().catch(() => null)
      setMessage(data && data.message ? String(data.message) : 'Files uploaded successfully.')
      setFiles(null)
    } catch (err: any) {
      console.error(err)
      setMessage('Upload failed. Check the server and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.title}>Documents Upload</div>
        <div style={{ fontSize: 13, color: '#666' }}>Only documents — PDF / DOC / DOCX / HTML / TXT / MD / PNG / JPG / JPEG / TIFF / BMP</div>
      </div>
      <div style={styles.fileList}>
        {files && files.length > 0 ? (
          files.map((f, i) => (
            <div key={i} style={styles.filePill} title={f.name}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#111' }}>{f.name}</div>
              <button onClick={() => removeFile(i)} style={{ marginLeft: 8, background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 12, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label={`Remove ${f.name}`}>×</button>
            </div>
          ))
        ) : (
          <div style={{ color: '#666' }}>No files selected.</div>
        )}
      </div>

      <div style={styles.actions}>
        <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.html,.txt,.md,.png,.jpg,.jpeg,.tiff,.bmp" style={{ display: 'none' }} onChange={handleFileChange} />
        <button onClick={handleChoose} disabled={loading} style={{ padding: '8px 14px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6 }}>Choose files</button>
        <button onClick={handleUpload} disabled={loading || !files || files.length === 0} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6 }}>Upload</button>
        {loading && <div style={{ marginLeft: 8 }}>Uploading…</div>}
        {message && <div style={{ marginLeft: 12, color: message.includes('failed') ? '#e53e3e' : '#0b5' }}>{message}</div>}
      </div>
    </div>
  )
}
