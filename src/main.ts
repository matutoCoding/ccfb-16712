import './styles.css';
import './styles-pages.css';
import { startApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('缺少 #app 挂载节点');

startApp(root).catch((error) => {
  console.error(error);
  root.innerHTML = `<div style="padding:48px;font-family:system-ui,sans-serif"><h1>应用初始化失败</h1><pre style="background:#0f172a;color:#fff;padding:16px;border-radius:12px;overflow:auto">${error instanceof Error ? error.stack ?? error.message : String(error)}</pre></div>`;
});
