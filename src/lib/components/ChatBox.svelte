<script lang="ts">
	import { onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { ChatMessage } from '$lib/stores/stores';
	import favicon from '$lib/assets/aitFes.svg';

	let {
		apiEndpoint = '/api/chat',
		historyStore,
		title = 'AITfES',
		subtitle = '',
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

	// --- Device Detection ---
	let isMobile = $state(false);

	// --- Monotonic ID generator (§1.3) ---
	let nextId = $state(0);
	function getNextId(): number {
		return nextId++;
	}

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

	// --- Core Logic ---

	/** Clears chat history and re-seeds the greeting. */
	function handleClearHistory() {
		triggerHaptic([40, 60, 40]); // Stronger haptic for deletion
		historyStore.set([]);
		nextId = 0;
		const seededGreetings: ChatMessage[] = greetings.map((g: Omit<ChatMessage, 'id'>) => ({
			id: getNextId(),
			...g
		}));
		historyStore.update((h: ChatMessage[]) => {
			h.push(...seededGreetings);
			return h;
		});
		errorMessage = null;
		showClearConfirm = false;
	}

	/** Opens the confirmation modal. */
	function openClearConfirm() {
		triggerHaptic([20, 10]); // Soft double tap
		showClearConfirm = true;
	}

	function handleFormSubmit(event: Event) {
		event.preventDefault();
		performMessageSend();
	}

	function handleKeydown(event: KeyboardEvent) {
		// On mobile, let "Enter" default to a new line. On desktop, "Enter" without Shift sends message.
		if (event.key === 'Enter' && !event.shiftKey && !isMobile) {
			event.preventDefault();
			performMessageSend();
		}
	}

	function autoResize(node: HTMLTextAreaElement) {
		const resize = () => {
			node.style.height = 'auto'; // Reset height to recalculate
			node.style.height = node.scrollHeight + 'px';
		};
		node.addEventListener('input', resize);
		setTimeout(resize, 0); // initial sizing
		return {
			destroy() {
				node.removeEventListener('input', resize);
			}
		};
	}

	/** Sends a message to the server API and appends the response to history. */
	async function performMessageSend(overridePrompt?: string) {
		const isRetry = typeof overridePrompt === 'string';
		const userPrompt = (isRetry ? overridePrompt : prompt).trim();

		if (isLoading || !userPrompt) return;

		const startTime = performance.now();
		triggerHaptic(10); // Light tap for send
		isLoading = true;
		errorMessage = null;

		if (!isRetry) {
			prompt = '';
			if (inputElement) {
				inputElement.style.height = 'auto'; // Reset text area height
			}
		}

		currentStep = ''; // Reset for the generic "Thinking..." initially

		try {
			// Trigger haptic feedback for mobile
			triggerHaptic(50);

			// Optimistically update the UI with the user message
			const userMsg: ChatMessage = { id: getNextId(), role: 'user', text: userPrompt };
			historyStore.update((h: ChatMessage[]) => {
				h.push(userMsg);
				return h;
			});

			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}

			// Capture current history
			let currentHistory: ChatMessage[] = [];
			historyStore.subscribe((val: ChatMessage[]) => {
				currentHistory = val;
			})();

			const historyPayload = currentHistory.map(({ role, text }) => ({ role, text }));

			const res = await fetch(apiEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userPrompt, history: historyPayload })
			});

			if (!res.ok) {
				throw new Error(`Server error: ${res.status}`);
			}

			// Streaming response handling
			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let finalStatus = '';

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
							finalStatus = currentStep; // Keep track of the last known status
						} else if (event.type === 'error') {
							// Clean up the error message for the UI
							let cleanError = event.error || 'The system encountered an unexpected issue with the RAG pipeline.';
							if (cleanError.length > 200) {
								cleanError = cleanError.slice(0, 197) + '...';
							}
							errorMessage = cleanError;
							
							if (event.debug) renderDebugLogs(event.debug);
							isLoading = false;
							currentStep = '';
							return;
						} else if (event.type === 'final') {
							if (event.debug) renderDebugLogs(event.debug, event.reply);

							const endTime = performance.now();
							const durationMs = endTime - startTime;
							finalStatus = 'Query successful'; // Display success at the end

							const modelMsg: ChatMessage = {
								id: getNextId(),
								role: 'model',
								text: event.reply,
								metadata: {
									modelInfo: finalStatus,
									durationMs
								}
							};
							historyStore.update((h: ChatMessage[]) => {
								h.push(modelMsg);
								return h;
							});
						}
					} catch (e) {
						console.error('Parse error:', e);
					}
				}
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
			currentStep = '';
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
			if (inputElement) inputElement.focus();
		}
	}

	/** Helper to render debug information in the browser console. */
	function renderDebugLogs(debug: any, reply?: string) {
		console.groupCollapsed(`[AITfES API DEBUG] ${debug.endpoint}`);
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
	// Seed the ID counter from persisted history on mount
	onMount(() => {
		isMobile =
			typeof navigator !== 'undefined' &&
			(navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent));

		let currentHistory: ChatMessage[] = [];
		historyStore.subscribe((val: ChatMessage[]) => {
			currentHistory = val;
		})(); // Immediately unsubscribe

		if (currentHistory.length > 0) {
			// Resume counter from the highest existing ID + 1
			nextId = Math.max(...currentHistory.map((m) => m.id)) + 1;

			// Scroll to bottom on reload to see last messages
			setTimeout(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			}, 300);
		} else {
			// Fresh session — show greeting
			handleClearHistory();
		}
	});

	// Reactive statement for auto-scrolling on history change
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

