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
    <header>
        <h1>Gemini SvelteChat</h1>
        {#if chat}
            <button 
                on:click={() => history.set([])}
                class="clear-button"
            >
                Clear Chat History
            </button>
        {/if}
    </header>

    <div class="chat-history-container" bind:this={chatContainer}>
        
        {#if !chat && !isLoading}
            <div class="api-key-warning">
                <p class="font-semibold">Chat Session Offline</p>
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
                        <svg class="spinner" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke-width="4"></circle>
                            <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p>{chat ? 'Thinking...' : 'Starting Chat Session...'}</p>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <footer>
        {#if errorMessage}
            <div class="error-message">
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
            />
            <button 
                type="submit"
                class="send-button"
                disabled={isLoading || !chat || !prompt.trim()}
            >
                Send
            </button>
        </form>
    </footer>
</div>

<style>
    /* Global Container */
    .chat-app {
        display: flex;
        flex-direction: column;
        height: 100vh;
        max-width: 480px;
        margin: 0 auto;
        border-left: 1px solid #e5e7eb;
        border-right: 1px solid #e5e7eb;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        background-color: #f9fafb;
    }

    /* Header */
    header {
        padding: 1rem;
        background-color: #ffffff;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 10;
    }
    header h1 {
        font-size: 1.25rem;
        font-weight: bold;
        color: #1f2937;
    }
    .clear-button {
        font-size: 0.75rem;
        color: #dc2626;
        background-color: #fef2f2;
        padding: 0.375rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid #fecaca;
        transition: background-color 0.2s;
    }
    .clear-button:hover {
        background-color: #fee2e2;
    }

    /* Chat History */
    .chat-history-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    /* Message Rows */
    .message-row {
        display: flex;
    }
    .user-row {
        justify-content: flex-end;
    }
    .model-row {
        justify-content: flex-start;
    }

    /* Individual Message Bubble */
    .chat-message {
        max-width: 75%;
        padding: 0.75rem;
        border-radius: 0.75rem;
        box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        font-size: 0.875rem;
        line-height: 1.4;
    }

    .chat-message.user {
        background-color: #2563eb;
        color: white;
        border-bottom-right-radius: 0; /* Corner cut */
    }

    .chat-message.model {
        background-color: #ffffff;
        color: #1f2937;
        border: 1px solid #e5e7eb;
        border-bottom-left-radius: 0; /* Corner cut */
    }

    .message-role {
        font-weight: 600;
        margin-bottom: 0.25rem;
        font-size: 0.75rem;
    }
    .chat-message.user .message-role {
        color: #bfdbfe; /* Lighter blue for role name */
    }

    /* Warning/Error Messages */
    .api-key-warning {
        padding: 1rem;
        background-color: #fffbeb;
        border: 1px solid #fcd34d;
        color: #92400e;
        border-radius: 0.5rem;
    }

    .error-message {
        margin-bottom: 0.75rem;
        font-size: 0.875rem;
        color: #dc2626;
        font-weight: 500;
        padding: 0.5rem;
        background-color: #fef2f2;
        border-radius: 0.5rem;
    }

    /* Footer and Input */
    footer {
        padding: 1rem;
        background-color: #ffffff;
        border-top: 1px solid #e5e7eb;
        position: sticky;
        bottom: 0;
        z-index: 10;
    }

    /* Prompt Input */
    .prompt-form {
        display: flex;
        gap: 0.5rem;
    }
    .prompt-input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.75rem;
        font-size: 0.875rem;
    }

    .send-button {
        padding: 0.75rem 1rem;
        background-color: #2563eb;
        color: white;
        font-weight: 600;
        border-radius: 0.75rem;
        transition: background-color 0.2s;
    }
    .send-button:hover:not(:disabled) {
        background-color: #1d4ed8;
    }
    .send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    /* Loading Animation */
    .loading-animation {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #6b7280;
    }
    .spinner {
        animation: spin 1s linear infinite;
        height: 1.25rem;
        width: 1.25rem;
        color: #3b82f6;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>