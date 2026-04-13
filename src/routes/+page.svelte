<script lang="ts">
	import ChatBox from '$lib/components/ChatBox.svelte';
	import { history } from '$lib/stores/stores';

	const GREETING_MESSAGES = [
		{ role: 'model' as const, text: "I'm AITfES 💡" },
		{ role: 'model' as const, text: 'AI Troubleshooting for Energy Systems' },
		{
			role: 'model' as const,
			text: 'My sole purpose is to guide you to a solution for energy engineering processes and techniques through a focused, step-by-step diagnostic flow.'
		}
	];
</script>

<ChatBox
	apiEndpoint="/api/chat"
	historyStore={history}
	title="AITfES"
	greetings={GREETING_MESSAGES}
/>
