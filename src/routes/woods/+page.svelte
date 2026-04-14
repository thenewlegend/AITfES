<script lang="ts">
	import WoodsChatBox from './_components/WoodsChatBox.svelte';
	import { woodsHistory } from '$lib/stores/stores';
	import { WOODS_CONFIG } from './woods_config';

	const GREETING_MESSAGES = WOODS_CONFIG.greeting.map(g => ({
		role: 'model' as const,
		text: g.text
	}));
</script>

<svelte:head>
	<title>{WOODS_CONFIG.agent.branding} | AITfES</title>
</svelte:head>

<WoodsChatBox
	apiEndpoint="/api/woods-chat"
	historyStore={woodsHistory}
	title={WOODS_CONFIG.agent.name}
	subtitle={WOODS_CONFIG.agent.branding}
	greetings={GREETING_MESSAGES}
/>
