import { describe, it, expect } from 'vitest';
import {
  isValidHost,
  normalizeHosts,
  renderTraefikDynamicConfig,
  buildDynamicConfigFile,
} from './reconciliador-dominios.mjs';

const WORKER_URL = 'http://r360-worker:8787';
const MEDIA_URL = 'http://r360-media:80';

describe('isValidHost', () => {
  it('acepta un host normal de plataforma', () => {
    expect(isValidHost('acme.recorrido360.com')).toBe(true);
  });

  it('acepta un dominio propio de cliente sin subdominio', () => {
    expect(isValidHost('milomas.com')).toBe(true);
  });

  it('rechaza un intento de inyección con backtick', () => {
    // Si esto pasara la validación, cerraría el `Host(\`...\`)` de Traefik
    // antes de tiempo e inyectaría configuración propia en el YAML.
    expect(isValidHost('evil.com`)\n  otra-clave: true #')).toBe(false);
  });

  it('rechaza puntos dobles (label vacío)', () => {
    expect(isValidHost('acme..recorrido360.com')).toBe(false);
  });

  it('rechaza un host sin ningún punto (no es un hostname completo)', () => {
    expect(isValidHost('acme')).toBe(false);
  });

  it('rechaza un label que empieza o termina con guion', () => {
    expect(isValidHost('-acme.recorrido360.com')).toBe(false);
    expect(isValidHost('acme-.recorrido360.com')).toBe(false);
  });

  it('rechaza espacios y otros caracteres fuera de [a-z0-9.-]', () => {
    expect(isValidHost('acme empresa.com')).toBe(false);
    expect(isValidHost('acme$.com')).toBe(false);
  });

  it('rechaza un host absurdamente largo', () => {
    const label = 'a'.repeat(60);
    const host = `${Array(6).fill(label).join('.')}.com`; // > 253 caracteres
    expect(host.length).toBeGreaterThan(253);
    expect(isValidHost(host)).toBe(false);
  });

  it('rechaza valores que no son string', () => {
    expect(isValidHost(null)).toBe(false);
    expect(isValidHost(undefined)).toBe(false);
    expect(isValidHost(123)).toBe(false);
  });
});

describe('normalizeHosts', () => {
  it('deduplica y ordena alfabéticamente, sin importar el orden de entrada', () => {
    const { hosts } = normalizeHosts(['zeta.example.com', 'alfa.example.com', 'zeta.example.com']);
    expect(hosts).toEqual(['alfa.example.com', 'zeta.example.com']);
  });

  it('normaliza mayúsculas y espacios antes de deduplicar', () => {
    const { hosts } = normalizeHosts([' Acme.Example.com ', 'acme.example.com']);
    expect(hosts).toEqual(['acme.example.com']);
  });

  it('separa los hosts inválidos en "invalid", incluyendo el intento con backtick', () => {
    const raw = ['acme.example.com', 'evil.com`) # inyectado', 'otro..invalido.com'];
    const { hosts, invalid } = normalizeHosts(raw);
    expect(hosts).toEqual(['acme.example.com']);
    expect(invalid).toContain('evil.com`) # inyectado');
    expect(invalid).toContain('otro..invalido.com');
    expect(invalid).toHaveLength(2);
  });
});

describe('renderTraefikDynamicConfig — omisión de "routers" sin hosts', () => {
  it('no emite la clave "routers" (ni "http:") cuando la lista de hosts está vacía', () => {
    const yaml = renderTraefikDynamicConfig([], {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });
    // Traefik v3 rechaza `routers: {}` y tira abajo TODA la recarga de
    // configuración dinámica -- por eso la salida sin hosts no debe tener
    // ni la clave "routers" ni la sección "http:" en absoluto. Se compara
    // sólo contra las líneas que NO son comentario, porque el propio
    // comentario explicativo de esta rama menciona "http:" en prosa.
    const codeLines = yaml
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(codeLines).not.toContain('routers:');
    expect(codeLines).not.toContain('http:');
  });

  it('sigue siendo un archivo válido (con el comentario explicativo) aunque no haya hosts', () => {
    const yaml = renderTraefikDynamicConfig([], {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });
    expect(yaml).toContain('Sin hosts para enrutar');
  });
});

describe('renderTraefikDynamicConfig — determinismo', () => {
  const hosts = ['acme.recorrido360.com', 'milomas.com'];
  const opts = { routerPrefix: 'r360-sub', serviceUrl: WORKER_URL, mediaServiceUrl: MEDIA_URL };

  it('la misma entrada produce siempre exactamente la misma salida', () => {
    const first = renderTraefikDynamicConfig(hosts, opts);
    const second = renderTraefikDynamicConfig([...hosts], { ...opts });
    expect(first).toBe(second);
  });

  it('el nombre de router es estable para un mismo host entre corridas', () => {
    const a = renderTraefikDynamicConfig(['acme.recorrido360.com'], opts);
    const b = renderTraefikDynamicConfig(['acme.recorrido360.com'], opts);
    const routerName = a.match(/^ {4}(r360-sub-[0-9a-f]{12}):$/m)?.[1];
    expect(routerName).toBeTruthy();
    expect(b).toContain(`    ${routerName}:`);
  });
});

