# ChatPilot Demo Frontend

Simple web interface for ChatPilot - chat with your documents, search the web, and analyze data.

## What it does

This is a demo frontend for [ChatPilot](https://github.com/Sreehari05055/ChatPilot). It provides a clean chat interface to interact with ChatPilot's features:

- Upload and chat with documents (RAG)
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

### 3. Start ChatPilot backend

Make sure the ChatPilot backend is running on `http://localhost:8000`:
```bash
# In the ChatPilot directory
python main.py --dev
```

### 4. Run the frontend
```bash
npm run dev
```

The frontend will start on `http://localhost:5173` (or the next available port).

## Usage

1. Open your browser to `http://localhost:5173`
2. Start chatting with ChatPilot
3. Upload documents or data files using the upload button
4. Ask questions

## Development

Built with:
- React/Vue/Svelte (whichever you're using)
- Vite for fast development
- Modern ES6+ JavaScript

## Need Help?

Open an issue on GitHub if you run into problems.