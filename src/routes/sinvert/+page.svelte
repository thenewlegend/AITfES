<script lang="ts">
	import ChatBox from '$lib/components/ChatBox.svelte';
	import { sinvertHistory } from '$lib/stores/stores';

	const GREETING_MESSAGES = [
		{ role: 'model' as const, text: "I'm AITfES 💡 - SINVERT Support" },
		{ role: 'model' as const, text: 'Specialized diagnostic flow for SINVERT PVS 500 / PVS 600.' },
		{
			role: 'model' as const,
			text: 'I can search the knowledge base for SINVERT PVS 500 / 600 issues. Ask me anything about these products.'
		}
	];
</script>

<svelte:head>
	<title>AITfES - SINVERT PVS 500 / 600</title>
</svelte:head>

<ChatBox
	apiEndpoint="/api/sinvert-chat"
	historyStore={sinvertHistory}
	title="AITfES"
	subtitle="SINVERT PVS 500 / PVS 600"
	greetings={GREETING_MESSAGES}
/>
