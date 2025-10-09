<script lang="ts">
	import favicon from '$lib/assets/aitFes.svg';
	let { children } = $props();
</script>

<svelte:head>
	<title>AITfES</title>
	<meta
		name="description"
		content="AI Troubleshooting for Energy Systems (AITfES) - Your clear chat guide for step-by-step diagnostic flow and solutions in energy engineering processes and techniques."
	/>
	<meta
		name="keywords"
		content="AI Troubleshooting, Energy Systems, Energy Engineering, Diagnostic Flow, Troubleshooting"
	/>
	<meta name="author" content="AITfES" />
	<meta property="og:title" content="AITfES: AI Troubleshooting for Energy Systems" />
	<meta
		property="og:description"
		content="AITfES guides you to solutions for energy engineering processes and techniques through a focused, step-by-step diagnostic flow."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:image" content={favicon} />
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
