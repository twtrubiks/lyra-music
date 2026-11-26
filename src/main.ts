import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { installGlobalErrorLogging } from '$lib/logic/frontend-log';
import { installNativeContextMenuBlock } from '$lib/logic/native-context-menu';

// Before mounting, so errors thrown while the app starts are recorded too.
installGlobalErrorLogging(window);
installNativeContextMenuBlock(document);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
