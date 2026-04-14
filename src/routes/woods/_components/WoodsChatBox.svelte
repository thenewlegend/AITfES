<script lang="ts">
	import { onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { ChatMessage } from '$lib/stores/stores';
	import favicon from '$lib/assets/aitFes.svg';
	import { marked } from 'marked';

	// The user requested completely isolated logic, so we keep this component standalone within the route.
	let {
		apiEndpoint = '/api/woods-chat',
		historyStore,
		title = 'Wood Group Assistant',
		subtitle = 'Financial Analysis',
		greetings = []
	} = $props<{
		apiEndpoint?: string;
		historyStore: Writable<ChatMessage[]>;
		title?: string;
		subtitle?: string;
		greetings?: Omit<ChatMessage, 'id'>[];
	}>();

	// --- State Variables ---
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let prompt = $state('');
	let chatContainer = $state<HTMLDivElement | null>(null);
	let inputElement = $state<HTMLTextAreaElement | null>(null);
	let showClearConfirm = $state(false);
	let currentStep = $state('');
	let showQuestionsModal = $state(false);
	let abortController = $state<AbortController | null>(null);

	const presetQuestions = [
		'What financial data sources are used for this analysis?',
		'How does the Retrieval-Augmented Generation (RAG) system ensure accuracy?',
		'Can you explain the methodology behind the financial indicators provided?',
		'How did the financial performance compare between 2023 and 2024?',
		'What has been the most impactful strategic decision made by Woods over recent years?'
	];

	// --- Device Detection ---
	let isMobile = $state(false);

	// --- Haptics Logic ---
	function triggerHaptic(pattern: number | number[]) {
		if (typeof navigator !== 'undefined' && navigator.vibrate) {
			try {
				navigator.vibrate(pattern);
			} catch (e) {
				// Ignore if vibration fails
			}
		}
	}

	// --- Markdown Parser Settings ---
	function renderMarkdown(text: string) {
		try {
			// Configuration for marked (you can add more options if needed)
			return marked.parse(text);
		} catch (e) {
			console.error('Markdown error:', e);
			return text;
		}
	}

	/** Clears chat history and re-seeds the greeting. */
	function handleClearHistory() {
		triggerHaptic([40, 60, 40]);
		historyStore.set([]);
		const seededGreetings: ChatMessage[] = greetings.map((g: Omit<ChatMessage, 'id'>) => ({
			id: crypto.randomUUID(),
			...g
		}));
		historyStore.update((h: ChatMessage[]) => {
			h.push(...seededGreetings);
			return h;
		});
		errorMessage = null;
		showClearConfirm = false;
	}

	function openClearConfirm() {
		triggerHaptic([20, 10]);
		showQuestionsModal = false;
		showClearConfirm = true;
	}

	function stopAnalysis() {
		triggerHaptic([30, 30]);
		errorMessage = null;
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		isLoading = false;
		currentStep = 'Analysis stopped.';
	}

	function handlePresetClick(question: string) {
		triggerHaptic(10);
		showQuestionsModal = false;
		performMessageSend(question, true);
	}

	function handleFormSubmit(event: Event) {
		event.preventDefault();
		performMessageSend();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !isMobile) {
			event.preventDefault();
			performMessageSend();
		}
	}

	function autoResize(node: HTMLTextAreaElement) {
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = node.scrollHeight + 'px';
		};
		node.addEventListener('input', resize);
		setTimeout(resize, 0);
		return {
			destroy() {
				node.removeEventListener('input', resize);
			}
		};
	}

	async function performMessageSend(overridePrompt?: string, forceAddToHistory = false) {
		const isRetry = typeof overridePrompt === 'string' && !forceAddToHistory;
		const userPrompt = (overridePrompt ?? prompt).trim();

		if (isLoading || !userPrompt) return;

		const startTime = performance.now();
		triggerHaptic(10);
		isLoading = true;
		errorMessage = null;
		abortController = new AbortController();

		if (!isRetry) {
			prompt = '';
			if (inputElement) {
				inputElement.style.height = 'auto';
			}
		}

		currentStep = '';

		try {
			triggerHaptic(50);

			if (!isRetry) {
				const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: userPrompt };
				historyStore.update((h: ChatMessage[]) => {
					h.push(userMsg);
					return h;
				});
			}

			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
				// Smooth scroll again after a bit to ensure it stays down as rendering finishes
				setTimeout(() => {
					if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
				}, 150);
			}

			let currentHistory: ChatMessage[] = [];
			historyStore.subscribe((val: ChatMessage[]) => {
				currentHistory = val;
			})();

			const historyPayload = currentHistory.map(({ role, text }) => ({ role, text }));

			const res = await fetch(apiEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userPrompt, history: historyPayload }),
				signal: abortController.signal
			});

			if (!res.ok) {
				throw new Error(`Server error: ${res.status}`);
			}

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			if (!reader) throw new Error('Streaming failed.');

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === 'step') {
							currentStep = event.model ? `${event.label} : ${event.model}` : event.label;
						} else if (event.type === 'error') {
							errorMessage = event.error || 'Pipeline error.';
							isLoading = false;
							currentStep = '';
							return;
						} else if (event.type === 'final') {
							const endTime = performance.now();
							const durationMs = endTime - startTime;

							const modelMsg: ChatMessage = {
								id: crypto.randomUUID(),
								role: 'model',
								text: event.reply,
								metadata: {
									modelInfo: 'Analysis Complete',
									durationMs
								}
							};
							historyStore.update((h: ChatMessage[]) => {
								h.push(modelMsg);
								return h;
							});
							if (event.debug) renderDebugLogs(event.debug, event.reply);

							// Scroll to the top of the new answer
							setTimeout(() => {
								if (chatContainer) {
									const modelMessages = chatContainer.querySelectorAll('.message-row.model-row');
									const lastMessage = modelMessages[modelMessages.length - 1];
									if (lastMessage) {
										lastMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
									}
								}
							}, 100);
						} else if (event.type === 'error') {
							errorMessage = event.error || 'The system encountered an unexpected issue.';
							if (event.debug) renderDebugLogs(event.debug);
							isLoading = false;
							currentStep = '';
							return;
						}
					} catch (e) {
						console.error('Parse error:', e);
					}
				}
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				// Analysis was stopped by user, do not show error.
				return;
			}
			errorMessage = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
			currentStep = '';
			abortController = null;
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
			if (inputElement) inputElement.focus();
		}
	}

	/** Helper to render debug information in the browser console. */
	function renderDebugLogs(debug: any, reply?: string) {
		console.groupCollapsed(`[WOODS API DEBUG] ${debug.endpoint}`);
		console.log('Metadata:', debug);

		if (debug.stepLogs && Array.isArray(debug.stepLogs)) {
			console.group('Step-by-Step Pipeline Logs');
			debug.stepLogs.forEach((log: any) => {
				console.log(`[${log.timestamp}] ${log.label}:`, log.data);
			});
			console.groupEnd();
		}

		if (debug.condensedMessage) {
			console.log('--- [Condensed Search Query] ---\n', debug.condensedMessage);
		}

		if (debug.ragContextUsed) {
			console.log('--- [Retrieval Context] ---\n', debug.ragContextUsed);
		}
		if (reply) {
			console.log('Raw Final LLM Reply:', reply);
		}
		console.groupEnd();
	}

	function retryLastMessage() {
		let currentHistory: ChatMessage[] = [];
		historyStore.subscribe((val: ChatMessage[]) => {
			currentHistory = val;
		})();

		const lastUserMsg = [...currentHistory].reverse().find((m) => m.role === 'user');
		if (lastUserMsg) {
			performMessageSend(lastUserMsg.text);
		}
	}

	onMount(() => {
		isMobile =
			typeof navigator !== 'undefined' &&
			(navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent));

		let currentHistory: ChatMessage[] = [];
		historyStore.subscribe((val: ChatMessage[]) => {
			currentHistory = val;
		})();

		if (currentHistory.length > 0) {
			setTimeout(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			}, 300);
		} else {
			handleClearHistory();
		}
	});

	$effect(() => {
		let currentHistory: ChatMessage[] = [];
		historyStore.subscribe((val: ChatMessage[]) => {
			currentHistory = val;
		})();

		if (chatContainer && currentHistory.length) {
			const isNearBottom =
				chatContainer.scrollHeight - chatContainer.scrollTop < chatContainer.offsetHeight + 200;
			if (isNearBottom) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}
	});
