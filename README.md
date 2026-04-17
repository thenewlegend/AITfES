# AITfES — AI Troubleshooting for Energy Systems

AITfES is a multi-agent, retrieval-augmented AI system engineered for industrial energy workflows, where correctness, traceability, and controlled reasoning take precedence over conversational fluency.

Rather than functioning as a generic chatbot, AITfES operates as a **constrained, inspectable diagnostic system**. It integrates domain-scoped retrieval pipelines, typed system instruction architecture, and a fault-tolerant multi-model inference layer to deliver context-grounded and operationally reliable outputs.

## Live Deployment

- General Agent: https://aitfes.vercel.app
- SINVERT Diagnostics: https://aitfes.vercel.app/sinvert
- Woods Assistant : https://aitfes.vercel.app/woods

---

The platform exposes three domain-specialised agents:

- **SINVERT PVS Diagnostic Agent** — fault analysis and parameter-level troubleshooting for PVS 500/600 inverter systems
- **Woods Financial Analysis Agent** — structured reasoning over John Wood Group PLC reports (2019–2025 H1)
- **General Energy Systems Assistant** — controlled diagnostic reasoning for energy engineering related troubleshooting.

All agents share a unified SvelteKit full-stack architecture while maintaining strict isolation across retrieval, instruction, and data layers.

---
## Architectural Overview

AITfES is structured around three core subsystems:

1. Pre-indexed retrieval infrastructure (Pinecone)
2. Deterministic, multi-phase RAG pipelines
3. Resilient, multi-model inference orchestration

This separation enforces modularity: retrieval, reasoning, and generation are independently optimisable without cross-layer instability.

---

## Data Pipeline & Indexing Strategy

All documents are pre-processed and indexed using **Pinecone’s integrated inference pipeline**, eliminating the need for runtime embedding models and reducing system complexity.

### Indices

- `sinvert / sinvert-pvs500-600`
  - Technical documentation for SINVERT PVS 500/600
- `woods / woods-financial`
  - Annual reports and financial statements (2019–2025 H1)

### Retrieval

```ts
namespace.searchRecords({ inputs: { text } })
```

Key characteristics:
- Query-time embeddings generated via Pinecone inference
- Reranking with `bge-reranker-v2-m3`
- Metadata-preserving chunk assembly for traceability

---

## Retrieval-Augmented Generation Pipeline

Each pipeline (`/api/sinvert-chat`, `/api/woods-chat`) follows a deterministic three-phase architecture.

### Phase 1 — Query Condensation

Transforms conversational input into a standalone query.

Inputs:
- Current message
- Last 4–6 turns of history

Output:
- Context-independent, semantically explicit search query

Purpose:
- Prevent retrieval degradation from conversational ambiguity

---

### Phase 2 — Vector Retrieval

The condensed query is dispatched to Pinecone.

Context assembly format:

```
[SOURCE_METADATA: ...]
<chunk>
---
```

Design intent:
- Preserve provenance
- Maintain deterministic formatting
- Enable predictable downstream prompting

---

### Phase 3 — Augmented Generation

Context injection format:

```
Context Information:
---
{context}
---
User Question: {message}
```

Executed via a Gemini chat session configured with:
- Domain-specific system instruction
- Seeded interaction for behavioural anchoring

---

## Model Orchestration & Fault Tolerance

All inference is executed through `runWithFallback()`.

### Model Priority Chain

```
→ gemini-3.1-flash-lite-preview
→ gemini-3-flash-preview
→ gemini-2.5-flash
→ gemini-3.1-pro-preview
→ gemini-2.5-pro
→ gemma-4-31b-it
```

### Behaviour

- Sequential fallback across models
- Handles:
  - Rate limits (429)
  - Transient server failures
- Emits real-time pipeline steps to UI
- Applies 500–800ms retry backoff

This ensures graceful degradation rather than hard failure.

---

## System Instruction Architecture

System behaviour is defined declaratively via a typed configuration (`StructuredConfig`) in `sysInstr.ts`.

### Structure

- **directives**
  - Diagnostic flow
  - Question constraints
  - Output structure
  - Reflection thresholds

- **rejection_rules**
  - Scope enforcement
  - Multi-question filtering
  - Persona constraints

Compiled server-side via:

```ts
buildSystemInstruction()
```

The client has no access to system prompts, ensuring integrity and preventing leakage.

## Debug Transparency (Woods Agent)

The Woods agent exposes full pipeline introspection:

- Raw Pinecone retrieval results
- Constructed LLM prompt payload
- Timestamped execution logs

##### Triggered via UI interaction (first greeting bubble).
---

## Frontend Architecture

### Stack

- SvelteKit
- Svelte 5 (runes: `$state`, `$effect`, `$props`)
- TypeScript
- Vite

---

### Routing Model

| Route | Agent | API | Component |
|------|------|-----|----------|
| `/` | General | `/api/chat` | `ChatBox.svelte` |
| `/sinvert` | SINVERT | `/api/sinvert-chat` | `ChatBox.svelte` |
| `/woods` | Woods | `/api/woods-chat` | `WoodsChatBox.svelte` |

---

### Streaming Interface

- Uses `fetch` with NDJSON streaming

Event types:
- `step` — pipeline status updates
- `error` — sanitised error propagation
- `final` — completed response

Latency:
- Measured via `performance.now()`
- Displayed per message

---

### State Management

Each agent maintains isolated local persistence:

- `aitfes_history`
- `aitfes_sinvert_history`
- `aitfes_woods_history`

Features:
- Schema validation (`ChatMessage`)
- Corruption-safe hydration
- LocalStorage-backed persistence

---

### UI Layer

- Markdown rendering via `marked`
- Structured response formatting
- Inline diagnostic metadata

---

## Tech Stack

| Layer | Technology |
|------|-----------|
| Framework | SvelteKit 2, Svelte 5, Vite 6 |
| LLM | Google Gemini (`@google/genai` v1) |
| Vector DB | Pinecone (`@pinecone-database/pinecone` v7) |
| Reranker | `bge-reranker-v2-m3` |
| Markdown | `marked` v18 |
| Deployment | Vercel (`@sveltejs/adapter-auto`) |

---

## Usage

### General Agent (`/`)

- Broad energy engineering queries
- Structured diagnostic reasoning
- Enforces:
  - Single-question progression
  - Reflection threshold after five queries

---

### SINVERT Agent (`/sinvert`)

- Focus: PVS 500/600 inverter systems
- Pipeline:
  - Query normalisation
  - Document retrieval
  - Grounded response synthesis

---

### Woods Agent (`/woods`)

- Financial analysis across 2019–2025 H1
- Supports:
  - Structured queries
  - Preset prompts
  - Full pipeline introspection

---

