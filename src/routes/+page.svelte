<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chat } from '@google/genai';
	import { createChatSession } from '$lib/gemini';
	import { history } from '$lib/stores/stores';
	import { structuredConfig, type StructuredConfig, type RejectionRule } from '$lib/sysInstr';

	// --- State Variables (Keep Local) ---
	let chat: Chat | null = null;
	let isLoading = false;
	let errorMessage: string | null = null;
	let prompt = '';
	let chatContainer: HTMLDivElement; // For auto-scrolling
	let inputElement: HTMLInputElement;

	function buildSystemInstruction(config: StructuredConfig) {
		let instruction = `You are ${config.assistant_config.name}, an AI assistant specialized in ${config.assistant_config.specialization}.\n\n`;
		instruction += '## Primary Directives\n';

		// Directives
		for (const key in config.directives) {
			const d = config.directives[key as keyof typeof config.directives];
			instruction += `${d.id}. **${d.name}:** ${d.rule}\n`;
		}

		// Rejection Rules
		instruction += '\n## Rejection Rules\n';
		config.rejection_rules.forEach((r: RejectionRule) => {
			instruction += `${r.id + 3}. **${r.name} (${r.condition}):** Reply with: "${r.response}"\n`;
		});

		return instruction.trim();
	}

	const systemInstruction = buildSystemInstruction(structuredConfig);

	// --- Core Logic ---

	// Function to handle clearing history and re-initializing chat
	aSync function handleClearHistory() {
		isLoading = true;
		history.set([]);

		try {
			chat = await createChatSession(systemInstruction);
			history.update((h) => [
				...h,
				{ role: 'model', text: `I'm ${structuredConfig.assistant_config.name} 💡` },
				{ role: 'model', text: structuredConfig.assistant_config.specialization },
				{
					role: 'model',
					text: structuredConfig.directives.flow.rule
				}
			]);
		} catch (error) {
			console.error('Failed to renew chat session:', error);
			chat = null;
		} finally {
			isLoading = false;
		}
	}

	// Automatically attempts to start the chat session using the hardcoded key
	aSync function startSession() {
		if (chat) return; 

		isLoading = true;
		errorMessage = null;

		try {
			// No key parameter needed
			chat = await createChatSession(systemInstruction); 
		} catch (e) {
			errorMessage = 
				e instanceof Error 
					? e.message.includes('API Key') 
						? 'Initialization Error: Invalid or missing API Key.' 
						: e.message 
					: 'An unknown error occurred during chat setup.';
			chat = null;
		} finally {
			isLoading = false;
		}
	}

	// Function to handle sending the message
	aSync function sendMessage() {
		if (isLoading || !chat || !prompt.trim()) return;

		const userPrompt = prompt.trim();
		prompt = '';
		isLoading = true;
		errorMessage = null;

		history.update((h) => [...h, { role: 'user', text: userPrompt }]);

		try {
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}

			const result = await chat.sendMessage({ message: userPrompt });
			const modelText = result.text?.trim() || '';

			history.update((h) => [...h, { role: 'model', text: modelText }]);
		} catch (e) {
			errorMessage = 
				e instanceof Error ? `API Error: ${e.message}` : 'An unknown API error occurred.';
			// If the key fails during a message, stop the chat.
			if (errorMessage.includes('API key')) {
				chat = null;
			}
		} finally {
			isLoading = false;
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}

			if (inputElement) {
				inputElement.focus();
			}
		}
	}

	// Start the session automatically when the component mounts
	onMount(() => {
		startSession();
	});

	// Reactive statement for auto-scrolling on history change
	$: if (chatContainer && $history.length) {
		const isNearBottom =
			chatContainer.scrollHeight - chatContainer.scrollTop < chatContainer.offsetHeight + 200;
		if (isNearBottom) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}
</script>

