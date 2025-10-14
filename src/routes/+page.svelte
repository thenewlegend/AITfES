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
	async function handleClearHistory() {
		isLoading = true;
		history.set([]);

		try {
			chat = await createChatSession(systemInstruction);
			let idCounter = Date.now();
			history.update((h) => [
							...h,
							{ id: idCounter++, role: 'model', text: "I'm AITfES 💡" },
							{ id: idCounter++, role: 'model', text: 'AI Troubleshooting for Energy Systems' },
							{
								id: idCounter++,
								role: 'model',
								text: 'My sole purpose is to guide you to a solution for energy engineering processes and techniques through a focused, step-by-step diagnostic flow.'
							}
			]);		} catch (error) {
			console.error('Failed to renew chat session:', error);
			chat = null;
		} finally {
			isLoading = false;
		}
	}

	// Automatically attempts to start the chat session using the hardcoded key
	async function startSession() {
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
	async function sendMessage() {
		if (isLoading || !chat || !prompt.trim()) return;

		const userPrompt = prompt.trim();
		prompt = '';
		isLoading = true;
		errorMessage = null;

		const userMessageId = Date.now();
		history.update((h) => [...h, { id: userMessageId, role: 'user', text: userPrompt }]);

		try {
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}

			const result = await chat.sendMessage({ message: userPrompt });
			const modelText = result.text?.trim() || '';

			history.update((h) => [...h, { id: Date.now() + 1, role: 'model', text: modelText }]);
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

		{#each $history as message (message.id)}
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
