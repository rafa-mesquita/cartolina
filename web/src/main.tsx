import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './brand/tokens.css';
import './brand/global.css';
import { App } from './App';
import { installButtonSounds } from './brand/buttonSounds';

installButtonSounds();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
