# Project Overview

This project, "AI troubleshooting for energy systems using Gemini AI" (AITfES), is a SvelteKit application designed to provide AI-powered troubleshooting for energy engineering processes, techniques, and systems. It integrates with Google's Gemini AI, utilizing a structured system prompt to guide the AI's diagnostic interactions.

# Building and Running

To set up and run the project, use the following commands:

- **Install Dependencies:**
  ```bash
  npm install
  ```
- **Start Development Server:**
  ```bash
  npm run dev
  ```
- **Build for Production:**
  ```bash
  npm run build
  ```
- **Preview Production Build:**
  ```bash
  npm run preview
  ```
- **Type-check and Lint:**
  ```bash
  npm run check
  ```
- **Format Code:**
  ```bash
  npm run format
  ```
- **Lint Code:**
  ```bash
  npm run lint
  ```

# Development Conventions

- **Framework:** SvelteKit
- **Language:** TypeScript
- **Code Formatting:** Enforced using Prettier (configured via `.prettierrc` and `prettier-plugin-svelte`).
- **Linting:** Handled by ESLint (configured via `eslint.config.js`).
- **Type Checking:** Performed using `svelte-check` with `tsconfig.json`.
