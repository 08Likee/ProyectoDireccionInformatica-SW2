import { useEffect, useState } from 'react';
import logo from './assets/logo-informatica.jpg';
import fotoModulo from './assets/modulo-236.webp';
import fotoCampus from './assets/campus-uagrm.webp';
import fotoFacultad from './assets/espacios-ficct.webp';
import { EnlaceAdministracion, EnlaceAuditoria } from './navegacion/NavegacionInstitucional';

type Estado = 'consultando' | 'disponible' | 'no disponible';

type TarjetaServicio = {
  titulo: string;
  descripcion: string;
  etiqueta: string;
};

type DatoClave = {
  valor: string;
  etiqueta: string;
  descripcion: string;
};

type Novedad = {
  categoria: string;
  titulo: string;
  descripcion: string;
  fecha: string;
};

const servicios: TarjetaServicio[] = [
  {
    titulo: 'Gestión documental',
    descripcion: 'Control de documentos, expedientes y correspondencia institucional con trazabilidad.',
    etiqueta: 'Documentación',
  },
  {
    titulo: 'Seguimiento de trámites',
    descripcion: 'Administración de estados, actuaciones e historial para los procesos estudiantiles.',
    etiqueta: 'Trámites',
  },
  {
    titulo: 'Gestión académica',
    descripcion: 'Planificación semestral, grupos, cupos, carga docente y antecedentes de cobertura.',
    etiqueta: 'Academia',
  },
  {
    titulo: 'Búsqueda e inteligencia',
    descripcion: 'Búsqueda avanzada, OCR, asistencia inteligente y automatización de procesos.',
    etiqueta: 'Consulta',
  },
];

const datosClave: DatoClave[] = [
  {
    valor: '1987',
    etiqueta: 'Creación de la carrera',
    descripcion: 'Ingeniería Informática fue creada el 16 de julio de 1987.',
  },
  {
    valor: '187',
    etiqueta: 'Código de carrera',
    descripcion: 'Ingeniería Informática UAGRM.',
  },
  {
    valor: '236',
    etiqueta: 'Módulo universitario',
    descripcion: 'Ciudad Universitaria, avenida Busch.',
  },
];

const novedades: Novedad[] = [
  {
    categoria: 'Institucional',
    titulo: 'Bienvenida y marco institucional FICCT',
    descripcion:
      'La FICCT presenta públicamente su misión, visión y servicios de apoyo como parte de su gestión académica y administrativa.',
    fecha: 'Fuente oficial UAGRM',
  },
  {
    categoria: 'Carrera',
    titulo: 'Ingeniería Informática — formación en Ciencias de la Computación',
    descripcion:
      'La carrera se presenta como una unidad orientada a la formación de profesionales en el área de Ciencias de la Computación.',
    fecha: 'Reseña pública institucional',
  },
  {
    categoria: 'Actualidad',
    titulo: 'Proceso de acreditación y mejora continua',
    descripcion:
      'La carrera ha difundido acciones recientes de coordinación institucional orientadas a fortalecer la calidad académica.',
    fecha: 'Noticias oficiales UAGRM',
  },
];

