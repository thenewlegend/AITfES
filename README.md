

# AITfES — AI Troubleshooting for Energy Systems

AITfES is a multi-agent, RAG-backed chat platform built for industrial energy engineering support. It provides two domain-specific diagnostic agents — one targeting SINVERT PVS 500/600 inverter troubleshooting and one performing financial analysis over John Wood Group PLC annual reports — plus a general-purpose energy systems assistant. All three agents share a unified SvelteKit full-stack architecture with isolated API routes, vector retrieval via Pinecone, and a Gemini model pool with automatic fallback.

## Live Demo
- https://aitfes.vercel.app/woods
- https://aitfes.vercel.app/sinvert
- https://aitfes.vercel.app

## Core Implementations

### Data Pipeline / Ingestion System

Embeddings and document chunks are pre-indexed into Pinecone using its integrated inference pipeline. Two separate indices are maintained:

- **`sinvert` / `sinvert-pvs500-600`** — Technical documentation for SINVERT PVS 500 and PVS 600 solar inverters.
- **`woods` / `woods-financial`** — John Wood Group PLC Annual Reports and Financial Statements (2019–2025 H1).

Retrieval uses `namespace.searchRecords()` with `inputs: { text }`, delegating embedding generation to Pinecone's inference layer — no local embedding model is required. Both namespaces use the `bge-reranker-v2-m3` reranker.

### RAG System

Both RAG pipelines (`/api/sinvert-chat`, `/api/woods-chat`) follow the same three-phase pattern, streamed as NDJSON:

**Phase 1 — Query Condensation:** The raw user message and the last 4–6 turns of chat history are passed to a Gemini model with a domain-specific system instruction that rewrites the input into a standalone, unambiguous search query. This prevents multi-turn conversational phrasing from degrading vector retrieval.

**Phase 2 — Vector Retrieval:** The condensed query is sent to the appropriate Pinecone namespace via `searchRecords`. Retrieved hits are assembled into a structured context string prefixed with `[SOURCE_METADATA: ...]` followed by the chunk text, separated by `---` delimiters.

**Phase 3 — Augmented Generation:** The context is injected into the final user message under `Context Information from [source]:\n---\n{context}\n---\nUser Question: {message}`. This augmented message is sent to a Gemini chat session that has been primed with a product-specific system instruction and a seeded greeting turn to anchor the model's persona.

**Fallback mechanism (`runWithFallback`):** All Gemini calls iterate over a six-model pool in order of speed (`gemini-3.1-flash-lite-preview → gemini-3-flash-preview → gemini-2.5-flash → gemini-3.1-pro-preview → gemini-2.5-pro → gemma-4-31b-it`). Rate limit (429) and server errors are caught, logged via `safeLog`, and a `step` event is streamed to the UI before the next model is attempted with a 500–800ms delay.

**Debug transparency (Woods):** The `WoodsChatBox` includes an in-UI debug modal that surfaces the raw Pinecone hits, the full constructed prompt payload, and the timestamped step log for the most recent pipeline run. The first greeting bubble acts as the trigger.

**System instruction architecture:** `sysInstr.ts` defines the assistant config as a typed `StructuredConfig` object with `directives` (troubleshooting flow, question limit, pause-and-reflect threshold, output format) and `rejection_rules` (scope, multi-question, persona). The server routes call `buildSystemInstruction()` at module load time to compile the config into a formatted string — the client never imports it.

### Full-Stack Application / Interface Layer

The frontend is a **SvelteKit 2** app using **Svelte 5 runes** (`$state`, `$effect`, `$props`), built with Vite and written in TypeScript throughout.

**Three routes, three agents:**

| Route | Agent | API Endpoint | Component |
|---|---|---|---|
| `/` | AITfES General | `/api/chat` | `ChatBox.svelte` |
| `/sinvert` | SINVERT PVS Support | `/api/sinvert-chat` | `ChatBox.svelte` |
| `/woods` | Woods Financial Assistant | `/api/woods-chat` | `WoodsChatBox.svelte` |

**Streaming UI:** The client opens a streaming `fetch` request and reads NDJSON line-by-line. Three event types are handled: `step` (updates the live pipeline status label), `error` (surfaces a cleaned error message), and `final` (appends the model reply to history). Response latency is measured client-side via `performance.now()` and displayed in each message's metadata footer.

**State management:** Each agent has an isolated `localStore` backed by `localStorage` (`aitfes_history`, `aitfes_sinvert_history`, `aitfes_woods_history`). The store validates loaded data against the `ChatMessage` schema before hydrating to prevent render-time crashes from stale or corrupt data.

**UI details:** Markdown responses are rendered via `marked`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2, Svelte 5, Vite 6 |
| LLM | Google Gemini (`@google/genai` v1) |
| Vector DB | Pinecone (`@pinecone-database/pinecone` v7) |
| Reranker | BGE Reranker `bge-reranker-v2-m3` (via Pinecone) |
| Markdown | `marked` v18 |
| Deployment | Vercel `@sveltejs/adapter-auto` |

---

## Usage

**General agent (`/`):** Ask a question about energy engineering processes or SINVERT systems. The model applies a structured diagnostic flow — one question at a time — pausing at five consecutive queries to propose a diagnosis and await confirmation.

**SINVERT agent (`/sinvert`):** Ask about SINVERT PVS 500/600 faults or parameters. The pipeline condenses the query, retrieves relevant documentation chunks, and generates a technically grounded response.

**Woods agent (`/woods`):** Ask about financial data across John Wood Group PLC's 2019–2025 H1 reports. Use the preset question panel for guided queries. Click the greeting bubble after any response to inspect the raw Pinecone results and the exact augmented prompt sent to the LLM.

---