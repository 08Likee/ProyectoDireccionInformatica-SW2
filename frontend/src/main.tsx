import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CuentaPage } from './cuenta/CuentaPage';
import { AutorizacionesPage } from './administracion/AutorizacionesPage';
import { AuditoriaPage } from './auditoria/AuditoriaPage';
import { DocumentosPage } from './documentos/DocumentosPage';
import { ExpedientesPage } from './expedientes/ExpedientesPage';
import { CorrespondenciaPage } from './correspondencia/CorrespondenciaPage';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname === "/" ? <App /> : window.location.pathname === "/administracion/autorizaciones" ? <AutorizacionesPage /> : window.location.pathname === "/administracion/auditoria" ? <AuditoriaPage /> : window.location.pathname === "/documentos" ? <DocumentosPage /> : window.location.pathname === "/expedientes" ? <ExpedientesPage /> : window.location.pathname === "/correspondencia" ? <CorrespondenciaPage /> : <CuentaPage />}</StrictMode>);
