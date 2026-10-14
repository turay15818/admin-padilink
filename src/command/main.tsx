import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GLOBAL_CSS } from './theme';

// One skin, injected once. The command centre is dark by design — see theme.ts.
const style = document.createElement('style');
style.textContent = GLOBAL_CSS;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
