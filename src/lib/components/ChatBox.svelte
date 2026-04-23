<script lang="ts">
	import { onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { ChatMessage } from '$lib/stores/stores';
	import favicon from '$lib/assets/aitFes.svg';
	import { marked } from 'marked';

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

	// --- Placeholder Cycling ---
	const troubleshootingPlaceholders = [
		"My gas turbine vibration just spiked — do I need to trip it?",
	"Boiler feed pump pressure is collapsing — what should I check immediately?",
	"I’m losing condenser vacuum fast — where is the leak likely?",
	"My generator stator temperature is climbing — how dangerous is this?",
	"Cooling tower approach temperature is worsening — what’s failing?",
	"My boiler is showing sudden drum level swings — what’s causing this?",
	"The gas turbine flamed out during load — what could have triggered it?",
	"I think multiple steam traps have failed — how do I confirm quickly?",

	"My compressor is surging under load — how do I stabilise it?",
	"Lube oil pressure dropped in the turbine — should I shut down now?",
	"I’m seeing high exhaust temperature spread in the gas turbine — why?",
	"My HRSG isn’t producing expected steam — what could be limiting it?",
	"Condenser backpressure is rising — what should I inspect first?",
	"My deaerator pressure is unstable — is this a control issue?",
	"Feedwater flow is erratic to the boiler — what’s likely wrong?",
	"My ID fan is drawing excessive current — could this be a blockage?",
	"FD fan airflow seems low — how do I verify the cause?",
	"ESP outlet emissions have increased — what might have failed?",
	"My coal mill outlet temperature is too high — is this unsafe?",
	"I’m seeing slag buildup in the furnace — how do I manage it?",
	"Boiler efficiency has dropped suddenly — where should I start?",
	"My turbine isn’t picking up load properly — what could limit it?",
	"Generator rotor temperature is increasing — what should I check?",
	"I’m noticing hydrogen pressure loss in the generator — is this critical?",
	"My cooling water temperature is rising — is the condenser fouled?",
	"I suspect condenser tube fouling — how can I confirm online?",
	"Steam pressure is dropping across the system — where is the loss?",
	"My PRDS system isn’t controlling pressure properly — what’s wrong?",
	"I’m seeing abnormal vibrations in the cooling tower fan — should I stop it?",
	"My ash handling system is choking — could this affect boiler operation?",
	"I’m getting frequent turbine trips — how do I isolate the root cause?",
	"My auxiliary power consumption has increased — what system should I audit?",
	"I’m seeing high flue gas oxygen levels — is there air ingress?",
	"My burner flame looks unstable — could this lead to a trip?",
	"I’m losing superheater temperature control — what should I inspect?",
	"Why is my boiler not maintaining load despite fuel input?",
	"I’m seeing high differential pressure in the air preheater — is it fouled?"
	];
	let placeholderIndex = $state(0);

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

	// --- Core Logic ---

	/** Clears chat history and re-seeds the greeting. */
	function handleClearHistory() {
		triggerHaptic([40, 60, 40]); // Stronger haptic for deletion
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

			if (!isRetry) {
				// Optimistically update the UI with the user message
				const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: userPrompt };
				historyStore.update((h: ChatMessage[]) => {
					h.push(userMsg);
					return h;
				});

				if (chatContainer) {
					await new Promise((resolve) => setTimeout(resolve, 50));
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
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
								id: crypto.randomUUID(),
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

		// Start placeholder cycling
		const interval = setInterval(() => {
			placeholderIndex = (placeholderIndex + 1) % troubleshootingPlaceholders.length;
		}, 3000);

		if (currentHistory.length > 0) {
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

		return () => {
			clearInterval(interval);
		};
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
 
	// --- Placeholder Height Adjustment ---
	$effect(() => {
		// Only adjust if the prompt is empty, we have an input element, and it's the initial state
		if (inputElement && !prompt && $historyStore.length <= greetings.length) {
			// Trigger a re-calculation of the height based on the placeholder
			// We do this by temporarily setting the value to the placeholder, measuring, then clearing
			const originalValue = inputElement.value;
			inputElement.value = troubleshootingPlaceholders[placeholderIndex];
			inputElement.style.height = 'auto';
			inputElement.style.height = inputElement.scrollHeight + 'px';
			inputElement.value = originalValue;
		}
	});
</script>

<div class="chat-app">
	<header class="app-header">
		<div class="header-left">
			<div style="display:flex; align-items: center; gap: 12px;">
				<img src={favicon} alt="logo" class="logo" />
				<div style="display: flex; flex-direction: column;">
					<h1 class="header-title">{title}</h1>
					{#if subtitle}
						<p
							style="font-size: 0.75rem; opacity: 0.7; margin: 0; color: var(--text-secondary); font-weight: 500;"
						>
							{subtitle}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<div class="header-right">
			<a
				href="https://www.jiyon.online/AITfES.pdf"
				target="_blank"
				rel="noopener noreferrer"
				class="header-link"
				title="Technical Presentation"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
					<polyline points="10 9 9 9 8 9"></polyline>
				</svg>
				<span class="header-link-text">Project Brief</span>
			</a>
			<a
				href="https://github.com/thenewlegend/AITfES"
				target="_blank"
				rel="noopener noreferrer"
				class="header-link"
				title="View on GitHub"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path
						d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z"
					></path></svg
				>
				<span class="header-link-text">GitHub</span>
			</a>

			<button
				title="Delete History"
				onclick={openClearConfirm}
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
				<!-- <span class="clear-history-text">Clear</span> -->
			</button>
		</div>
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
							{#if message.metadata.modelInfo}
								<span>{message.metadata.modelInfo}</span>
							{/if}
							{#if message.metadata.durationMs}
								<span>| {(message.metadata.durationMs / 1000).toFixed(1)}s</span>
							{/if}
						</div>
					{/if}
					{#if message.role === 'user' && i === $historyStore.length - 1 && !isLoading}
						<button type="button" class="retry-button inline" onclick={retryLastMessage}>
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

		<form onsubmit={handleFormSubmit} class="prompt-form">
			<div class="input-wrapper">
				<textarea
					placeholder={$historyStore.length <= greetings.length
						? troubleshootingPlaceholders[placeholderIndex]
						: 'Ask follow-up...'}
					bind:value={prompt}
					bind:this={inputElement}
					class="prompt-input"
					disabled={isLoading}
					aria-label="Chat input"
					rows="1"
					use:autoResize
					onkeydown={handleKeydown}
				></textarea>
				{#if !prompt && !isLoading && $historyStore.length <= greetings.length}
					{#key placeholderIndex}
						<div class="placeholder-progress"></div>
					{/key}
				{/if}
			</div>
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
		<div class="modal-overlay" role="presentation" onclick={() => (showClearConfirm = false)}>
			<div class="modal-content" role="presentation" onclick={(e) => e.stopPropagation()}>
				<h2 class="modal-title">Clear History?</h2>
				<p class="modal-description">
					This action cannot be undone. All your chat history will be permanently deleted.
				</p>
				<div class="modal-actions">
					<button class="modal-button cancel" onclick={() => (showClearConfirm = false)}>
						Cancel
					</button>
					<button class="modal-button confirm" onclick={handleClearHistory}> Delete</button>
				</div>
			</div>
		</div>
	{/if}
</div>
