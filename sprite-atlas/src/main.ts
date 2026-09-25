import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const el = document.getElementById('app');
if (!el) throw new Error('缺少 #app 挂载点');
export default mount(App, { target: el });