describe('renderTraefikDynamicConfig — estructura de cada host', () => {
  it('arma un router websecure con TLS y un router web con redirect, contra el mismo service', () => {
    const yaml = renderTraefikDynamicConfig(['acme.recorrido360.com'], {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });

    expect(yaml).toMatch(/rule: "Host\(`acme\.recorrido360\.com`\)"/);
    expect(yaml).toContain('- websecure');
    expect(yaml).toContain('certResolver: letsencrypt');
    expect(yaml).toContain('- web');
    expect(yaml).toContain('redirectScheme:');
    expect(yaml).toContain('scheme: https');
    expect(yaml).toContain('permanent: true');
    expect(yaml).toContain('passHostHeader: true');
    expect(yaml).toContain(`url: "${WORKER_URL}"`);

    // Un único service compartido por todos los routers generales de este archivo.
    const serviceMatches = yaml.match(/^  services:\n {4}r360-sub-service:/m);
    expect(serviceMatches).toBeTruthy();
  });

  it('nunca deja pasar un host inválido hacia el YAML final, ni con backtick', () => {
    // renderTraefikDynamicConfig confía en su entrada (ya normalizada), así
    // que este test prueba el camino completo: buildDynamicConfigFile es
    // quien filtra antes de renderizar.
    const raw = ['acme.recorrido360.com', 'ataque`.recorrido360.com'];
    const { yaml, invalid } = buildDynamicConfigFile(raw, {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });
    expect(yaml).not.toContain('ataque`');
    expect(invalid).toEqual(['ataque`.recorrido360.com']);
  });
});