function BadgeEstado({ estado }: { estado: Estado }) {
  const estilos = {
    consultando: 'bg-amber-50 text-amber-700 border-amber-200',
    disponible: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'no disponible': 'bg-rose-50 text-rose-700 border-rose-200',
  } satisfies Record<Estado, string>;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${estilos[estado]}`}
      role="status"
      aria-live="polite"
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
      Sistema {estado}
    </span>
  );
}

export function App() {
  const [estado, setEstado] = useState<Estado>('consultando');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let activo = true;

    setEstado('consultando');

    fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok && (await response.json()).status === 'UP')
      .then(ok => {
        if (activo) {
          setEstado(ok ? 'disponible' : 'no disponible');
        }
      })
      .catch(() => {
        if (activo) {
          setEstado('no disponible');
        }
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      activo = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [intento]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.20),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_28%),linear-gradient(180deg,_#eff8ff_0%,_#ffffff_60%,_#e0f2fe_100%)]">
        <header className="relative z-10 border-b border-white/15 bg-[#07547e]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white/95 p-2 shadow-lg ring-1 ring-sky-100">
                <img src={logo} alt="Escudo de Ingeniería Informática UAGRM" className="h-16 w-16 object-contain sm:h-18 sm:w-18" />
              </div>
              <div className="max-w-xl text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-100/90">
                  FICCT · Universidad Autónoma Gabriel René Moreno
                </p>
                <h1 className="mt-1 text-lg font-bold sm:text-2xl">Ingeniería Informática — Dirección de Carrera</h1>
                <p className="mt-1 text-sm text-sky-50/90 sm:text-base">
                  Plataforma institucional para la gestión administrativa, académica y documental.
                </p>
              </div>
            </div>
            <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-2 text-sm text-white/90">
              {[
                ['Inicio', '#inicio'],
                ['Servicios', '#servicios'],
                ['Campus', '#campus'],
                ['Novedades', '#novedades'],
                ['Contacto', '#contacto'],
              ].map(([texto, href]) => (
                <a
                  key={texto}
                  href={href}
                  className="rounded-full px-4 py-2 transition hover:bg-white/15 hover:text-white"
                >
                  {texto}
                </a>
              ))}
              <EnlaceAdministracion className="rounded-full border border-white/30 bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/18" />
              <EnlaceAuditoria className="rounded-full border border-white/30 bg-white/10 px-4 py-2 font-semibold text-white transition hover:bg-white/18" />
              <a
                href="#acceso"
                className="ml-1 rounded-full border border-white/30 bg-white/10 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-white/18"
              >
                Acceso institucional
              </a>
            </nav>
          </div>
        </header>

        <main>
          <section id="inicio" className="relative z-10 hero-institucional">
            <div className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 lg:px-10 lg:pb-20 lg:pt-20">
            <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:gap-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.20em] text-sky-50 shadow-sm backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" aria-hidden="true" />
                  Portal institucional
                </div>
                <h2 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Sistema de gestión administrativa para una dirección de carrera moderna.
                </h2>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-sky-50 sm:text-xl">
                  Centraliza documentos, trámites, planificación académica, seguimiento institucional y servicios de apoyo
                  para la Dirección de Ingeniería Informática de la FICCT.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  <a
                    href="/login"
                    className="rounded-2xl bg-white px-6 py-3 font-semibold text-sky-900 shadow-lg shadow-sky-900/20 transition hover:-translate-y-0.5 hover:bg-sky-50"
                  >
                    Acceder a la plataforma
                  </a>
                  <a
                    href="#servicios"
                    className="rounded-2xl border border-white/25 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/16"
                  >
                    Explorar servicios
                  </a>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {datosClave.map(item => (
                    <article
                      key={item.etiqueta}
                      className="rounded-3xl border border-white/20 bg-[#07547e] p-5 text-white shadow-xl"
                    >
                      <p className="text-3xl font-black text-cyan-100">{item.valor}</p>
                      <h3 className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/90">{item.etiqueta}</h3>
                      <p className="mt-2 text-sm leading-6 text-sky-50">{item.descripcion}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <section
                  id="acceso"
                  className="rounded-[28px] border border-white/20 bg-white/95 p-6 shadow-[0_24px_90px_-30px_rgba(2,132,199,0.45)] ring-1 ring-sky-100 backdrop-blur sm:p-7"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Acceso institucional</p>
                      <h3 className="mt-2 text-2xl font-bold text-slate-900">Ingreso a la plataforma</h3>
                    </div>
                    <BadgeEstado estado={estado} />
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    Accedé a tu cuenta o registrate para utilizar los servicios personales disponibles.
                  </p>
                  <div className="mt-6 space-y-3">
                    <a
                      href="/login"
                      className="block w-full rounded-2xl bg-sky-800 px-4 py-3.5 text-center font-semibold text-white shadow-sm transition hover:bg-sky-900"
                    >
                      Iniciar sesión
                    </a>
                    <a
                      href="/registro"
                      className="block w-full rounded-2xl border border-sky-200 bg-white px-4 py-3.5 text-center font-semibold text-sky-800 shadow-sm transition hover:bg-sky-50"
                    >
                      Registrar cuenta
                    </a>
                  </div>
                  <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    Nota operativa: registrar una cuenta <strong>no otorgará permisos institucionales automáticamente</strong>; la
                    autorización administrativa corresponde a la Dirección de Carrera.
                  </div>
                </section>

                <section className="rounded-[28px] border border-sky-100 bg-white/88 p-5 shadow-sm backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.20em] text-sky-700">Estado del servicio</p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">Disponibilidad del sistema</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIntento(actual => actual + 1)}
                      disabled={estado === 'consultando'}
                      className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Comprobar conexión
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Consulta la disponibilidad actual del sistema.
                  </p>
                </section>
              </div>
            </div>
            </div>
          </section>

          <section id="servicios" className="relative z-10 mx-auto max-w-7xl px-5 pt-8 pb-8 sm:px-8 lg:px-10">
            <div className="rounded-[32px] border border-sky-100 bg-white/95 p-6 shadow-[0_20px_80px_-40px_rgba(14,165,233,0.45)] ring-1 ring-slate-100 sm:p-8 lg:p-10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Servicios previstos</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Ejes funcionales de la plataforma</h2>
                </div>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  Herramientas orientadas a la organización y consulta de información institucional.
                </p>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {servicios.map(servicio => (
                  <article
                    key={servicio.titulo}
                    className="group rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_100%)] p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.20em] text-sky-800">
                      {servicio.etiqueta}
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-slate-900">{servicio.titulo}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{servicio.descripcion}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="facultad" aria-labelledby="facultad-titulo" className="franja-fotografica relative z-10">
            <div className="franja-fotografica-interior mx-auto flex w-full max-w-7xl items-center px-5 py-20 sm:px-8 lg:px-10">
              <div className="franja-fotografica-texto max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200 sm:text-sm">Nuestra facultad · Módulo 236</p>
                <h2 id="facultad-titulo" className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-7xl">
                  Una carrera conectada con su comunidad.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-8 text-sky-50 sm:text-xl">
                  Desde la Ciudad Universitaria, impulsamos una gestión que acompaña el trabajo académico y administrativo de Ingeniería Informática.
                </p>
                <a href="#campus" className="franja-fotografica-enlace mt-8 inline-flex items-center gap-3 rounded-full border border-white/35 bg-white/15 px-6 py-3 font-semibold text-white backdrop-blur-sm transition hover:bg-white/25">
                  Conocer nuestros espacios <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </section>

          <section id="campus" aria-labelledby="campus-titulo" className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.23em] text-sky-700">Nuestro entorno universitario</p>
                <h2 id="campus-titulo" className="mt-2 max-w-2xl text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  Un espacio que nos identifica
                </h2>
              </div>
              <p className="max-w-lg text-sm leading-7 text-slate-600 sm:text-base">
                Conocé algunos espacios de la comunidad universitaria a la que sirve la Dirección de Ingeniería Informática.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
              <figure className="campus-foto campus-foto-principal">
                <img src={fotoModulo} alt="Edificio del Módulo 236 de la facultad, con árboles y jardines" loading="lazy" decoding="async" />
                <figcaption>
                  <span>Módulo 236</span>
                  <strong>Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones</strong>
                </figcaption>
              </figure>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <figure className="campus-foto campus-foto-secundaria">
                  <img src={fotoCampus} alt="Vista panorámica de la Ciudad Universitaria UAGRM" loading="lazy" decoding="async" />
                  <figcaption><strong>Ciudad Universitaria UAGRM</strong></figcaption>
                </figure>
                <figure className="campus-foto campus-foto-secundaria">
                  <img src={fotoFacultad} alt="Edificio universitario de la facultad y su acceso principal" loading="lazy" decoding="async" />
                  <figcaption><strong>Espacios para nuestra comunidad académica</strong></figcaption>
                </figure>
              </div>
            </div>
          </section>

          <section id="novedades" className="novedades-inmersivas relative z-10">
            <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <article className="rounded-[32px] border border-sky-100 bg-white/95 p-7 shadow-sm ring-1 ring-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Identidad institucional</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Carrera de Ingeniería Informática</h2>
                  <p className="mt-4 text-base leading-8 text-slate-600">
                    La carrera forma profesionales en ciencias de la computación y pertenece a la FICCT de la UAGRM.
                  </p>
                  <dl className="mt-6 space-y-4">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <dt className="text-sm font-semibold text-slate-900">Unidad académica</dt>
                      <dd className="mt-1 text-sm leading-6 text-slate-600">Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones.</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <dt className="text-sm font-semibold text-slate-900">Ubicación institucional</dt>
                      <dd className="mt-1 text-sm leading-6 text-slate-600">Av. Busch, Ciudad Universitaria, Módulo 236, Santa Cruz de la Sierra.</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <dt className="text-sm font-semibold text-slate-900">Contacto referencial</dt>
                      <dd className="mt-1 text-sm leading-6 text-slate-600">(591) 3-3553636 · f_icct@uagrm.edu.bo</dd>
                    </div>
                  </dl>
                </article>

                <div className="grid gap-4">
                  {novedades.map(novedad => (
                    <article key={novedad.titulo} className="rounded-[28px] border border-sky-100 bg-white/95 p-6 shadow-sm ring-1 ring-slate-100">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.20em] text-sky-800">
                          {novedad.categoria}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{novedad.fecha}</span>
                      </div>
                      <h3 className="mt-4 text-xl font-bold text-slate-900">{novedad.titulo}</h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{novedad.descripcion}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer id="contacto" className="relative z-10 border-t border-sky-100 bg-slate-950 px-5 py-10 text-sky-50 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Dirección de Carrera</p>
              <h2 className="mt-3 text-2xl font-bold text-white">Ingeniería Informática · UAGRM</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-sky-100/88">
                Sistema de gestión administrativa, académica y documental de la Dirección de Ingeniería Informática.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-sky-100/90 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Contacto institucional</p>
                <p className="mt-2 leading-6">f_icct@uagrm.edu.bo</p>
                <p className="leading-6">(591) 3-3553636</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Ubicación</p>
                <p className="mt-2 leading-6">Av. Busch, Ciudad Universitaria</p>
                <p className="leading-6">Módulo 236 · Santa Cruz</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
