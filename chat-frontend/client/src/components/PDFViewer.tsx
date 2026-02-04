import { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface BBox {
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
  text_snippet?: string;
}

interface PDFViewerProps {
  docId: string;
  pageNumber: string | number;
  bboxes?: BBox[];
  content?: string;
}

export function PDFViewer({ docId, pageNumber, bboxes, content }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [showFullText, setShowFullText] = useState(false);

  // Skip rendering if no bboxes
  if (!bboxes || bboxes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <div className="max-w-xs bg-black/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
          <div className="text-white/60 text-sm">No PDF preview available for this source</div>
        </div>
      </div>
    );
  }

  // Stable reference for bboxes to prevent infinite re-renders
  const bboxesKey = useMemo(() => {
    if (!bboxes || bboxes.length === 0) return 'empty';
    return bboxes.map(b => b.box?.join(',')).join('|');
  }, [bboxes]);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!docId || !pageNumber) return;
      
      setLoading(true);
      setError(null);

      try {
        const url = `http://localhost:8000/api/files/${docId}/page/${pageNumber}`;
        
        const loadingTask = pdfjs.getDocument(url);
        const pdf = await loadingTask.promise;
        
        if (!isMounted) return;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale });
        viewportRef.current = viewport;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        if (isMounted) {
          drawHighlights(viewport, page);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Error loading PDF page:", err);
        if (isMounted) {
          setError("Failed to load PDF page. Document might not exist or backend is unreachable.");
          setLoading(false);
        }
      }
    }

    function drawHighlights(viewport: any, page: any) {
      if (!overlayRef.current) return;
      overlayRef.current.innerHTML = '';
      overlayRef.current.style.width = `${viewport.width}px`;
      overlayRef.current.style.height = `${viewport.height}px`;

      console.log('[PDFViewer] Received bboxes:', bboxes);
      console.log('[PDFViewer] Page size:', page.view);

      if (!bboxes || bboxes.length === 0) {
        console.warn('[PDFViewer] No bboxes to draw');
        return;
      }

      console.log(`[PDFViewer] Drawing ${bboxes.length} bboxes`);

      // Get the page's natural dimensions (PDF units)
      const [pageX, pageY, pageWidth, pageHeight] = page.view;
      
      bboxes.forEach((bbox: any, idx: number) => {
        if (!bbox.box) return;
        
        const [x1, y1, x2, y2] = bbox.box;
        
        // PDF coordinates: origin at bottom-left
        // Canvas coordinates: origin at top-left
        // Transform: flip Y-axis and scale
        const scaleX = viewport.width / pageWidth;
        const scaleY = viewport.height / pageHeight;
        
        const left = x1 * scaleX;
        const top = (pageHeight - y2) * scaleY; // Flip Y
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;

        const highlight = document.createElement('div');
        highlight.style.position = 'absolute';
        highlight.style.left = `${left}px`;
        highlight.style.top = `${top}px`;
        highlight.style.width = `${width}px`;
        highlight.style.height = `${height}px`;
        highlight.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
        highlight.style.border = '2px solid rgba(255, 193, 7, 0.9)';
        highlight.style.borderRadius = '3px';
        highlight.style.mixBlendMode = 'multiply';
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '10';
        highlight.style.boxShadow = '0 0 4px rgba(255, 193, 7, 0.3)';

        overlayRef.current?.appendChild(highlight);
      });
    }

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [docId, pageNumber, scale, bboxesKey]);

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-black/5 flex flex-col">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 p-1 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl">
        <button 
          onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/80 transition-all font-bold"
          title="Zoom Out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/></svg>
        </button>
        <div className="px-2 text-[10px] font-bold text-white/40 w-12 text-center uppercase tracking-tighter">
          {Math.round(scale * 100)}%
        </div>
        <button 
          onClick={() => setScale(s => Math.min(s + 0.25, 3))}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/80 transition-all font-bold"
          title="Zoom In"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <button 
          onClick={() => setScale(1.5)}
          className="h-8 px-2 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/80 text-[10px] font-bold uppercase tracking-wider"
          title="Reset Zoom"
        >
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-auto rag-scrollbar p-8" ref={containerRef}>
        <div className="inline-block relative shadow-2xl border border-black/20 bg-white">
          <canvas ref={canvasRef} className="block" />
          <div ref={overlayRef} className="absolute top-0 left-0 pointer-events-none" />
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-30">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
            <span className="text-xs text-white/60 font-medium">Loading page segment...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center z-30 bg-background/50">
          <div className="max-w-xs bg-black/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
            <div className="text-red-400 font-medium mb-1">Preview Offline</div>
            <div className="text-[10px] text-white/50">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && content && (
        <>
          {/* Compact preview - fixed below canvas */}
          {!showFullText && (
            <div className="flex justify-center px-4 py-4">
              <button 
                onClick={() => setShowFullText(true)}
                className="w-full max-w-md text-left hover:scale-[1.01] transition-all duration-200 cursor-pointer group"
              >
                <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-lg shadow-lg group-hover:border-primary/40 group-hover:shadow-primary/10">
                    <div className="text-[9px] font-bold text-primary uppercase tracking-[0.15em] opacity-70 flex items-center gap-2 mb-1">
                      <span>Referenced Content</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50 group-hover:opacity-100 transition-opacity"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </div>
                    <div className="text-[11px] text-white/60 italic leading-snug line-clamp-2">
                      "{content}"
                    </div>
                </div>
              </button>
            </div>
          )}

          {/* Expanded overlay */}
          {showFullText && (
            <div 
              className="absolute inset-0 z-40 flex items-center justify-center p-8 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setShowFullText(false)}
            >
              <div 
                className="bg-gradient-to-br from-black/90 to-black/80 backdrop-blur-xl border border-primary/20 p-8 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto rag-scrollbar animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] opacity-90">Full Referenced Content</div>
                  <button 
                    onClick={() => setShowFullText(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-all"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                  "{content}"
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
