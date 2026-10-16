import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { setLocale } from '../core/i18n.mjs';
setLocale(navigator.language);
createRoot(document.getElementById('root')!).render(<App />);