<div class="chat-app">
	<header class="app-header">
		<h1 class="header-title">AITfES</h1>
		{#if chat}
			<button
				title="Delete History"
				on:click={handleClearHistory}
				class="clear-history-button"
				aria-label="Clear Chat History"
			>
				<svg
					fill="#000000"
					viewBox="0 0 14 14"
					role="img"
					focusable="false"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					style="width: 18px; height: 18px;"
				>
					<g id="SVGRepo_bgCarrier" stroke-width="0"></g>
					<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
					<g id="SVGRepo_iconCarrier"
						><path
							d="m 9,9 0.444445,0 0,3.11111 -0.444445,0 z m -0.888889,0 0.444445,0 0,4 -0.444445,0 z m 1.777778,0 0.444444,0 0,3.55556 -0.444444,0 z m -2.666667,0 0.444445,0 0,3.55556 -0.444445,0 z m 4.444445,-1.77778 0,0.88889 -9.333334,0 0,-0.88889 -0.444444,0 0,2.22222 0.444444,0 0,-0.88888 9.333334,0 0,0.88888 0.444444,0 0,-2.22222 z M 10.777778,9 l 0.444444,0 0,4 -0.444444,0 z m -4.444445,0 0.444445,0 0,4 -0.444445,0 z M 11.222222,4.55556 9,4.55556 c -0.488877,0 -0.888889,-0.39999 -0.888889,-0.88889 L 8.111111,1 3.666667,1 C 3.177766,1 2.777778,1.39999 2.777778,1.88889 l 0,5.77778 8.444444,0 0,-3.11111 z M 2.777778,9 l 0.444444,0 0,4 -0.444444,0 z M 9,4.11111 l 2.222222,0 L 8.555556,1 l 0,2.66667 C 8.555556,3.93333 8.77779,4.11111 9,4.11111 Z M 4.555556,9 5,9 5,13 4.555556,13 Z m -0.888889,0 0.444444,0 0,3.55556 -0.444444,0 z m 1.777778,0 0.444444,0 0,3.11111 -0.444444,0 z"
				></path></g
				></svg
			>
			</button>
		{/if}
	</header>

	<div class="chat-history-container" bind:this={chatContainer}>
		{#if !chat && !isLoading}
			<div class="system-message warning">
				<p class="font-semibold" style="text-align: center;">Chat Session Offline ⚠️</p>
				<p style="text-align: center;">Please wait for initialization.</p>
			</div>
		{/if}

		{#each $history as message (message.text)}
			<div class="message-row {message.role === 'user' ? 'user-row' : 'model-row'}">
				<div class="chat-message {message.role}">
					<p class="message-role">{message.role === 'user' ? 'You' : 'AITfES'}</p>
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
							<circle cx="12" cy="12" r="10" stroke-width="4" fill="none" stroke="currentColor"
							></circle>
							<path
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								fill="var(--color-primary)"
							></path>
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
				placeholder={chat ? 'Ask me anything...' : 'Chat is initializing or failed to load.'}
				bind:value={prompt}
				bind:this={inputElement}
				class="prompt-input"
				disabled={isLoading || !chat}
				aria-label="Chat input"
			/>
			<button
				title="Send Query"
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
	:root {
		/* Green Palette */
		--color-primary: #15803d;
		--color-primary-dark: #006837;
		--color-background-app: #e0f2f1;
		--color-background-paper: #ffffff;
		--color-border: #d1d5db;
		--color-text: #1f2937;
		--color-user-text: white;
		--color-role-text-user: #a7f3d0;

		/* Glassmorphism */
		--glass-bg-color: rgba(255, 255, 255, 0.5);
		--glass-blur: 8px;
		--glass-border: rgba(255, 255, 255, 0.7);
		--glass-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);

		/* Spacing */
		--space-sm: 0.5rem;
		--space-md: 1rem;
		--space-lg: 1.5rem;

		/* Radius */
		--radius-sm: 0.4rem;
		--radius-md: 0.6rem;
		--radius-lg: 1rem;

		/* Fixed header/footer heights */
		--header-height: 60px;
		--footer-height: 70px;
	}

	/* =================================
   1. Global App
   ================================= */
	.chat-app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
		background: linear-gradient(270deg, #e0f2f1, #f0fdf4, #ecfdf5);
		background-size: 600% 600%;
		animation: backgroundShift 15s ease infinite;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		position: relative;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
	}

	@keyframes backgroundShift {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	@media (max-width: 480px) {
		.chat-app {
			border: none;
			border-radius: 0;
			box-shadow: none;
		}
		.prompt-input,
		.send-button {
			min-height: 48px;
			padding: var(--space-md);
		}
	}

	/* =================================
   2. Header & Footer
   ================================= */
	.app-header,
	.app-footer {
		background-color: var(--glass-bg-color);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		z-index: 10;
		position: fixed;
		left: 0;
		right: 0;
	}

	.app-header {
		top: 0;
		height: var(--header-height);
		padding: 0 var(--space-md);
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--glass-border);
		box-shadow: var(--glass-shadow);
	}

	.header-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-primary-dark);
		margin: 0;
	}

	.app-footer {
		bottom: 0;
		height: var(--footer-height);
		padding: var(--space-md);
		border-top: 1px solid var(--glass-border);
		box-shadow: var(--glass-shadow);
	}

	/* Clear Button */
	.clear-history-button {
		font-size: 0.875rem;
		color: #b91c1c;
		background-color: transparent;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		border: 1px solid #fecaca;
		transition:
			background-color 0.2s,
			border-color 0.2s;
		font-weight: 600;
	}
	.clear-history-button:hover {
		background-color: #fef2f2;
		border-color: #dc2626;
		cursor: pointer;
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
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: var(--color-primary) transparent;

		/* Offsets for fixed header/footer */
		padding-top: var(--header-height);
		padding-bottom: var(--footer-height);
	}

	.message-row {
		display: flex;
	}
	.user-row {
		justify-content: flex-end;
	}
	.model-row {
		justify-content: flex-start;
	}

	/* Message Bubble */
	.chat-message {
		max-width: 85%;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		font-size: 1rem;
		line-height: 1.5;
		word-wrap: break-word;
	}
	.chat-message.user {
		background-color: var(--color-primary);
		color: var(--color-user-text);
		border-top-right-radius: var(--space-sm);
		border-bottom-right-radius: var(--space-sm);
		box-shadow: 0 2px 4px rgba(21, 128, 61, 0.3);
	}
	.chat-message.model {
		background-color: rgba(255, 255, 255, 0.7);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		color: var(--color-text);
		border: 1px solid rgba(255, 255, 255, 0.8);
		border-top-left-radius: var(--space-sm);
		border-bottom-left-radius: var(--space-sm);
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
	}
	.message-role {
		font-weight: 600;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		color: #4b5563;
	}
	.chat-message.user .message-role {
		color: var(--color-role-text-user);
	}

	/* =================================
   4. System/Error Messages
   ================================= */
	.system-message {
		background-color: var(--glass-bg-color);
		backdrop-filter: blur(3px);
		-webkit-backdrop-filter: blur(3px);
		border: 1px solid var(--glass-border);
		padding: var(--space-md);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--color-text);
	}
	.system-message.warning {
		background-color: rgba(255, 248, 225, 0.7);
		border: 1px solid #fcd34d;
		color: #92400e;
	}
	.system-message.error {
		margin-bottom: var(--space-sm);
		color: #dc2626;
		font-weight: 500;
		background-color: rgba(254, 242, 242, 0.7);
		border: 1px solid #fecaca;
	}

	/* =================================
   5. Input Form
   ================================= */
	.prompt-form {
		display: flex;
		gap: var(--space-sm);
		height: 100%;
	}
	.prompt-input {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 1rem;
		background-color: rgba(255, 255, 255, 0.85);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.prompt-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.2);
		background-color: var(--color-background-paper);
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
		border: none;
		box-shadow: 0 2px 4px rgba(21, 128, 61, 0.2);
	}
	.send-button:hover:not(:disabled) {
		background-color: var(--color-primary-dark);
		box-shadow: 0 3px 6px rgba(21, 128, 61, 0.3);
		cursor: pointer;
	}
	.send-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		box-shadow: none;
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
		transform-origin: center;
	}
	.spinner circle {
		stroke: var(--color-primary);
		stroke-dasharray: 80;
		stroke-width: 3;
		stroke-linecap: round;
		animation: dash 1.5s ease-in-out infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes dash {
		0% {
			stroke-dashoffset: 120;
		}
		50% {
			stroke-dashoffset: 40;
			transform: rotate(135deg);
		}
		100% {
			stroke-dashoffset: 120;
			transform: rotate(360deg);
		}
	}

	/* =================================
   7. Scroll to Top Button
   ================================= */
	.scroll-to-top {
		position: fixed;
		bottom: calc(var(--footer-height) + 15px);
		right: 15px;
		background: var(--color-primary);
		color: var(--color-user-text);
		border: none;
		padding: 0.6rem 0.8rem;
		border-radius: 50%;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		font-size: 1.25rem;
		cursor: pointer;
		transition:
			background 0.2s,
			transform 0.2s;
		z-index: 20;
	}
	.scroll-to-top:hover {
		background: var(--color-primary-dark);
		transform: translateY(-2px);
	}
</style>