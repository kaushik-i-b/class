# Qwin — AI Web Scraper

React webpage that scrapes public sites and analyzes the extracted content with the **Qwen** model via Hugging Face Inference Providers.

## Features

- Paste any `http(s)` URL and scrape readable page text
- Extract title, description, word count, and outbound links
- Ask **Qwen** to summarize, list key points, extract structured data, or answer questions grounded in the page
- Optional browser-stored Hugging Face token, or server-side `HF_TOKEN`

## Stack

- **Frontend:** React + Vite
- **Backend:** Express scraper (`cheerio`) + Qwen chat completions proxy
- **Model:** `Qwen/Qwen2.5-7B-Instruct` (configurable)

## Setup

```bash
npm install
```

Create a `.env` file (optional):

```bash
cp .env.example .env
```

Set `HF_TOKEN` to a Hugging Face token with Inference Providers permission, or paste a token in the in-app Settings panel.

## Run

Development (API on `:8787`, Vite on `:5173` with proxy):

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Open `http://localhost:5173` in development, or `http://localhost:8787` after building.

## API

- `POST /api/scrape` `{ "url": "https://example.com" }`
- `POST /api/analyze` `{ "page": {...}, "mode": "summarize|keypoints|extract|qa", "question": "..." }`
- `GET /api/health`

## Notes

- Scraping respects a short timeout and only accepts HTML responses.
- Analysis requires a Hugging Face token (server env or Settings).
- Change the model with `QWEN_MODEL` (OpenAI-compatible router id).