describe('renderTraefikDynamicConfig — router de media (video/tiles con Range, aparte del worker)', () => {
  const host = 'acme.recorrido360.com';
  const opts = { routerPrefix: 'r360-sub', serviceUrl: WORKER_URL, mediaServiceUrl: MEDIA_URL };

  function routersOf(yaml) {
    // Nombres de router: sólo lo que cuelga de "  routers:" (2 espacios,
    // clave de tope), antes de que empiece "  middlewares:" (también 2
    // espacios, clave de tope). Ojo: cada router "-web" trae su PROPIA
    // lista "      middlewares:" (6 espacios) -- un indexOf/slice sin anclar
    // a inicio de línea con la indentación exacta la confunde con la de
    // tope, porque "  middlewares:" es substring de "      middlewares:".
    // Por eso acá se busca con regex ancladas a `^` y a la indentación
    // exacta, no con indexOf de texto plano.
    const startMatch = yaml.match(/^ {2}routers:$/m);
    const endMatch = yaml.match(/^ {2}middlewares:$/m);
    const section = yaml.slice(startMatch.index, endMatch.index);
    return [...section.matchAll(/^ {4}([a-z0-9-]+):$/gm)].map((m) => m[1]);
  }

  it('emite exactamente los tres routers esperados por host: general, media y redirect', () => {
    const yaml = renderTraefikDynamicConfig([host], opts);
    const names = routersOf(yaml);
    expect(names).toContain('r360-sub-4e54a2e74f52'); // general (websecure)
    expect(names).toContain('r360-sub-4e54a2e74f52-media'); // media (websecure)
    expect(names).toContain('r360-sub-4e54a2e74f52-web'); // redirect (web)
    expect(names).toHaveLength(3);
  });

  it('con dos hosts, son exactamente seis routers (tres por host)', () => {
    const yaml = renderTraefikDynamicConfig([host, 'milomas.com'], opts);
    expect(routersOf(yaml)).toHaveLength(6);
  });

  it('el router de media lleva el PathRegexp de rutas versionadas y la prioridad correcta', () => {
    const yaml = renderTraefikDynamicConfig([host], opts);
    const mediaBlock = yaml.slice(yaml.indexOf('r360-sub-4e54a2e74f52-media:'));

    expect(mediaBlock).toMatch(
      /rule: "Host\(`acme\.recorrido360\.com`\) && PathRegexp\(`\^\/t\/\[\^\/\]\+\/\[\^\/\]\+\/v\[0-9\]\+\/`\)"/,
    );
    expect(mediaBlock).toMatch(/priority: 100\b/);
  });

  it('el router de media apunta al service de media, NO al del worker', () => {
    const yaml = renderTraefikDynamicConfig([host], opts);
    const mediaBlock = yaml.slice(
      yaml.indexOf('r360-sub-4e54a2e74f52-media:'),
      yaml.indexOf('r360-sub-4e54a2e74f52-web:'),
    );
    expect(mediaBlock).toContain('service: r360-sub-media-service');
    expect(mediaBlock).not.toContain('service: r360-sub-service');

    // Y el service de media, aparte, apunta a mediaServiceUrl (no a serviceUrl).
    expect(yaml).toMatch(/r360-sub-media-service:\n {6}loadBalancer:\n {8}servers:\n {10}- url: "http:\/\/r360-media:80"/);
  });

  it('el router general (no-media) apunta al service del worker y lleva prioridad baja explícita', () => {
    const yaml = renderTraefikDynamicConfig([host], opts);
    // "r360-sub-<hash>:" (con los dos puntos pegados al hash) sólo matchea
    // la línea del router general -- la del router de media es
    // "r360-sub-<hash>-media:", que tiene un "-" en el medio, no ":".
    const generalStart = yaml.indexOf('r360-sub-4e54a2e74f52:');
    const generalBlock = yaml.slice(generalStart, yaml.indexOf('r360-sub-4e54a2e74f52-media:'));
    expect(generalBlock).toContain('service: r360-sub-service');
    expect(generalBlock).not.toContain('r360-sub-media-service');
    expect(generalBlock).toMatch(/priority: 1\b/);
  });

  it('la regla de media SIEMPRE lleva el Host de ese proyecto -- nunca sólo PathRegexp', () => {
    // Un PathRegexp sin Host sería una regla global: se comería esa ruta en
    // TODOS los hosts que atiende el mismo Traefik, incluidos proyectos
    // ajenos que viven en el mismo servidor. Cada regla de media generada
    // tiene que traer su propio Host(`...`) adelante del "&&".
    const yaml = renderTraefikDynamicConfig(['acme.recorrido360.com', 'milomas.com'], opts);
    const mediaRules = [...yaml.matchAll(/-media:\n\s+rule: "([^"]+)"/g)].map((m) => m[1]);
    expect(mediaRules).toHaveLength(2);
    for (const rule of mediaRules) {
      expect(rule).toMatch(/^Host\(`[a-z0-9.-]+`\) && PathRegexp\(`\^\/t\//);
    }
    expect(mediaRules).toContain('Host(`acme.recorrido360.com`) && PathRegexp(`^/t/[^/]+/[^/]+/v[0-9]+/`)');
    expect(mediaRules).toContain('Host(`milomas.com`) && PathRegexp(`^/t/[^/]+/[^/]+/v[0-9]+/`)');
  });

  it('el determinismo byte a byte (sin importar el orden de entrada) se mantiene con el router de media incluido', () => {
    // renderTraefikDynamicConfig confía en el orden que le dan (no ordena
    // por su cuenta, ver su docstring); la garantía de "no importa el orden
    // de la base" vive en normalizeHosts/buildDynamicConfigFile -- por eso
    // esta prueba pasa por ahí, igual que el describe de buildDynamicConfigFile.
    const raw = [host, 'milomas.com'];
    const first = buildDynamicConfigFile(raw, opts);
    const second = buildDynamicConfigFile([...raw].reverse(), opts);
    expect(first.yaml).toBe(second.yaml);
  });

  it('renderTraefikDynamicConfig exige mediaServiceUrl, igual que serviceUrl', () => {
    expect(() => renderTraefikDynamicConfig([host], { routerPrefix: 'r360-sub', serviceUrl: WORKER_URL })).toThrow(
      /mediaServiceUrl/,
    );
  });
});

describe('buildDynamicConfigFile', () => {
  it('deduplica, ordena, descarta inválidos y genera un YAML determinista de punta a punta', () => {
    const raw = [
      'zeta.recorrido360.com',
      'ALFA.recorrido360.com',
      'alfa.recorrido360.com',
      'host inválido con espacios.com',
      'evil`.com',
    ];
    const first = buildDynamicConfigFile(raw, {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });
    const second = buildDynamicConfigFile([...raw].reverse(), {
      routerPrefix: 'r360-sub',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });

    expect(first.hosts).toEqual(['alfa.recorrido360.com', 'zeta.recorrido360.com']);
    expect(first.invalid).toHaveLength(2);
    expect(first.yaml).toBe(second.yaml);
  });

  it('con sólo hosts inválidos, el resultado equivale al caso "sin hosts"', () => {
    const { yaml, hosts, invalid } = buildDynamicConfigFile(['evil`.com', 'otro..malo.com'], {
      routerPrefix: 'r360-custom',
      serviceUrl: WORKER_URL,
      mediaServiceUrl: MEDIA_URL,
    });
    expect(hosts).toEqual([]);
    expect(invalid).toHaveLength(2);
    expect(yaml).not.toContain('routers:');
  });
});