</script>

<div class="chat-app woods-theme">
	<header class="app-header">
		<div
			style="display:flex; flex-direction:column; align-items: center; justify-content: center; margin:auto"
		>
			<div style="display:flex; align-items: center;">
				<h1 class="header-title">{title}</h1>
			</div>
			{#if subtitle}
				<p style="font-size: 0.8rem; opacity: 0.8; margin-top: -5px; color: var(--text-color);">
					{subtitle}
				</p>
			{/if}
		</div>

		<button
			title="Delete History"
			onclick={openClearConfirm}
			class="clear-history-button"
			aria-label="Clear Chat History"
		>
			<svg fill="currentColor" viewBox="0 0 14 14" style="width: 18px; height: 18px;">
				<path
					d="m 9,9 0.444445,0 0,3.11111 -0.444445,0 z m -0.888889,0 0.444445,0 0,4 -0.444445,0 z m 1.777778,0 0.444444,0 0,3.55556 -0.444444,0 z m -2.666667,0 0.444445,0 0,3.55556 -0.444445,0 z m 4.444445,-1.77778 0,0.88889 -9.333334,0 0,-0.88889 -0.444444,0 0,2.22222 0.444444,0 0,-0.88888 9.333334,0 0,0.88888 0.444444,0 0,-2.22222 z M 10.777778,9 l 0.444444,0 0,4 -0.444444,0 z m -4.444445,0 0.444445,0 0,4 -0.444445,0 z M 11.222222,4.55556 9,4.55556 c -0.488877,0 -0.888889,-0.39999 -0.888889,-0.88889 L 8.111111,1 3.666667,1 C 3.177766,1 2.777778,1.39999 2.777778,1.88889 l 0,5.77778 8.444444,0 0,-3.11111 z M 2.777778,9 l 0.444444,0 0,4 -0.444444,0 z M 9,4.11111 l 2.222222,0 L 8.555556,1 l 0,2.66667 C 8.555556,3.93333 8.77779,4.11111 9,4.11111 Z M 4.555556,9 5,9 5,13 4.555556,13 Z m -0.888889,0 0.444444,0 0,3.55556 -0.444444,0 z m 1.777778,0 0.444444,0 0,3.11111 -0.444444,0 z"
				></path>
			</svg>
		</button>
	</header>

	<div class="chat-history-container" aria-live="polite" bind:this={chatContainer}>
		{#each $historyStore as message, i (message.id)}
			<div class="message-row {message.role === 'user' ? 'user-row' : 'model-row'}">
				<div class="chat-message {message.role}">
					<p class="message-role">{message.role === 'user' ? 'You' : title}</p>
					<div class="message-content">
						{@html renderMarkdown(message.text)}
					</div>
					{#if message.role === 'model' && message.metadata}
						<div class="message-metadata">
							{#if message.metadata.modelInfo}<span>{message.metadata.modelInfo}</span>{/if}
							{#if message.metadata.durationMs}<span
									>| {(message.metadata.durationMs / 1000).toFixed(1)}s</span
								>{/if}
						</div>
					{/if}
					{#if message.role === 'user' && i === $historyStore.length - 1 && !isLoading}
						<button
							type="button"
							class="retry-button inline"
							onclick={() => {
								triggerHaptic(10);
								retryLastMessage();
							}}>Retry</button
						>
					{/if}
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="message-row model-row">
				<div class="chat-message model loading">
					<div class="loading-animation">
						<svg class="spinner" viewBox="0 0 24 24"
							><circle cx="12" cy="12" r="10" stroke-width="4" fill="none" stroke="currentColor"
							></circle><path
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								fill="var(--color-primary)"
							></path></svg
						>
						<p>Analyzing...</p>
					</div>
					{#if currentStep}<div class="message-metadata" style="margin-left: 12px; opacity: 0.6;">
							{currentStep}
						</div>{/if}
				</div>
			</div>
		{/if}
	</div>

	<footer class="app-footer">
		{#if errorMessage}<div class="system-message error"><span>{errorMessage}</span></div>{/if}
		<form onsubmit={handleFormSubmit} class="prompt-form">
			<button
				type="button"
				class="questions-toggle-button"
				onclick={() => {
					triggerHaptic(10);
					showQuestionsModal = true;
				}}
				title="Preset Questions"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"></circle>
					<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
					<line x1="12" y1="17" x2="12.01" y2="17"></line>
				</svg>
			</button>
			<textarea
				placeholder="Query"
				bind:value={prompt}
				bind:this={inputElement}
				class="prompt-input"
				disabled={isLoading}
				rows="1"
				use:autoResize
				onkeydown={handleKeydown}
			></textarea>
			<button
				title={isLoading ? 'Stop Analysis' : 'Send Query'}
				type={isLoading ? 'button' : 'submit'}
				class="send-button {isLoading ? 'stop-active' : ''}"
				onclick={isLoading ? stopAnalysis : () => triggerHaptic(10)}
				disabled={!isLoading && (!prompt || !prompt.trim())}
			>
				{#if isLoading}
					<div class="stop-content">
						<div class="stop-icon"></div>
						<span>Stop</span>
					</div>
				{:else}
					Analyze
				{/if}
			</button>
		</form>
	</footer>

	{#if showClearConfirm}
		<div class="modal-overlay" role="presentation" onclick={() => (showClearConfirm = false)}>
			<div class="modal-content" role="presentation" onclick={(e) => e.stopPropagation()}>
				<h2 class="modal-title">Clear Analysis History?</h2>
				<p class="modal-description">This will clear your current financial analysis session.</p>
				<div class="modal-actions">
					<button
						class="modal-button cancel"
						onclick={() => {
							triggerHaptic(10);
							showClearConfirm = false;
						}}>Cancel</button
					>
					<button
						class="modal-button confirm"
						onclick={() => {
							triggerHaptic([40, 60, 40]);
							handleClearHistory();
						}}>Clear</button
					>
				</div>
			</div>
		</div>
	{/if}

	{#if showQuestionsModal}
		<div class="modal-overlay" role="presentation" onclick={() => (showQuestionsModal = false)}>
			<div
				class="modal-content questions-modal"
				role="presentation"
				onclick={(e) => e.stopPropagation()}
			>
				<h2 class="modal-title">Analysis Starters</h2>
				<p class="modal-description">Select a formal query to begin the analysis immediately.</p>
				<div class="preset-questions-list">
					{#each presetQuestions as question}
						<button class="preset-question-item" onclick={() => handlePresetClick(question)}>
							{question}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					{/each}
				</div>
				<button
					class="modal-button cancel"
					style="margin-top: 20px;"
					onclick={() => {
						triggerHaptic(10);
						showQuestionsModal = false;
					}}>Close</button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Local isolation styles for Woods */
	:root {
		--woods-primary: #10b981;
		--woods-bg: #0a0a0a;
		--woods-surface: rgba(15, 15, 18, 0.85);
		--woods-border: rgba(255, 255, 255, 0.08);
		--woods-text: #ffffff;
		--woods-text-sec: #a1a1aa;
	}

	.chat-app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		width: 100%;
		background-color: var(--woods-bg);
		color: var(--woods-text);
		font-family: 'Outfit', sans-serif;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
	}

	.app-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 32px;
		background: var(--woods-surface);
		backdrop-filter: blur(16px);
		border-bottom: 1px solid var(--woods-border);
		z-index: 10;
	}

	.header-title {
		font-size: 1.5rem;
		font-weight: 600;
		background: linear-gradient(90deg, #10b981, #34d399);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.chat-history-container {
		flex-grow: 1;
		overflow-y: auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.message-row {
		display: flex;
		width: 100%;
	}
	.user-row {
		justify-content: flex-end;
	}
	.model-row {
		justify-content: flex-start;
	}

	.chat-message {
		padding: 16px 24px;
		border-radius: 20px;
		max-width: 75%;
		animation: slideUp 0.4s ease forwards;
		opacity: 0;
		transform: translateY(15px);
	}

	@keyframes slideUp {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.chat-message.user {
		background: linear-gradient(135deg, #10b981, #34d399);
		color: #000;
		border-bottom-right-radius: 4px;
	}

	.chat-message.model {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--woods-border);
		border-bottom-left-radius: 4px;
		backdrop-filter: blur(8px);
	}

	.message-role {
		font-weight: 700;
		font-size: 0.75rem;
		margin-bottom: 8px;
		opacity: 0.5;
	}

	.message-content {
		font-size: 1.05rem;
		line-height: 1.6;
	}

	.message-content :global(p) {
		margin-bottom: 12px;
	}

	.message-content :global(p:last-child) {
		margin-bottom: 0;
	}

	/* Markdown Table Styling */
	.message-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 16px 0;
		font-size: 0.95rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--woods-border);
	}

	.message-content :global(th),
	.message-content :global(td) {
		padding: 12px 16px;
		text-align: left;
		border-bottom: 1px solid var(--woods-border);
	}

	.message-content :global(th) {
		background: rgba(255, 255, 255, 0.08);
		font-weight: 600;
		color: var(--woods-primary);
	}

	.message-content :global(tr:last-child td) {
		border-bottom: none;
	}

	/* Lists */
	.message-content :global(ul),
	.message-content :global(ol) {
		margin: 12px 0 12px 24px;
	}

	.message-content :global(li) {
		margin-bottom: 6px;
	}

	/* Headers */
	.message-content :global(h1),
	.message-content :global(h2),
	.message-content :global(h3) {
		margin: 20px 0 12px 0;
		font-weight: 600;
		color: var(--woods-primary);
	}

	.message-content :global(h3) {
		font-size: 1.2rem;
	}

	/* Bold */
	.message-content :global(strong) {
		color: var(--woods-primary);
		font-weight: 600;
	}

	.app-footer {
		padding: 20px 32px;
		background: var(--woods-surface);
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--woods-border);
	}

	.prompt-form {
		display: flex;
		gap: 16px;
		max-width: 1200px;
		margin: 0 auto;
	}

	.prompt-input {
		flex-grow: 1;
		padding: 16px 24px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--woods-border);
		border-radius: 24px;
		color: #fff;
		resize: none;
	}

	.send-button {
		padding: 16px 28px;
		border-radius: 30px;
		background: #fff;
		color: #000;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		border: none;
		min-width: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button.stop-active {
		background: #ef4444;
		color: #fff;
		box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
	}

	.stop-content {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.stop-icon {
		width: 12px;
		height: 12px;
		background: #fff;
		border-radius: 2px;
	}

	.questions-toggle-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--woods-border);
		border-radius: 50%;
		width: 54px;
		height: 54px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--woods-text-sec);
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.questions-toggle-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border-color: var(--woods-primary);
	}

	.questions-toggle-button svg {
		width: 24px;
		height: 24px;
	}

	.spinner {
		width: 22px;
		height: 22px;
		animation: spin 1s linear infinite;
		color: #10b981;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.clear-history-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--woods-border);
		border-radius: 50%;
		padding: 10px;
		cursor: pointer;
	}

	.system-message.error {
		background-color: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.15);
		color: #fca5a5;
		line-height: 1.5;
		max-width: 600px;
		max-height: 100px;
		overflow-y: auto;
		word-break: break-word;
		overflow-wrap: break-word;
		margin: 0 auto 16px auto;
		padding: 10px 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		border-radius: 12px;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(12px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-content {
		background: #1e293b;
		border: 1px solid var(--woods-border);
		border-radius: 28px;
		padding: 40px;
		text-align: center;
		max-width: 400px;
	}

	.modal-button.confirm {
		background: #ef4444;
		color: #fff;
		padding: 12px 24px;
		border-radius: 12px;
		border: none;
		cursor: pointer;
	}
	.modal-button.cancel {
		background: transparent;
		color: #fff;
		padding: 12px 24px;
		cursor: pointer;
		border: none;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.modal-button.cancel:hover {
		opacity: 1;
	}

	/* Questions Modal Specifics */
	.questions-modal {
		max-width: 500px;
		width: 90%;
	}

	.preset-questions-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 24px;
		text-align: left;
		max-height: 60vh;
		overflow-y: auto;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE/Edge */
	}

	.preset-questions-list::-webkit-scrollbar {
		display: none; /* Chrome, Safari, Edge */
	}

	.preset-question-item {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--woods-border);
		padding: 16px 20px;
		border-radius: 16px;
		color: var(--woods-text);
		text-align: left;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.preset-question-item:hover {
		background: rgba(16, 185, 129, 0.1);
		border-color: var(--woods-primary);
		transform: translateX(4px);
	}

	.preset-question-item svg {
		width: 18px;
		height: 18px;
		opacity: 0;
		transition: all 0.2s ease;
		color: var(--woods-primary);
	}

	.preset-question-item:hover svg {
		opacity: 1;
	}
</style>
