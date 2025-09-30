<script lang="ts">
    import { onMount } from 'svelte';
    import type { Chat } from '@google/genai';
    import { createChatSession } from '$lib/gemini'; 
    import { history, type ChatMessage } from '$lib/stores/stores'; 
    
    // --- State Variables (Keep Local) ---
    let chat: Chat | null = null;
    let isLoading = false;
    let errorMessage: string | null = null;
    let prompt = '';
    let chatContainer: HTMLDivElement; // For auto-scrolling
    
    const systemInstruction ='You are J.A.R.V.I.S an AI assistant specialized in providing comprehensive troubleshooting for energy engineering processes, tecniques and so on  (AITfES - AI Troubleshooting for Energy Systems)  Your primary directives are 1 Troubleshooting Flow Your sole goal is to guide the user to a solution by asking one focused question at a time Do not offer solutions until you are confident in the diagnosis2 One Question Rule Every single response you generate MUST contain only one clear and focused question to the user to gather more diagnostic information Do not ask follow-up questions or offer any suggestions in the same turn  Rejection Rule 1 Scope If the user asks a question unrelated energy engineering processes, tecniques and so on you MUST politely reject it by stating "My function is limited to energy engineering processes, techniques and so on only Please ask a technical troubleshooting question" 5 Rejection Rule 2 Too many question-If the users input contains more than one question ie multiple questions marks or clearly distinct queries you MUST politely reject it by stating Please focus on one response or one focused question at a time to maintain a clear troubleshooting flow. After 4 query, propose some reasoning and then continue. Do not go on large QA spree';

    // --- Core Logic ---

    // Automatically attempts to start the chat session using the hardcoded key
    async function startSession() {
        if (chat) return; 
        
        isLoading = true;
        errorMessage = null;

        try {
            // No key parameter needed
            chat = await createChatSession(systemInstruction); 
        } catch (e) {
            errorMessage = e instanceof Error 
                ? e.message.includes('API Key') ? 'Initialization Error: Invalid or missing hardcoded API Key.' : e.message 
                : 'An unknown error occurred during chat setup.';
            chat = null;
        } finally {
            isLoading = false;
        }
    }
    
    // Function to handle sending the message
    async function sendMessage() {
        if (isLoading || !chat || !prompt.trim()) return;

        const userPrompt = prompt.trim();
        prompt = '';
        isLoading = true;
        errorMessage = null;

        history.update(h => [...h, { role: 'user', text: userPrompt }]);

        try {
            if (chatContainer) {
                await new Promise(resolve => setTimeout(resolve, 50)); 
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            const result = await chat.sendMessage({ message: userPrompt });
            const modelText = result.text.trim();

            history.update(h => [...h, { role: 'model', text: modelText }]);
        } catch (e) {
            errorMessage = e instanceof Error 
                ? `API Error: ${e.message}` 
                : 'An unknown API error occurred.';
            // If the key fails during a message, stop the chat.
            if (errorMessage.includes('API key')) {
                chat = null;
            }
        } finally {
            isLoading = false;
            if (chatContainer) {
                await new Promise(resolve => setTimeout(resolve, 50));
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }
    }

    // Start the session automatically when the component mounts
    onMount(() => {
        startSession();
    });

    // Reactive statement for auto-scrolling on history change
    $: if (chatContainer && $history.length) {
        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop < chatContainer.offsetHeight + 200;
        if (isNearBottom) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
</script>
 

<div class="chat-app">
    <header class="app-header">
        <h1 class="header-title">Gemini SvelteChat</h1>
        {#if chat}
            <button 
                on:click={() => history.set([])}
                class="clear-history-button"
                aria-label="Clear Chat History"
            >
                Clear Chat
            </button>
        {/if}
    </header>

    <div class="chat-history-container" bind:this={chatContainer}>
        
        {#if !chat && !isLoading}
            <div class="system-message warning">
                <p class="font-semibold">Chat Session Offline ⚠️</p>
                <p>The session failed to start. Please check the **hardcoded API Key** in <code>src/lib/gemini.ts</code> and refresh the page.</p>
            </div>
        {/if}

        {#each $history as message}
            <div class="message-row {message.role === 'user' ? 'user-row' : 'model-row'}">
                <div class="chat-message {message.role}">
                    <p class="message-role">{message.role === 'user' ? 'You' : 'Gemini'}</p>
                    <div class="message-content">
                        {message.text}
                    </div>
                </div>
            </div>
        {/each}

        {#if isLoading}
            <div class="message-row model-row">
                <div class="chat-message model loading">
                    <div class="loading-animation">
                        <svg class="spinner" viewBox="0 0 24 24" role="status">
                            <circle cx="12" cy="12" r="10" stroke-width="4" fill="none" stroke="currentColor"></circle>
                            <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="var(--color-primary)"></path>
                        </svg>
                        <p>{chat ? 'Thinking...' : 'Starting Chat Session...'}</p>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <footer class="app-footer">
        {#if errorMessage}
            <div class="system-message error">
                Error: {errorMessage}
            </div>
        {/if}

        <form on:submit|preventDefault={sendMessage} class="prompt-form">
            <input 
                type="text"
                placeholder={chat ? "Ask me anything..." : "Chat is initializing or failed to load."}
                bind:value={prompt}
                class="prompt-input"
                disabled={isLoading || !chat}
                aria-label="Chat input"
            />
            <button 
                type="submit"
                class="send-button"
                disabled={isLoading || !chat || !prompt || !prompt.trim()}
            >
                Send
            </button>
        </form>
    </footer>
</div>

<style>
    /* CSS Variables for better maintainability and theme-like adjustments */
    :root {
        /* Colors */
        --color-primary: #2563eb;
        --color-primary-dark: #1d4ed8;
        --color-background-app: #f9fafb;
        --color-background-paper: #ffffff;
        --color-border: #e5e7eb;
        --color-text: #1f2937;
        --color-user-text: white;
        --color-role-text-user: #bfdbfe;
        
        /* Spacing */
        --space-sm: 0.5rem;
        --space-md: 1rem;
        --space-lg: 1.5rem;

        /* Radius */
        --radius-sm: 0.5rem;
        --radius-md: 0.75rem;
        --radius-lg: 1rem;
    }

    /* =================================
       1. Global App Structure
       ================================= */

    .chat-app {
        display: flex;
        flex-direction: column;
        height: 100vh; /* Full viewport height on mobile */
        width: 100%;
        max-width: 480px; /* Max width for desktop/tablet */
        margin: 0 auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        background-color: var(--color-background-app);
    }

    /* Mobile Readability & Layout Improvement */
    @media (max-width: 480px) {
        .chat-app {
            border-left: none;
            border-right: none;
            box-shadow: none; /* Full-screen mobile feel */
        }
        /* Ensure inputs and buttons are easily tappable */
        .prompt-input, .send-button {
            min-height: 48px; 
            padding: var(--space-md);
        }
    }

    /* =================================
       2. Header & Footer
       ================================= */

    .app-header, .app-footer {
        padding: var(--space-md);
        background-color: var(--color-background-paper);
        border-color: var(--color-border);
        z-index: 10;
        /* Separator lines */
    }

    .app-header {
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 0;
    }
    .header-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text);
        margin: 0;
    }
    .app-footer {
        border-top: 1px solid var(--color-border);
        position: sticky;
        bottom: 0;
    }

    /* Clear Button */
    .clear-history-button {
        font-size: 0.875rem; /* Slightly increased size */
        color: #dc2626; /* Red 600 */
        background-color: #fef2f2; /* Red 50 */
        padding: 0.5rem 0.75rem; /* Increased padding */
        border-radius: var(--radius-sm);
        border: 1px solid #fecaca; /* Red 200 */
        transition: background-color 0.2s;
        font-weight: 600; /* Added emphasis */
    }
    .clear-history-button:hover {
        background-color: #fee2e2; /* Red 100 */
    }

    /* =================================
       3. Chat History & Messages
       ================================= */

    .chat-history-container {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
    }

    /* Message Rows */
    .message-row {
        display: flex;
        /* Removed unnecessary classes like 'user-row' and 'model-row' from the CSS 
           and used the role classes to define alignment for improved clarity */
    }
    .user-row { /* Keeping user-row for HTML clarity, but using the .chat-message.user style */
        justify-content: flex-end;
    }
    .model-row { /* Keeping model-row for HTML clarity, but using the .chat-message.model style */
        justify-content: flex-start;
    }


    /* Message Bubble */
    .chat-message {
        max-width: 85%; /* Increased max-width for better use of mobile screen */
        padding: 0.75rem;
        border-radius: var(--radius-md);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        font-size: 1rem; /* Increased font-size for better mobile readability */
        line-height: 1.5; /* Improved line-height */
        word-wrap: break-word; /* Ensures long words wrap */
    }
    @media (max-width: 480px) {
        .chat-message {
            max-width: 90%;
        }
    }

    .chat-message.user {
        background-color: var(--color-primary);
        color: var(--color-user-text);
        border-bottom-right-radius: var(--space-sm); /* Smaller corner cut */
    }

    .chat-message.model {
        background-color: var(--color-background-paper);
        color: var(--color-text);
        border: 1px solid var(--color-border);
        border-bottom-left-radius: var(--space-sm); /* Smaller corner cut */
    }

    .message-role {
        font-weight: 600;
        margin-bottom: 0.25rem;
        font-size: 0.75rem;
    }
    .chat-message.user .message-role {
        color: var(--color-role-text-user);
    }

    /* =================================
       4. System/Error Messages
       ================================= */

    .system-message {
        padding: var(--space-md);
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        line-height: 1.4;
    }
    .system-message p {
        margin: 0;
    }
    .system-message.warning {
        background-color: #fffbeb; /* Yellow 50 */
        border: 1px solid #fcd34d; /* Yellow 300 */
        color: #92400e; /* Yellow 800 */
    }
    .system-message.error {
        margin-bottom: var(--space-sm);
        color: #dc2626; /* Red 600 */
        font-weight: 500;
        background-color: #fef2f2; /* Red 50 */
        border: none;
    }

    /* =================================
       5. Input Form
       ================================= */

    .prompt-form {
        display: flex;
        gap: var(--space-sm);
    }

    .prompt-input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: var(--radius-md);
        font-size: 1rem; /* Increased font-size for mobile readability */
        transition: border-color 0.2s, box-shadow 0.2s;
    }
    .prompt-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }
    .prompt-input:disabled {
        background-color: #f3f4f6;
    }

    .send-button {
        padding: 0.75rem 1rem;
        background-color: var(--color-primary);
        color: var(--color-user-text);
        font-weight: 600;
        border-radius: var(--radius-md);
        transition: background-color 0.2s;
    }
    .send-button:hover:not(:disabled) {
        background-color: var(--color-primary-dark);
    }
    .send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    /* =================================
       6. Loading Animation
       ================================= */

    .loading-animation {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        color: #6b7280;
    }
    .spinner {
        animation: spin 1s linear infinite;
        height: 1.25rem;
        width: 1.25rem;
    }
    .spinner circle {
        stroke: var(--color-border);
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>