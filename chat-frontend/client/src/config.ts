// Environment configuration
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
} as const;

export const API_URLS = {
  chat: `${config.apiBaseUrl}/api/chat`,
  ingest: `${config.apiBaseUrl}/api/ingest/`,
  pdfPage: (docId: string, pageNumber: string | number) => 
    `${config.apiBaseUrl}/api/files/${docId}/page/${pageNumber}`,
} as const;
