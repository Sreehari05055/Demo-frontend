# RAG Source-Aware PDF Viewer Implementation Flow

This document outlines the architecture for a three-pane RAG interface that automatically loads and highlights cited document chunks in a PDF viewer.

## 1. Data Flow & SSE Orchestration
- **Backend Stream:** The agent yields sources as JSON chunks within the SSE stream: `data: {"sources": [...]}\n\n`.
- **Source Metadata Schema:**
  ```json
  {
    "content": "Text chunk...",
    "id": "node_id",
    "doc_id": "filename.pdf",
    "page_label": "5",
    "bboxes": [
      {"box": [x, y, w, h], "text_snippet": "..."}
    ]
  }
  ```
- **Frontend Interceptor:** The chat hook detects source chunks, updates a `activeSources` state, and programmatically expands the right-side Panel 3.

## 2. Three-Pane UI Design
- **Left Panel:** Chat history / Sidebar.
- **Center Panel:** Active chat interface with message bubbles showing source badges.
- **Right Panel (Document Intelligence):** 
  - Automatically opens when RAG sources are present.
  - Contains a "Source Navigator" if multiple references exist.
  - Hosts the `PDFViewer` component.

## 3. Backend "Page Slicer" API
To optimize performance, the backend serves specific pages rather than full PDF files.
- **Endpoint:** `GET /api/files/{doc_id}/page/{page_number}`
- **Logic:** Uses `pypdf` to extract a single page into a `BytesIO` buffer and returns a `StreamingResponse` with `media_type='application/pdf'`.
- **Benefit:** Reduces bandwidth and memory pressure on the frontend.

## 4. Highlighting Logic (Best-of-Both-Worlds)
When a source is loaded, the frontend applies highlights using this prioritized logic:

### A. Phase 1: Text Search (Standard PDFs)
- Attempt to use the PDF viewer's internal search/find API to locate the `content` string.
- If found, native highlighting is applied. This allows for text selection and better UX.

### B. Phase 2: Bbox Fallback (Scanned/OCR PDFs)
- If text search fails, iterate through the `bboxes` array.
- **Coordinate Scaling:** Multiply normalized coordinates (0-1) by the current viewport's `pageWidth` and `pageHeight`.
- **Canvas Overlay:** Create absolute-positioned `div` elements (yellow, 40% opacity) on top of the PDF canvas layer to visually mark the referenced chunk.

## 5. Automated Navigation
1. Agent streams sources.
2. Frontend fetches PDF page via `doc_id` and `page_label`.
3. Viewer renders page.
4. Highlight Engine triggers (Phase 1 -> Phase 2).
5. Panel expands to show the result to the user immediately.
