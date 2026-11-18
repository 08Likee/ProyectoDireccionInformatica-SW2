import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CuentaPage } from './cuenta/CuentaPage';
import { AutorizacionesPage } from './administracion/AutorizacionesPage';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === "/" ? <App /> : window.location.pathname === "/administracion/autorizaciones" ? <AutorizacionesPage /> : <CuentaPage />}</StrictMode>);
