// src/lib/stores/stores.ts

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

// Type definition for a single chat message
export type ChatMessage = {
	role: 'user' | 'model'; // Who sent the message
	text: string; // The content
};

// --- Custom Store for Local Storage Persistence (for History ONLY) ---

function localStore<T>(key: string, initial: T): Writable<T> {
	const store = writable(initial);
	let initialValue = initial;

	if (browser) {
		const storedValue = localStorage.getItem(key);
		if (storedValue) {
			try {
				initialValue = JSON.parse(storedValue);
			} catch (e) {
				console.error(`Error parsing stored value for key ${key}:`, e);
			}
		}
		store.set(initialValue);

		store.subscribe((value) => {
			if (browser) {
				localStorage.setItem(key, JSON.stringify(value));
			}
		});
	}

	return store;
}

// --- Application Stores ---

// Chat history persists across reloads
export const history = localStore<ChatMessage[]>('aitfes_history', []);
