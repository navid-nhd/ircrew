import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { theme } from './lib/theme';

// Resolve and apply theme BEFORE React mounts so the first paint already
// reflects the user's choice (no light-then-dark flash on launch).
theme.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
