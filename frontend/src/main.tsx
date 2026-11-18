import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CuentaPage } from './cuenta/CuentaPage';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === "/" ? <App /> : <CuentaPage />}</StrictMode>);
