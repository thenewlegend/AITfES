<script lang="ts">
	import { onMount } from 'svelte';
	import { history, type ChatMessage } from '$lib/stores/stores';
	import favicon from '$lib/assets/aitFes.svg';

	// --- State Variables ---
	let isLoading = false;
	let errorMessage: string | null = null;
	let prompt = '';
	let chatContainer: HTMLDivElement;
	let inputElement: HTMLTextAreaElement;
	let showClearConfirm = false;

	// --- Device Detection ---
	let isMobile = false;

	// --- Monotonic ID generator (§1.3) ---
	let nextId = 0;
	function getNextId(): number {
		return nextId++;
	}

	// --- Greeting messages shown on a fresh session ---
	const GREETING_MESSAGES: Omit<ChatMessage, 'id'>[] = [
		{ role: 'model', text: "I'm AITfES 💡" },
		{ role: 'model', text: 'AI Troubleshooting for Energy Systems' },
		{
			role: 'model',
			text: 'My sole purpose is to guide you to a solution for energy engineering processes and techniques through a focused, step-by-step diagnostic flow.'
		}
	];

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
		history.set([]);
		nextId = 0;
		const greetings: ChatMessage[] = GREETING_MESSAGES.map((g) => ({
			id: getNextId(),
			...g
		}));
		history.update((h) => {
			h.push(...greetings);
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

	function handleKeydown(event: KeyboardEvent) {
		// On mobile, let "Enter" default to a new line. On desktop, "Enter" without Shift sends message.
		if (event.key === 'Enter' && !event.shiftKey && !isMobile) {
			event.preventDefault();
			sendMessage();
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
	async function sendMessage() {
		if (isLoading || !prompt.trim()) return;

		const userPrompt = prompt.trim();
		triggerHaptic(10); // Light tap for send
		prompt = '';
		if (inputElement) {
			inputElement.style.height = 'auto'; // Reset text area height
		}
		isLoading = true;
		errorMessage = null;

		// Add user message to history
		const userMsg: ChatMessage = { id: getNextId(), role: 'user', text: userPrompt };
		history.update((h) => {
			h.push(userMsg);
			return h;
		});

		try {
			if (chatContainer) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}

			// Build the history payload (strip `id` — server doesn't need it)
			const historyPayload = $history.map(({ role, text }) => ({ role, text }));

			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userPrompt, history: historyPayload })
			});

			if (!res.ok) {
				let statusString = `${res.status}`;
				try {
					const errorData = await res.json();
					if (errorData?.error?.status) {
						statusString = errorData.error.status;
					} else if (errorData?.status) {
						statusString = errorData.status;
					}
				} catch (jsonErr) {
					// Fallback to HTTP status code if JSON parsing fails
				}
				errorMessage = `STATUS: ${statusString} — We've encountered a brief interruption in service. Our team is already on it, and functionality will be restored promptly.`;
				return;
			}

			const data = await res.json();

			const modelMsg: ChatMessage = { id: getNextId(), role: 'model', text: data.reply };
			history.update((h) => {
				h.push(modelMsg);
				return h;
			});
		} catch (e) {
			triggerHaptic([50, 100, 50, 100, 50]);
			errorMessage =
				"STATUS: We're having trouble reaching the server. Please check your connectivity; normal service will resume shortly.";
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

	// Seed the ID counter from persisted history on mount
	onMount(() => {
		isMobile =
			typeof navigator !== 'undefined' &&
			(navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent));

		if ($history.length > 0) {
			// Resume counter from the highest existing ID + 1
			nextId = Math.max(...$history.map((m) => m.id)) + 1;
		} else {
			// Fresh session — show greeting
			handleClearHistory();
		}
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
		<div style="display:flex; align-items: center; justify-content: center; margin:auto">
			<img src={favicon} alt="logo" class="logo" />
			<h1 class="header-title">AITfES</h1>
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
						<p>Thinking...</p>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<footer class="app-footer">
		{#if errorMessage}
			<div class="system-message error">
				{errorMessage}
			</div>
		{/if}

		<form on:submit|preventDefault={sendMessage} class="prompt-form">
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
