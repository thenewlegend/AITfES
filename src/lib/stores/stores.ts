// src/lib/stores/stores.ts

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

/** Maximum number of messages retained in history. */
const MAX_HISTORY_LENGTH = 200;

/** Debounce delay (ms) for localStorage writes. */
const PERSIST_DEBOUNCE_MS = 500;

// Type definition for a single chat message
export type ChatMessage = {
	id: number;
	role: 'user' | 'model';
	text: string;
};

/**
 * Runtime validation guard for ChatMessage arrays loaded from localStorage.
 * Discards corrupt or schema-mismatched data rather than crashing at render time.
 */
function isValidChatHistory(data: unknown): data is ChatMessage[] {
	return (
		Array.isArray(data) &&
		data.every(
			(m) =>
				typeof m === 'object' &&
				m !== null &&
				typeof m.id === 'number' &&
				(m.role === 'user' || m.role === 'model') &&
				typeof m.text === 'string'
		)
	);
}

// --- Custom Store for Local Storage Persistence (for History ONLY) ---

function localStore<T>(key: string, initial: T): Writable<T> {
	const store = writable(initial);
	let initialValue = initial;

	if (browser) {
		const storedValue = localStorage.getItem(key);
		if (storedValue) {
			try {
				const parsed: unknown = JSON.parse(storedValue);
				if (isValidChatHistory(parsed)) {
					initialValue = parsed as T;
				} else {
					console.warn(
						`Stored data for key '${key}' failed shape validation — using default.`
					);
					localStorage.removeItem(key);
				}
			} catch (e: unknown) {
				console.error(`Error parsing stored value for key '${key}':`, e);
				localStorage.removeItem(key);
			}
		}
		store.set(initialValue);

		// Debounced persistence — avoids redundant JSON.stringify on rapid updates
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		store.subscribe((value) => {
			if (!browser) return;

			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				try {
					// Enforce history cap before persisting
					const toPersist = Array.isArray(value)
						? (value as unknown[]).slice(-MAX_HISTORY_LENGTH)
						: value;
					localStorage.setItem(key, JSON.stringify(toPersist));
				} catch (e) {
					console.warn(`localStorage quota exceeded for key '${key}'.`, e);
				}
			}, PERSIST_DEBOUNCE_MS);
		});
	}

	return store;
}

// --- Application Stores ---

// Chat history persists across reloads
export const history = localStore<ChatMessage[]>('aitfes_history', []);
export const sinvertHistory = localStore<ChatMessage[]>('aitfes_sinvert_history', []);