<div class="chat-app">
	<header class="app-header">
		<div
			style="display:flex; flex-direction:column; align-items: center; justify-content: center; margin:auto"
		>
			<div style="display:flex; align-items: center;">
				<img src={favicon} alt="logo" class="logo" />
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
			on:click={openClearConfirm}
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
	</header>

	<div class="chat-history-container" aria-live="polite" bind:this={chatContainer}>
		{#each $historyStore as message, i (message.id)}
			<div class="message-row {message.role === 'user' ? 'user-row' : 'model-row'}">
				<div class="chat-message {message.role}">
					<p class="message-role">{message.role === 'user' ? 'You' : title}</p>
					<div class="message-content">
						{message.text}
					</div>
					{#if message.role === 'model' && message.metadata}
						<div class="message-metadata">
							{#if message.metadata.modelInfo}
								<span>{message.metadata.modelInfo}</span>
							{/if}
							{#if message.metadata.durationMs}
								<span>| {(message.metadata.durationMs / 1000).toFixed(1)}s</span>
							{/if}
						</div>
					{/if}
					{#if message.role === 'user' && i === $historyStore.length - 1 && !isLoading}
						<button type="button" class="retry-button inline" on:click={retryLastMessage}>
							Retry
						</button>
					{/if}
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
						<p>Thinking...</p>
					</div>
					{#if currentStep}
						<div class="message-metadata" style="margin-left: 12px; opacity: 0.6;">
							{currentStep}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<footer class="app-footer">
		{#if errorMessage}
			<div class="system-message error">
				<span>{errorMessage}</span>
			</div>
		{/if}

		<form on:submit={handleFormSubmit} class="prompt-form">
			<textarea
				placeholder="Ask me anything..."
				bind:value={prompt}
				bind:this={inputElement}
				class="prompt-input"
				disabled={isLoading}
				aria-label="Chat input"
				rows="1"
				use:autoResize
				on:keydown={handleKeydown}
			></textarea>
			<button
				title="Send Query"
				type="submit"
				class="send-button"
				disabled={isLoading || !prompt || !prompt.trim()}
			>
				Send
			</button>
		</form>
	</footer>

	{#if showClearConfirm}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-overlay" on:click={() => (showClearConfirm = false)}>
			<div class="modal-content" on:click|stopPropagation>
				<h2 class="modal-title">Clear History?</h2>
				<p class="modal-description">
					This action cannot be undone. All your chat history will be permanently deleted.
				</p>
				<div class="modal-actions">
					<button class="modal-button cancel" on:click={() => (showClearConfirm = false)}>
						Cancel
					</button>
					<button class="modal-button confirm" on:click={handleClearHistory}> Delete</button>
				</div>
			</div>
		</div>
	{/if}
</div>
