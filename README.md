# ChatPilot Demo Frontend

Simple web interface for ChatPilot - chat with your documents using RAG with PDF highlighting and source navigation.

## What it does

This is a demo frontend for [ChatPilot](https://github.com/Sreehari05055/ChatPilot). It provides a clean chat interface to interact with ChatPilot's features:

- Upload and chat with documents (RAG) with visual PDF highlighting
- View retrieved sources with bounding box highlights on original PDFs
- Upload and ingest documents directly in the sidebar
- Upload and analyze CSV/Excel files in chat
- Search the web for current information
- Upload and analyze CSV/Excel files
- View streaming responses in real-time

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- ChatPilot backend running (see [ChatPilot setup](https://github.com/Sreehari05055/ChatPilot))

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/Sreehari05055/Demo-frontend.git
cd chat-frontend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the frontend
```bash
npm run dev
```

The frontend will start on `http://localhost:5173` (or the next available port).

## Usage

1. Open your browser to `http://localhost:5173`
2. Upload documents using the left sidebar (PDF, DOC, DOCX, HTML, TXT, MD, images)
3. Start chatting - responses will include source references
4. Click source buttons to view PDF highlights showing exactly where information came from
5. Upload CSV/Excel files in chat for data analysis

## Development

Built with:
- React + TypeScript
- Vite for fast development
- PDF.js for document rendering
- Tailwind CSS for styling
- React Query for data fetching

## Need Help?

Open an issue on GitHub if you run into problems.