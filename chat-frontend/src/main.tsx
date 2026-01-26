import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DocUpload from './DocUpload'

const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
const RootComponent = pathname === '/ingest' ? <DocUpload /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {RootComponent}
  </StrictMode>,
)
