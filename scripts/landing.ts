#!/usr/bin/env node
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";
import { nodes, contentTypes, settings, sites } from "../src/db/schema";
import { DEFAULT_SITE_ID } from "../src/lib/site";
import { getSection } from "../src/lib/sections/registry";
import { computePath } from "../src/lib/id";
import type { SectionInstance } from "../src/lib/sections/types";
import type { SiteMenus, MenuItem } from "../src/lib/menus";

/**
 * El sitio público de sASTRe: su propia web de producto, escrita como contenido.
 *
 *   npx tsx scripts/landing.ts          # escribe
 *   npx tsx scripts/landing.ts --dry    # enseña qué haría y no toca nada
 *
 * Por qué un guion y no un preset: un preset monta un sitio *nuevo* y falla si ya hay
 * páginas. Esto tiene que poder pasar por encima del contenido que ya está —la landing
 * vieja, sus menús, su tema— tantas veces como haga falta mientras se afina el texto. Es
 * la diferencia entre sembrar y reescribir, y mezclarlas convertiría `apply.ts` en un
 * upsert que ningún cliente nuevo necesita.
 *
 * Idempotente por ruta: la página se identifica por su `path`, y los bloques llevan ids
 * deterministas (`sec_<pagina>_<n>`). Volver a lanzarlo actualiza en su sitio en vez de
 * duplicar, y no revuelve los ids en cada pasada — que es lo que haría inútil el
 * historial de revisiones.
 *
 * Lo que NO toca, a propósito: usuarios, roles, permisos, medios, envíos de formulario y
 * los datos de empresa de Ajustes. Todo eso es del que administra, no del texto de
 * marketing.
 */

const SITE_ID = DEFAULT_SITE_ID;
const DRY = process.argv.includes("--dry");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m",
};

/* ------------------------------------------------------------------ identidad */

const SITE_NAME = "sASTRe";
const TAGLINE = "Webs a medida, publicadas en un parpadeo";

/**
 * La paleta.
 *
 * Índigo de base y ámbar de acento: el ámbar es el rayo, y sólo aparece en lo que hay que
 * mirar. El azul marino anterior era correcto y mudo, y una web que vende velocidad no
 * puede ser lo más lento de la pantalla. Tipografías del sistema a posta — cargar Google
 * Fonts manda la IP de cada visitante a Google en el mismo sitio donde se le pide
 * consentimiento para las cookies, y además cuesta una petición antes del primer pintado.
 */
const THEME = {
  daisyuiTheme: "light",
  primaryColor: "#4338CA",
  secondaryColor: "#0EA5E9",
  accentColor: "#F59E0B",
  borderRadius: "0.5rem",
  fontHeading: "system",
  fontBody: "system",
  containerWidth: "ancho",
  typeScale: "normal",
} as const;

/* -------------------------------------------------------------------- planes */

/**
 * Los planes, declarados una vez.
 *
 * Aparecen en la portada y en /precios. Escritos dos veces se separan el primer día que
 * alguien cambia un número, y el visitante que compara las dos páginas es exactamente el
 * que está a punto de pagar.
 */
const PLANES = [
  {
    name: "Sitio",
    price: "19 €",
    period: "/mes",
    description: "Una web con su dominio y su backoffice. Para el negocio que sólo necesita la suya.",
    features: [
      "1 sitio con dominio propio y HTTPS",
      "Todos los bloques y tipos de contenido",
      "Formularios con bandeja de entrada",
      "Sitemap, hreflang y JSON-LD automáticos",
      "Textos legales generados de tus datos",
      "Historial de revisiones de cada página",
    ].join("\n"),
    button_label: "Probar 14 días",
    button_url: "/empezar",
    featured: "no",
  },
  {
    name: "Estudio",
    price: "49 €",
    period: "/mes",
    description: "Hasta diez sitios en la misma cuenta. Para quien entrega webs a clientes.",
    features: [
      "Hasta 10 sitios",
      "Roles y permisos por tipo de contenido",
      "Edición por agente (MCP) en cada sitio",
      "Multi-idioma con rutas y traducciones ligadas",
      "Enlaces de previsualización para el cliente",
      "Soporte por correo en 24 h",
    ].join("\n"),
    button_label: "Probar 14 días",
    button_url: "/empezar",
    featured: "sí",
  },
  {
    name: "Agencia",
    price: "149 €",
    period: "/mes",
    description: "Sitios sin límite y un panel para administrarlos todos. Para quien vive de esto.",
    features: [
      "Sitios ilimitados",
      "Panel de inquilinos: alta, dominios y suspensión",
      "Base de datos propia por sitio",
      "Backoffice con tu marca",
      "Una sola factura",
      "Soporte prioritario",
    ].join("\n"),
    button_label: "Hablar con nosotros",
    button_url: "/contacto",
    featured: "no",
  },
];

/* -------------------------------------------------------------------- páginas */

type Bloque = {
  type: string;
  anchor?: string;
  hidden?: boolean;
  data: Record<string, unknown>;
};

type Pagina = {
  slug: string;
  /** Slug de otra página de esta lista. Los padres se declaran antes que los hijos. */
  parentSlug?: string;
  title: string;
  /** Clave del tipo de contenido. Por defecto `page`. */
  typeKey?: string;
  position?: number;
  seo?: { metaTitle?: string; metaDescription?: string };
  /** Bloques, para las páginas montadas con secciones. */
  sections?: Bloque[];
  /** Campos sueltos, para lo que no son secciones (un post: extracto y cuerpo). */
  fields?: Record<string, unknown>;
  /** Fecha de publicación fija, para que el listado del blog tenga un orden estable. */
  publishedAt?: string;
};

const PAGINAS: Pagina[] = [
  /* ------------------------------------------------------------------ portada */
  {
    slug: "index",
    title: "sASTRe",
    position: 0,
    seo: {
      metaTitle: "sASTRe — el CMS con el que entregas la web de un cliente hoy",
      metaDescription:
        "Monta la web por la mañana y publícala por la tarde. Bloques tipados, SEO de " +
        "serie, permisos de verdad y publicación instantánea: sin plugins que elegir ni " +
        "builds que esperar.",
    },
    sections: [
      {
        type: "notice",
        anchor: "aviso",
        data: {
          text: "Nuevo: tu cliente puede editar su web hablando con su propio asistente.",
          link_label: "Cómo funciona",
          link_url: "/producto#agentes",
          tone: "info",
        },
      },
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Webs a medida, publicadas en un parpadeo",
          subtitle:
            "sASTRe es el CMS con el que montas la web de un cliente por la mañana y la " +
            "entregas por la tarde. Sin elegir plugins, sin esperar builds, sin descubrir " +
            "el día de la entrega que falta lo importante.",
          cta_label: "Empezar gratis",
          cta_url: "/empezar",
          align: "centro",
          image: "",
        },
      },
      {
        type: "stats",
        data: {
          title: "",
          items: [
            { value: "17", label: "bloques listos para montar" },
            { value: "0", label: "builds al publicar: es un UPDATE" },
            { value: "300+", label: "ciudades desde las que se sirve" },
            { value: "14", label: "días de prueba, sin tarjeta" },
          ],
        },
      },
      {
        type: "features",
        anchor: "producto",
        data: {
          title: "El suelo mínimo, ya puesto",
          intro:
            "Lo que en otros gestores son seis plugins que hay que elegir, configurar y " +
            "vigilar para que no se peleen entre ellos, aquí viene decidido de fábrica.",
          columns: "3",
          items: [
            {
              icon: "⚡",
              title: "Publicar es instantáneo",
              text: "Nada se reconstruye. Cada página se resuelve por su ruta en la propia petición, sobre Cloudflare y Turso: das a publicar y ya está en línea.",
            },
            {
              icon: "🧩",
              title: "Bloques, no HTML suelto",
              text: "Las páginas se montan con secciones tipadas y validadas en servidor. El cliente las reordena sin romper nada porque no hay nada que romper.",
            },
            {
              icon: "🔎",
              title: "SEO estructural",
              text: "Sitemap, canónicas, hreflang y JSON-LD salen del propio modelo de contenido. No hay una casilla que se te olvide rellenar.",
            },
            {
              icon: "🔒",
              title: "Permisos de verdad",
              text: "Roles por tipo de contenido y por acción. Un editor limitado a Posts no toca las páginas, ni por la web ni por la API ni por el agente.",
            },
            {
              icon: "🤖",
              title: "Editable por un agente",
              text: "Un servidor MCP expone las mismas acciones que el backoffice, con los mismos permisos. No es una API paralela sin reglas: son las reglas.",
            },
            {
              icon: "🌍",
              title: "Multi-idioma real",
              text: "Cada idioma tiene su ruta y sus traducciones ligadas. El prefijo lo pone el sistema, y las hreflang se apuntan solas.",
            },
          ],
        },
      },
      {
        type: "steps",
        anchor: "como-funciona",
        data: {
          title: "De cero a entregado",
          items: [
            {
              title: "Crea el sitio",
              text: "Un asistente monta el proyecto, la base de datos, el almacenamiento y el primer administrador. Terminas con un despliegue funcionando, no con un tutorial.",
            },
            {
              title: "Monta las páginas con bloques",
              text: "Eliges secciones de la biblioteca y las rellenas. Sin plantillas, sin tocar CSS y sin que el resultado dependa de cuánto sepas maquetar.",
            },
            {
              title: "Ajusta la marca en un sitio",
              text: "Colores, tipografías, ancho y logotipo se aplican a toda la web desde Ajustes. Los bloques usan la paleta, así que nada se queda descolgado.",
            },
            {
              title: "Entrega y forma en diez minutos",
              text: "Un árbol de contenido, un formulario por página y un botón de publicar. Y si el cliente prefiere pedírselo a su asistente, también puede.",
            },
          ],
        },
      },
      {
        type: "split",
        anchor: "editor",
        data: {
          title: "Tu cliente no necesita un manual",
          side: "derecha",
          image: "",
          body:
            "<p>El backoffice enseña lo que esa persona puede tocar y nada más. La página " +
            "es una lista de bloques con su nombre; se arrastran, se ocultan y se publican.</p>" +
            "<p>Cada guardado deja una revisión, así que volver atrás es un clic y no una " +
            "llamada a soporte. Y el enlace de previsualización deja ver un borrador sin " +
            "publicarlo ni dar de alta a nadie.</p>",
          cta_label: "Ver el catálogo de bloques",
          cta_url: "/componentes",
        },
      },
      {
        type: "split",
        anchor: "velocidad",
        data: {
          title: "Rápido no es una promesa, es la arquitectura",
          side: "izquierda",
          image: "",
          body:
            "<p>No hay build. Publicar cambia una fila y el cambio está servido: se acabó " +
            "el «espera cinco minutos a que termine el despliegue» delante del cliente.</p>" +
            "<p>La página se cachea en el borde con etiquetas por nodo, y al guardar se " +
            "purga sólo lo que ese cambio afecta. Las imágenes se sirven en el tamaño que " +
            "pide cada pantalla, y no se carga ni un rastreador antes de que el visitante " +
            "diga que sí.</p>",
          cta_label: "Ver cómo está montado",
          cta_url: "/producto",
        },
      },
      {
        /*
         * Oculto a posta: el bloque está montado y con la forma correcta, pero con citas
         * inventadas dentro. Prueba social falsa en la portada es la clase de detalle que
         * hunde la confianza cuando alguien la comprueba. Se rellena con clientes reales y
         * se le quita el «oculto» desde el editor.
         */
        type: "quotes",
        anchor: "clientes",
        hidden: true,
        data: {
          title: "Lo que dicen quienes ya entregan con sASTRe",
          layout: "rejilla",
          autoplay: "no",
          items: [
            { quote: "Sustituir por una cita real de un cliente.", author: "Nombre y apellidos", role: "Cargo, empresa", photo: "" },
            { quote: "Sustituir por una cita real de un cliente.", author: "Nombre y apellidos", role: "Cargo, empresa", photo: "" },
            { quote: "Sustituir por una cita real de un cliente.", author: "Nombre y apellidos", role: "Cargo, empresa", photo: "" },
          ],
        },
      },
      {
        type: "pricing",
        anchor: "precios",
        data: {
          title: "Precios sin letra pequeña",
          intro: "Catorce días de prueba, sin tarjeta. Se cambia de plan o se cancela cuando quieras.",
          plans: PLANES,
        },
      },
      {
        type: "collection",
        anchor: "blog",
        data: {
          title: "Del blog",
          parent: "blog",
          limit: 3,
          layout: "rejilla",
          show_image: "no",
          more_label: "Todos los artículos",
        },
      },
      {
        type: "faq",
        anchor: "preguntas",
        data: {
          title: "Preguntas frecuentes",
          items: [
            {
              question: "¿En qué se diferencia de WordPress?",
              answer:
                "En que el 80 % del tiempo que se va en elegir plugins, configurarlos y vigilar que no se rompan entre ellos aquí no existe. Seguridad, SEO, formularios, textos legales y permisos vienen decididos y mantenidos por nosotros.",
            },
            {
              question: "¿De verdad se puede entregar una web en un día?",
              answer:
                "Una web de presencia —quiénes somos, qué hacemos, contacto y legales—, sí: los bloques ya están montados y el asistente deja el sitio en marcha. Lo que sigue costando lo que cuesta es escribir los textos y conseguir las fotos.",
            },
            {
              question: "¿Qué pasa si el cliente rompe algo?",
              answer:
                "Poco. Los bloques son tipados y se validan en el servidor, así que no hay HTML suelto que estropear, cada guardado deja una revisión a la que volver, y los permisos por tipo de contenido acotan quién toca qué.",
            },
            {
              question: "¿Puedo usar mi propio dominio?",
              answer:
                "Sí, en todos los planes, con su certificado. Se apunta el dominio, se da de alta en el panel y empieza a servir; no hace falta migrar nada después.",
            },
            {
              question: "¿Eso de editar con un agente qué es exactamente?",
              answer:
                "El CMS expone un servidor MCP. El cliente conecta su asistente, le dice «cambia el titular de la portada» y el asistente lo hace con exactamente los permisos que tenga esa cuenta. Ni más, ni por otra puerta.",
            },
            {
              question: "¿Y si me quiero ir?",
              answer:
                "El contenido es tuyo y sale en un volcado de la base con sus medios. No hay maquetación atrapada en un constructor propietario: son bloques con campos, legibles fuera de aquí.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "Tu próxima entrega, esta semana",
          text: "Catorce días de prueba, sin tarjeta y con el sitio funcionando desde el primer minuto.",
          button_label: "Empezar gratis",
          button_url: "/empezar",
          tone: "color",
        },
      },
    ],
  },

  /* ------------------------------------------------------------------ producto */
  {
    slug: "producto",
    title: "Producto",
    position: 1,
    seo: {
      metaTitle: "Producto — qué trae sASTRe resuelto",
      metaDescription:
        "Bloques tipados, publicación sin build, permisos por tipo de contenido, SEO " +
        "estructural y edición por agente MCP. Lo que en otro gestor son seis plugins.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Todo lo que una web de cliente necesita, ya decidido",
          subtitle:
            "No es un constructor con mil ajustes: es un CMS con opiniones. Éstas son, " +
            "una por una, y por qué.",
          cta_label: "Ver precios",
          cta_url: "/precios",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "features",
        anchor: "capacidades",
        data: {
          title: "Lo que viene resuelto",
          intro: "Nada de esto se instala, se configura ni se actualiza: está y se mantiene solo.",
          columns: "2",
          items: [
            {
              icon: "🧱",
              title: "Tipos de contenido a medida",
              text: "Páginas, posts, portfolio y los que te inventes, con sus campos. Cada tipo trae su propio formulario, su listado y su URL sin escribir plantillas.",
            },
            {
              icon: "🌲",
              title: "Un árbol, no una lista",
              text: "El contenido se organiza en jerarquía y la URL sale de ella. Mover una página recalcula las rutas de sus hijas y deja la redirección puesta.",
            },
            {
              icon: "📝",
              title: "Formularios con bandeja",
              text: "Defines los campos, sus validaciones y los correos. Los envíos llegan a una bandeja dentro del backoffice, con acuse de recibo al visitante si lo quieres.",
            },
            {
              icon: "🖼",
              title: "Medios que se sirven bien",
              text: "Cada imagen se entrega en el tamaño que pide la pantalla, con sus dimensiones puestas para que la página no salte al cargar.",
            },
            {
              icon: "§",
              title: "Legales que se mantienen solos",
              text: "Aviso legal, privacidad y cookies se generan de tus datos de empresa, y la tabla de cookies se deriva de los rastreadores configurados: añadir un píxel la actualiza.",
            },
            {
              icon: "🕒",
              title: "Revisiones y programación",
              text: "Cada guardado deja una versión a la que volver, y una página puede quedar programada para aparecer sola a la hora que digas.",
            },
          ],
        },
      },
      {
        type: "split",
        anchor: "bloques",
        data: {
          title: "Bloques tipados, no un constructor de HTML",
          side: "derecha",
          image: "",
          body:
            "<p>Cada bloque declara sus campos una vez, y de esa declaración salen a la vez " +
            "el formulario del editor, la validación del servidor y el esquema que ve un " +
            "agente. No hay tres sitios donde se pueda ir la mano.</p>" +
            "<p>Por eso una sección guardada hace un año sigue pintando hoy: los bloques " +
            "llevan versión y migran su propio contenido en vez de dejarlo roto.</p>",
          cta_label: "Ver los 17 bloques",
          cta_url: "/componentes",
        },
      },
      {
        type: "split",
        anchor: "agentes",
        data: {
          title: "Editable por un agente, con las mismas reglas",
          side: "izquierda",
          image: "",
          body:
            "<p>sASTRe habla MCP. Tu cliente conecta su asistente y le pide que cambie el " +
            "titular, que suba los precios o que publique el post del martes.</p>" +
            "<p>Lo que hace el agente pasa por las mismas acciones y los mismos permisos " +
            "que el backoffice: si esa cuenta no puede tocar las páginas, el asistente " +
            "tampoco. No hay una API de atajo por detrás — es justo lo que hace que se " +
            "pueda dejar en manos de un agente.</p>",
          cta_label: "Empezar gratis",
          cta_url: "/empezar",
        },
      },
      {
        type: "steps",
        anchor: "montaje",
        data: {
          title: "Cómo se monta un sitio",
          items: [
            { title: "El asistente crea el sitio", text: "Proyecto, base de datos, almacenamiento y primer administrador. Sin escribir una línea de configuración." },
            { title: "Eliges el punto de partida", text: "Un preset deja las páginas, el menú y la paleta de un sector ya puestas, y a partir de ahí se cambia lo que sobre." },
            { title: "Rellenas los bloques", text: "Textos, imágenes y enlaces. Lo que ves en el editor es lo que se publica." },
            { title: "Conectas el dominio", text: "Se apunta, se da de alta y sirve con su certificado. La previsualización ya funcionaba antes de eso." },
            { title: "Publicas", text: "Un clic. Sin build, sin despliegue y sin ventana de mantenimiento." },
          ],
        },
      },
      {
        type: "faq",
        anchor: "tecnica",
        data: {
          title: "Lo que suele preguntar quien va a montarlo",
          items: [
            {
              question: "¿Sobre qué está construido?",
              answer:
                "Astro sobre Cloudflare Workers para la aplicación, Turso (libSQL) para los datos y R2 para los archivos. Cada sitio puede tener su propia base, lo que mantiene el contenido de un cliente separado del de otro de verdad y no por una columna.",
            },
            {
              question: "¿Puedo tocar el código de las plantillas?",
              answer:
                "Los bloques son componentes Astro. En los planes con sitios propios se pueden añadir bloques nuevos al catálogo; lo que no hace falta es tocar código para montar una web normal.",
            },
            {
              question: "¿Cómo va la caché?",
              answer:
                "Cada página se cachea en el borde con etiquetas por nodo y por tipo de contenido. Al guardar se purga sólo lo que ese cambio afecta, y una página con contenidos programados acorta su propia vida de caché para no llegar tarde a la hora de publicación.",
            },
            {
              question: "¿Y las copias de seguridad?",
              answer:
                "Diarias, más el historial de revisiones de cada página, que es lo que de verdad se usa cuando alguien borra un párrafo el viernes por la tarde.",
            },
            {
              question: "¿Hay límite de páginas o de visitas?",
              answer:
                "Ni de páginas ni de tipos de contenido. Lo que separa a un plan de otro es cuántos sitios administras y qué herramientas de equipo necesitas.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "Móntalo tú y compara",
          text: "Catorce días, sin tarjeta. Si en la primera tarde no tienes una web en pie, no era para ti.",
          button_label: "Empezar gratis",
          button_url: "/empezar",
          tone: "color",
        },
      },
    ],
  },

  /* -------------------------------------------------------------------- precios */
  {
    slug: "precios",
    title: "Precios",
    position: 2,
    seo: {
      metaTitle: "Precios — sASTRe",
      metaDescription:
        "Desde 19 €/mes por sitio. Catorce días de prueba sin tarjeta, dominio propio " +
        "incluido y sin permanencia.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Precios claros, también cuando creces",
          subtitle:
            "Lo que separa un plan de otro es cuántos sitios llevas y qué necesita tu " +
            "equipo. Ninguno limita las páginas, las visitas ni los tipos de contenido.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "",
        },
      },
      {
        type: "pricing",
        anchor: "planes",
        data: {
          title: "",
          intro: "Precios sin IVA. Se cambia de plan cuando quieras y se prorratea la diferencia.",
          plans: PLANES,
        },
      },
      {
        type: "features",
        anchor: "incluido",
        data: {
          title: "En todos los planes, sin coste aparte",
          intro: "",
          columns: "4",
          items: [
            { icon: "🔐", title: "HTTPS y dominio propio", text: "Certificado incluido y renovado solo." },
            { icon: "⚡", title: "Publicación instantánea", text: "Sin builds ni ventanas de despliegue." },
            { icon: "🕒", title: "Revisiones y copias", text: "Historial por página y copia diaria." },
            { icon: "🍪", title: "Consentimiento y legales", text: "Banner real y textos generados de tus datos." },
          ],
        },
      },
      {
        type: "faq",
        anchor: "facturacion",
        data: {
          title: "Sobre la facturación",
          items: [
            {
              question: "¿Hace falta tarjeta para probar?",
              answer: "No. La prueba dura catorce días y termina sola: si no contratas, el sitio se suspende, pero no se borra ni se cobra nada.",
            },
            {
              question: "¿Qué pasa si un cobro falla?",
              answer:
                "Casi nunca es que alguien no quiera pagar: es una tarjeta caducada. Por eso el sitio sigue sirviendo durante catorce días de cortesía mientras se avisa. Apagar la web de un cliente el mismo día que el banco dice que no le hace un daño que no adelanta el cobro ni una hora.",
            },
            {
              question: "¿Hay permanencia?",
              answer: "No. Es mensual y se cancela cuando quieras; al cancelar el sitio deja de servir al final del periodo pagado y el contenido sigue disponible para descargarlo.",
            },
            {
              question: "¿Puedo facturar yo a mi cliente?",
              answer: "Sí, y es el caso normal en Estudio y Agencia: nosotros te facturamos a ti una vez y tú acuerdas con tu cliente lo que quieras.",
            },
            {
              question: "¿Cambiar de plan me obliga a mover nada?",
              answer: "No. Es un cambio de límites, no de sitio: no hay migración, ni URL nueva, ni corte.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "¿No sabes cuál te toca?",
          text: "Cuéntanos cuántos sitios llevas y te decimos el que sale mejor, aunque sea el barato.",
          button_label: "Preguntar",
          button_url: "/contacto",
          tone: "claro",
        },
      },
    ],
  },

  /* -------------------------------------------------------------- para agencias */
  {
    slug: "para-agencias",
    title: "Para agencias y freelances",
    position: 3,
    seo: {
      metaTitle: "Para agencias y freelances — sASTRe",
      metaDescription:
        "Entrega webs de cliente en un día, adminístralas todas desde un panel y deja de " +
        "mantener veinte instalaciones distintas.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Veinte webs de cliente, un solo sitio donde mirar",
          subtitle:
            "El problema de vivir de hacer webs no es hacerlas: es mantener veinte " +
            "instalaciones distintas, cada una con sus plugins y su versión, y que la " +
            "que se rompe sea siempre la del cliente que más llama.",
          cta_label: "Ver el plan Agencia",
          cta_url: "/precios#planes",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "features",
        anchor: "ventajas",
        data: {
          title: "Lo que cambia cuando todo vive en el mismo sitio",
          intro: "",
          columns: "3",
          items: [
            { icon: "🏢", title: "Un panel para todos", text: "Altas, dominios, estado de pago y suspensión de cada cliente desde la misma pantalla." },
            { icon: "🔀", title: "Bases separadas", text: "Cada sitio con la suya. El contenido de un cliente no comparte tabla con el de otro." },
            { icon: "🎨", title: "Con tu marca", text: "El backoffice que ve el cliente lleva tu logotipo, no el nuestro." },
            { icon: "🔁", title: "Presets propios", text: "El sitio que montas para una clínica te sirve para la siguiente: guarda el punto de partida y reutilízalo." },
            { icon: "🧾", title: "Una factura", text: "Nosotros te facturamos a ti. Lo que cobres tú a tu cliente es cosa tuya." },
            { icon: "🚫", title: "Cero mantenimiento", text: "No hay versiones que subir ni plugins que vigilar. Las actualizaciones son nuestras." },
          ],
        },
      },
      {
        type: "split",
        anchor: "entrega",
        data: {
          title: "La formación del cliente dura diez minutos",
          side: "derecha",
          image: "",
          body:
            "<p>Le enseñas el árbol, un formulario y el botón de publicar. Los permisos " +
            "hacen el resto: sólo ve lo que puede tocar, así que no hay nada que " +
            "explicarle «para que no lo use».</p>" +
            "<p>Y cuando llame pidiendo un cambio pequeño, puede hacerlo él —o pedírselo " +
            "a su asistente— sin que eso se convierta en una hora tuya.</p>",
          cta_label: "Cómo funciona por dentro",
          cta_url: "/producto",
        },
      },
      {
        type: "steps",
        anchor: "flujo",
        data: {
          title: "Cómo encaja en tu semana",
          items: [
            { title: "Lunes: alta y preset", text: "Creas el sitio del cliente y le aplicas tu punto de partida. Sale con páginas, menú y paleta." },
            { title: "Martes: contenido", text: "Metes los textos y las fotos que te ha pasado. Los bloques ya están, no hay que maquetar." },
            { title: "Miércoles: dominio y entrega", text: "Apuntas el dominio, revisas la lista de comprobación de lanzamiento y publicas." },
            { title: "Y ya", text: "El sitio se mantiene solo. Lo siguiente que hagas con ese cliente será porque quiere algo nuevo, no porque algo se rompió." },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "Prueba con el próximo encargo",
          text: "Catorce días bastan para montar y entregar uno entero.",
          button_label: "Empezar gratis",
          button_url: "/empezar",
          tone: "color",
        },
      },
    ],
  },

  /* -------------------------------------------------------------------- empezar */
  {
    slug: "empezar",
    title: "Empezar gratis",
    position: 4,
    seo: {
      metaTitle: "Empezar gratis — sASTRe",
      metaDescription:
        "Catorce días de prueba sin tarjeta. Cuéntanos qué quieres montar y te dejamos " +
        "el sitio en marcha el mismo día.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Catorce días, sin tarjeta",
          subtitle:
            "Cuéntanos qué quieres montar y te dejamos el sitio en marcha, con su " +
            "backoffice y su dirección de previsualización, el mismo día.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "",
        },
      },
      {
        type: "steps",
        anchor: "que-pasa",
        data: {
          title: "Qué pasa después de enviar esto",
          items: [
            { title: "Te escribimos en menos de un día laborable", text: "Una persona, no un autorespondedor con una lista de precios." },
            { title: "Creamos el sitio", text: "Con su base, su almacenamiento y tu cuenta de administrador. Ya puedes entrar y montar." },
            { title: "Montas y enseñas", text: "Con el enlace de previsualización puedes enseñárselo a quien quieras sin publicarlo." },
            { title: "Decides el día catorce", text: "Si sigues, apuntas el dominio y publicas. Si no, no pasa nada: no hay cargo ni hay que cancelar nada." },
          ],
        },
      },
      {
        type: "contact",
        anchor: "formulario",
        data: {
          title: "Empezar la prueba",
          text: "Cuantas más cosas nos cuentes aquí, menos correos hacen falta después.",
          submit_label: "Empezar la prueba",
          consent_text:
            "He leído y acepto la política de privacidad y el tratamiento de mis datos para " +
            "responder a esta solicitud.",
          success_message:
            "Recibido. Te escribimos en menos de un día laborable con el acceso a tu sitio.",
          autoreply: "sí",
          fields: [
            { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
            { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
            { key: "empresa", label: "Empresa o estudio", type: "text", width: "half" },
            { key: "web", label: "Web actual, si hay", type: "url", width: "half" },
            {
              key: "perfil",
              label: "Qué eres",
              type: "select",
              required: "sí",
              width: "half",
              options: ["Un negocio con una web", "Freelance que hace webs", "Agencia", "Otra cosa"],
            },
            {
              key: "sitios",
              label: "Cuántos sitios llevarías",
              type: "select",
              width: "half",
              options: ["1", "2 a 10", "Más de 10"],
            },
            { key: "mensaje", label: "Qué quieres montar", type: "textarea", required: "sí" },
          ],
        },
      },
      {
        type: "faq",
        anchor: "dudas",
        data: {
          title: "Antes de que preguntes",
          items: [
            { question: "¿Me vais a cobrar al terminar la prueba?", answer: "No. Sin tarjeta no hay cargo posible: al día catorce el sitio se suspende y tú decides si contratas." },
            { question: "¿Puedo probar con una web real?", answer: "Sí, es lo recomendable. Se monta entera y sólo se apunta el dominio cuando decides publicarla." },
            { question: "¿Me ayudáis a montarla?", answer: "En la prueba respondemos dudas por correo. Si quieres que la montemos nosotros, dilo en el mensaje y te pasamos presupuesto." },
          ],
        },
      },
    ],
  },

  /* ------------------------------------------------------------- sobre nosotros */
  {
    slug: "sobre-nosotros",
    title: "Sobre nosotros",
    position: 5,
    seo: {
      metaTitle: "Sobre nosotros — sASTRe",
      metaDescription: "Por qué existe sASTRe y con qué criterio está construido.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Un CMS con opiniones, hecho por quien entrega webs",
          subtitle:
            "sASTRe no salió de una pizarra: salió de montar la misma web una y otra vez " +
            "y de cansarnos de las mismas seis decisiones.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "prose",
        anchor: "por-que",
        data: {
          title: "Por qué existe",
          width: "estrecho",
          body:
            "<p>Cualquiera que haya entregado webs a clientes conoce el reparto: una parte " +
            "del trabajo es diseño y contenido, y la otra —la que nadie factura— es elegir " +
            "plugins, configurarlos, comprobar que no se pisan y volver seis meses después " +
            "porque uno se actualizó mal.</p>" +
            "<p>Esa segunda parte no aporta nada a quien paga la web. Es infraestructura, y " +
            "la infraestructura debería venir decidida. sASTRe es esa decisión tomada de " +
            "antemano: permisos, SEO, formularios, textos legales, medios y publicación, " +
            "montados de una forma concreta y mantenidos por nosotros.</p>",
        },
      },
      {
        type: "steps",
        anchor: "criterio",
        data: {
          title: "El criterio, cuando hay que elegir",
          items: [
            { title: "Menos ajustes, mejores predeterminados", text: "Un ajuste que casi nadie cambia es una decisión que no hemos querido tomar. Preferimos tomarla y equivocarnos a la vista." },
            { title: "Que el cliente no pueda romperlo", text: "Los bloques se validan en el servidor y cada guardado deja una revisión. La libertad de romper la web no es una funcionalidad." },
            { title: "Nada que mantener", text: "Si algo hay que actualizar a mano cada trimestre, está mal diseñado. Eso incluye la tabla de cookies y las rutas al mover una página." },
            { title: "Lo lento se nota, lo rápido también", text: "Publicar tiene que ser inmediato porque casi siempre se publica con el cliente delante o con prisa." },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "¿Te cuadra la forma de pensar?",
          text: "Entonces la prueba de catorce días te va a decir lo que necesitas saber.",
          button_label: "Empezar gratis",
          button_url: "/empezar",
          tone: "claro",
        },
      },
    ],
  },
  {
    slug: "equipo",
    parentSlug: "sobre-nosotros",
    title: "Equipo",
    position: 0,
    seo: { metaTitle: "Equipo — sASTRe", metaDescription: "Quién está detrás de sASTRe y cómo trabajamos." },
    sections: [
      {
        type: "prose",
        anchor: "quienes",
        data: {
          title: "Quiénes lo hacemos",
          width: "estrecho",
          body:
            "<p>Somos un equipo pequeño, y eso es una decisión, no una etapa. Un producto " +
            "con opiniones se mantiene mientras quepa en pocas cabezas: en cuanto hay que " +
            "coordinar a treinta personas, la salida fácil es añadir un ajuste más y dejar " +
            "que el cliente decida.</p>" +
            "<p>Quien te contesta al soporte es quien escribe el código. Eso limita cuántos " +
            "clientes podemos llevar a la vez, y también es a propósito.</p>",
        },
      },
      {
        /* Mismo caso que las citas de la portada: la ficha está montada y vacía a posta.
           Se rellena con las personas reales y se le quita el «oculto». */
        type: "team",
        anchor: "personas",
        hidden: true,
        data: {
          title: "El equipo",
          items: [
            { name: "Nombre y apellidos", role: "Cargo", photo: "", bio: "Una línea sobre qué hace aquí." },
            { name: "Nombre y apellidos", role: "Cargo", photo: "", bio: "Una línea sobre qué hace aquí." },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "¿Nos preguntas algo?",
          text: "Contesta una persona, y normalmente el mismo día.",
          button_label: "Escribir",
          button_url: "/contacto",
          tone: "claro",
        },
      },
    ],
  },
  {
    slug: "historia",
    parentSlug: "sobre-nosotros",
    title: "Historia",
    position: 1,
    seo: { metaTitle: "Historia — sASTRe", metaDescription: "De un CMS interno a un producto: cómo llegó sASTRe hasta aquí." },
    sections: [
      {
        type: "prose",
        anchor: "intro",
        data: {
          title: "Cómo llegamos hasta aquí",
          width: "estrecho",
          body:
            "<p>sASTRe empezó siendo la herramienta con la que entregábamos nuestros " +
            "propios encargos. No se pensó como producto: se pensó para no repetir el " +
            "mismo montaje una vez más.</p>",
        },
      },
      {
        type: "steps",
        anchor: "hitos",
        data: {
          title: "",
          items: [
            { title: "El encargo que se repetía", text: "La misma web de presencia, otra vez: páginas, contacto, legales y un blog. Cambiaban los textos y las fotos; el trabajo de fontanería, no." },
            { title: "Un CMS interno", text: "Un árbol de contenido, tipos con sus campos y bloques tipados. Lo justo para dejar de escribir plantillas en cada proyecto." },
            { title: "Lo que el cliente pedía siempre", text: "Permisos para que su becario no tocase la portada, previsualización para enseñárselo a su jefe y publicar sin llamarnos. Eso dejó de ser un extra." },
            { title: "Multi-inquilino", text: "Cada sitio con su base y su dominio, y un panel para administrarlos todos. Ahí dejó de ser una herramienta interna." },
            { title: "Y ahora, editable por agentes", text: "El mismo backoffice expuesto por MCP, con los mismos permisos. Porque el cliente ya le pide cosas a su asistente; lo raro sería que la web fuese lo único que no puede tocar." },
          ],
        },
      },
    ],
  },

  /* ------------------------------------------------------------------- contacto */
  {
    slug: "contacto",
    title: "Contacto",
    position: 6,
    seo: {
      metaTitle: "Contacto — sASTRe",
      metaDescription: "Escríbenos y te contesta una persona, normalmente el mismo día.",
    },
    sections: [
      {
        type: "prose",
        anchor: "datos",
        data: {
          title: "Hablamos",
          width: "estrecho",
          body:
            "<p>Si lo que quieres es probar el producto, el camino corto es " +
            "<a href=\"/empezar\">la prueba de catorce días</a>: se monta el sitio y hablamos " +
            "con algo delante.</p>" +
            "<p>Para todo lo demás —presupuestos, dudas de facturación, prensa o migrar una " +
            "web que ya existe— usa el formulario. Contesta una persona, en horario " +
            "de oficina y normalmente el mismo día.</p>",
        },
      },
      {
        type: "contact",
        anchor: "formulario",
        data: {
          title: "Escríbenos",
          text: "",
          submit_label: "Enviar mensaje",
          consent_text:
            "He leído y acepto la política de privacidad y el tratamiento de mis datos para " +
            "responder a esta consulta.",
          success_message: "Gracias, hemos recibido tu mensaje. Te respondemos en menos de 24 horas.",
          autoreply: "sí",
          fields: [
            { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
            { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
            { key: "telefono", label: "Teléfono", type: "tel", width: "half" },
            {
              key: "asunto",
              label: "Sobre qué",
              type: "select",
              required: "sí",
              width: "half",
              options: ["Quiero probarlo", "Presupuesto o planes", "Migrar una web que ya tengo", "Facturación", "Prensa", "Otra cosa"],
            },
            { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
          ],
        },
      },
    ],
  },

  /* ----------------------------------------------------------------------- blog */
  {
    slug: "blog",
    title: "Blog",
    position: 7,
    seo: {
      metaTitle: "Blog — sASTRe",
      metaDescription: "Sobre montar, entregar y mantener webs de cliente sin que se te vaya la vida en ello.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Blog",
          subtitle: "Sobre montar, entregar y mantener webs de cliente sin que se te vaya la vida en ello.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "",
        },
      },
      {
        /*
         * El listado va en un bloque y no en el renderizador de archivo porque «blog» es
         * una página normal: su tipo es `page`, y quien decide qué se lista —y cuántos, y
         * con qué disposición— es quien monta la página, no el tipo de contenido.
         */
        type: "collection",
        anchor: "entradas",
        data: {
          title: "",
          parent: "blog",
          limit: 12,
          layout: "lista",
          show_image: "no",
          more_label: "",
        },
      },
    ],
  },
  {
    slug: "publicar-sin-build",
    parentSlug: "blog",
    typeKey: "post",
    title: "Publicar no debería tardar cinco minutos",
    position: 0,
    publishedAt: "2026-06-10T09:00:00Z",
    fields: {
      excerpt:
        "El build estático fue una gran idea para un blog personal y es una mala idea para " +
        "la web de un cliente que quiere corregir una errata ahora.",
      cover_image: "",
      body:
        "<p>Hay un momento concreto en el que se nota: el cliente ve una errata en la " +
        "portada el día del lanzamiento, la corrige, da a publicar y pregunta por qué " +
        "sigue viéndola. La respuesta honesta —«espera a que termine el despliegue»— es la " +
        "primera grieta en la confianza que acabas de construir.</p>" +
        "<h2>De dónde viene el build</h2>" +
        "<p>Generar el sitio entero en cada cambio resolvía un problema real: servir HTML " +
        "sin una base de datos detrás era más rápido y más barato que cualquier alternativa " +
        "de la época. El precio era el tiempo de construcción, y en un blog de una persona " +
        "ese precio no lo pagaba nadie.</p>" +
        "<p>En la web de un cliente lo paga siempre la misma persona: la que tiene prisa.</p>" +
        "<h2>Qué hacemos en su lugar</h2>" +
        "<p>En sASTRe publicar es escribir una fila. La página se resuelve por su ruta en la " +
        "propia petición, se sirve desde el borde y se cachea con etiquetas por nodo. Al " +
        "guardar se purga exactamente lo que ese cambio afecta y nada más.</p>" +
        "<ul>" +
        "<li>Nada se reconstruye, así que no hay cola ni ventana de despliegue.</li>" +
        "<li>Un cambio en una página no invalida las otras mil.</li>" +
        "<li>Una entrada programada acorta la vida de caché del listado que la va a mostrar, " +
        "porque a la hora de publicarse no hay ninguna escritura que purgue nada.</li>" +
        "</ul>" +
        "<h2>Lo que se pierde</h2>" +
        "<p>Que no se diga que sale gratis: hay una base de datos en el camino de cada " +
        "petición, y eso hay que sostenerlo. La respuesta es dónde vive: la base está " +
        "replicada cerca del borde y la consulta es por clave primaria. Lo que se gana a " +
        "cambio es que publicar deje de ser un acontecimiento.</p>",
    },
  },
  {
    slug: "plugins-que-dejas-de-instalar",
    parentSlug: "blog",
    typeKey: "post",
    title: "Los seis plugins que dejas de instalar",
    position: 1,
    publishedAt: "2026-07-15T09:00:00Z",
    fields: {
      excerpt:
        "Formularios, SEO, caché, copias, cookies y campos personalizados. En una web de " +
        "presencia son siempre los mismos seis, y siempre hay que elegirlos otra vez.",
      cover_image: "",
      body:
        "<p>Abre cualquier web de presencia que hayas entregado en los últimos años y mira " +
        "la lista de extensiones. Cambian los nombres; las funciones son casi siempre " +
        "estas seis.</p>" +
        "<h2>1. Formularios</h2>" +
        "<p>Un formulario de contacto con validación, aviso por correo y una bandeja donde " +
        "queden los mensajes. Aquí es un bloque: defines los campos y el servidor sólo " +
        "acepta esos, así que quitar uno lo deja de admitir al instante.</p>" +
        "<h2>2. SEO</h2>" +
        "<p>Sitemap, canónicas, hreflang, Open Graph y datos estructurados. Salen del " +
        "modelo de contenido, no de rellenar una caja debajo de cada página. Lo que se " +
        "escribe a mano es lo que de verdad se escribe a mano: el título y la descripción.</p>" +
        "<h2>3. Caché</h2>" +
        "<p>No hay nada que instalar porque no hay nada que cachear a posteriori: el " +
        "cacheado y su purga son parte de cómo se sirve una página.</p>" +
        "<h2>4. Copias de seguridad</h2>" +
        "<p>Copia diaria, y sobre todo revisiones por página. La copia salva del desastre; " +
        "las revisiones salvan del viernes por la tarde, que es lo que pasa de verdad.</p>" +
        "<h2>5. Cookies y consentimiento</h2>" +
        "<p>El banner es la parte fácil. La difícil es que ningún rastreador se cargue antes " +
        "de que el visitante diga que sí, y que la tabla de cookies del documento legal " +
        "diga la verdad. Aquí la tabla se deriva de los rastreadores configurados: añadir " +
        "un píxel la actualiza sola.</p>" +
        "<h2>6. Campos personalizados</h2>" +
        "<p>Los tipos de contenido con sus campos son el propio CMS, no un añadido. Y cada " +
        "campo que declaras se pinta en la página sin escribir una plantilla.</p>" +
        "<p>Ninguno de los seis es difícil por separado. Lo caro es elegirlos, configurarlos " +
        "y responder por ellos cuando uno se actualiza mal en la web de un cliente que no " +
        "sabe que existen.</p>",
    },
  },
  {
    slug: "entregar-una-web-en-un-dia",
    parentSlug: "blog",
    typeKey: "post",
    title: "Cómo entregar una web en un día sin que se note",
    position: 2,
    publishedAt: "2026-08-20T09:00:00Z",
    fields: {
      excerpt:
        "Se puede, y no consiste en escribir más rápido: consiste en no tomar por " +
        "vigésima vez las decisiones que ya tomaste.",
      cover_image: "",
      body:
        "<p>«Una web en un día» suena a promesa de anuncio. Lo es, si con web te refieres a " +
        "una plantilla con el logotipo cambiado. No lo es si has ordenado el trabajo.</p>" +
        "<h2>Lo que de verdad tarda</h2>" +
        "<p>Ponle números a tu último encargo. Casi nunca el tiempo se va en maquetar: se va " +
        "en esperar los textos, perseguir las fotos, montar la fontanería y en las tres " +
        "rondas de cambios pequeños.</p>" +
        "<p>Un día es realista sólo si atacas la fontanería y los cambios pequeños. Los " +
        "textos y las fotos siguen tardando lo que tarda tu cliente.</p>" +
        "<h2>Pide el contenido antes de empezar</h2>" +
        "<p>Un guion de una página por página, con el titular y las tres frases que van " +
        "debajo. Si el cliente no lo tiene, montar la web no es lo que le falta.</p>" +
        "<h2>Ten un punto de partida propio</h2>" +
        "<p>La cuarta clínica dental no debería empezar en blanco. Un preset guarda las " +
        "páginas, el menú y la paleta que ya funcionaron: se aplica y lo que queda es " +
        "cambiar lo que sobra, que es mucho más rápido que decidir lo que falta.</p>" +
        "<h2>Deja los cambios pequeños fuera de tu agenda</h2>" +
        "<p>El teléfono nuevo, la foto que no gustaba, el horario de agosto. Si cada uno de " +
        "esos pasa por ti, la entrega no termina nunca. Con permisos por tipo de contenido " +
        "el cliente los hace él sin poder romper nada — y si prefiere pedírselo a su " +
        "asistente, el agente trabaja con esos mismos permisos.</p>" +
        "<h2>Revisa antes de publicar</h2>" +
        "<p>Antes de apuntar el dominio, la lista de comprobación: títulos y descripciones, " +
        "una imagen para compartir, los datos de empresa en los legales, el correo de aviso " +
        "del formulario probado de verdad y la analítica detrás del consentimiento.</p>" +
        "<p>Un día es tiempo de sobra para todo eso. Lo que no cabe en un día es tomar las " +
        "mismas seis decisiones otra vez.</p>",
    },
  },
];

/**
 * Contenido de la landing vieja que ya no toca ninguna página nueva.
 *
 * Se marca como borrado, no se elimina: `deleted_at` es la papelera, así que sigue en la
 * base y se puede recuperar desde el backoffice. Un `DELETE` aquí sería irreversible y
 * además rompería las revisiones que cuelgan de ese nodo.
 */
const RETIRAR = ["/blog/primer-post", "/blog/segundo-post"];

/* ---------------------------------------------------------------------- menús */

type EntradaMenu = { label: string; path: string } | { label: string; url: string };

const MENUS: Record<"main" | "footer" | "legal", EntradaMenu[]> = {
  main: [
    { label: "Producto", path: "/producto" },
    { label: "Precios", path: "/precios" },
    { label: "Blog", path: "/blog" },
    { label: "Contacto", path: "/contacto" },
    { label: "Empezar gratis", path: "/empezar" },
  ],
  footer: [
    { label: "Para agencias", path: "/para-agencias" },
    { label: "Catálogo de bloques", path: "/componentes" },
    { label: "Sobre nosotros", path: "/sobre-nosotros" },
    { label: "Equipo", path: "/sobre-nosotros/equipo" },
    { label: "Historia", path: "/sobre-nosotros/historia" },
  ],
  legal: [
    { label: "Aviso legal", path: "/aviso-legal" },
    { label: "Privacidad", path: "/politica-de-privacidad" },
    { label: "Cookies", path: "/politica-de-cookies" },
  ],
};

/* ------------------------------------------------------------------ escritura */

/** Un id de bloque estable: la misma página en la misma posición vuelve al mismo id. */
function idBloque(slug: string, index: number): string {
  return `sec_${slug.replace(/[^a-z0-9]+/gi, "_")}_${index}`;
}

/**
 * Sella los bloques: id estable, versión del registro y referencias resueltas.
 *
 * Los campos de tipo `relation` de un bloque guardan aquí el *slug* de otra página de esta
 * misma lista, porque los ids no existen hasta que el guion los crea. Cuáles son esos
 * campos lo dice la definición del bloque, no una lista aparte: un bloque nuevo con su
 * propia relación funciona sin tocar esto.
 */
function sellarBloques(pagina: Pagina, idsPorSlug: Map<string, string>): SectionInstance[] {
  return (pagina.sections ?? []).map((bloque, index) => {
    const def = getSection(bloque.type);
    if (!def) throw new Error(`La página "${pagina.slug}" usa un bloque inexistente: "${bloque.type}"`);

    const data = { ...bloque.data };
    for (const campo of def.fields.filter((f) => f.type === "relation")) {
      const referencia = data[campo.key];
      if (typeof referencia !== "string" || !referencia) continue;
      const id = idsPorSlug.get(referencia);
      if (!id) throw new Error(`"${pagina.slug}": el bloque ${bloque.type} apunta a "${referencia}", que no existe`);
      data[campo.key] = id;
    }

    return {
      id: idBloque(pagina.slug, index),
      type: bloque.type,
      v: def.version,
      data,
      ...(bloque.hidden ? { hidden: true } : {}),
      ...(bloque.anchor ? { anchor: bloque.anchor } : {}),
    };
  });
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required");

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const db = drizzle(client, { schema });

  console.log(`${C.bold}${C.cyan}sASTRe — sitio público${C.reset}${DRY ? `${C.dim} (simulación)${C.reset}` : ""}\n`);

  /* Los tipos de contenido, y de cada uno cuál es su campo de secciones. */
  const tipos = await db.query.contentTypes.findMany({ where: eq(contentTypes.siteId, SITE_ID) });
  const tipoPorClave = new Map(tipos.map((t) => [t.key, t]));
  const claveSecciones = new Map(
    tipos.map((t) => [t.key, (t.fieldSchema ?? []).find((f) => f.type === "sections")?.key ?? null])
  );

  for (const clave of new Set(PAGINAS.map((p) => p.typeKey ?? "page"))) {
    if (!tipoPorClave.has(clave)) {
      throw new Error(`El sitio no tiene el tipo de contenido "${clave}". Lanza antes \`npm run db:seed\`.`);
    }
  }

  /* Lo que ya hay, por ruta. */
  const existentes = await db.query.nodes.findMany({
    where: eq(nodes.siteId, SITE_ID),
    columns: { id: true, path: true, publishedAt: true, createdAt: true },
  });
  const yaEnBase = new Map(existentes.map((n) => [n.path, n]));

  /*
   * Primera pasada: rutas e ids, sin escribir.
   *
   * Hace falta porque un bloque puede apuntar a otra página —el listado del blog, sin ir
   * más lejos— y esa referencia se guarda como id. Resolverla sobre la marcha obligaría a
   * ordenar las páginas por sus referencias en vez de por su jerarquía, que es la que de
   * verdad manda para construir las rutas.
   */
  const rutaPorSlug = new Map<string, string>();
  const idPorSlug = new Map<string, string>();

  for (const pagina of PAGINAS) {
    const rutaPadre = pagina.parentSlug ? rutaPorSlug.get(pagina.parentSlug) : null;
    if (pagina.parentSlug && !rutaPadre) {
      throw new Error(`"${pagina.slug}" cuelga de "${pagina.parentSlug}", que no está declarada antes.`);
    }
    const ruta = computePath(rutaPadre ?? null, pagina.slug, "es", "es");
    rutaPorSlug.set(pagina.slug, ruta);
    idPorSlug.set(pagina.slug, yaEnBase.get(ruta)?.id ?? `node_${pagina.slug.replace(/[^a-z0-9]+/gi, "")}`);
  }

  /* Segunda pasada: escribir. */
  const ahora = new Date();
  let creadas = 0;
  let actualizadas = 0;

  for (const pagina of PAGINAS) {
    const claveTipo = pagina.typeKey ?? "page";
    const tipo = tipoPorClave.get(claveTipo)!;
    const ruta = rutaPorSlug.get(pagina.slug)!;
    const id = idPorSlug.get(pagina.slug)!;
    const existe = yaEnBase.get(ruta);

    const campoSecciones = claveSecciones.get(claveTipo);
    const bloques = sellarBloques(pagina, idPorSlug);
    if (bloques.length && !campoSecciones) {
      throw new Error(`El tipo "${claveTipo}" no tiene campo de secciones, y "${pagina.slug}" trae bloques.`);
    }

    /*
     * `body` vacío junto a los bloques: todos los renderizadores pintan `fields.body`, y
     * una página montada con secciones no debe además soltar un texto suelto encima.
     */
    const fields: Record<string, unknown> = {
      ...(campoSecciones ? { body: "", [campoSecciones]: bloques } : {}),
      ...(pagina.fields ?? {}),
    };

    const publishedAt = pagina.publishedAt
      ? new Date(pagina.publishedAt)
      : existe?.publishedAt ?? ahora;

    const valores = {
      siteId: SITE_ID,
      contentTypeId: tipo.id,
      parentId: pagina.parentSlug ? idPorSlug.get(pagina.parentSlug)! : null,
      locale: "es",
      slug: pagina.slug,
      path: ruta,
      position: pagina.position ?? 0,
      status: "published" as const,
      publishedAt,
      publishAt: null,
      deletedAt: null,
      title: pagina.title,
      fields,
      seo: (pagina.seo ?? {}) as Record<string, unknown>,
      updatedAt: ahora,
    };

    if (DRY) {
      console.log(`  ${existe ? `${C.dim}=${C.reset}` : `${C.green}+${C.reset}`} ${ruta}  ${C.dim}${pagina.title} · ${bloques.length} bloque(s)${C.reset}`);
    } else if (existe) {
      await db.update(nodes).set(valores).where(eq(nodes.id, existe.id));
      actualizadas++;
      console.log(`  ${C.dim}=${C.reset} ${ruta}  ${C.dim}${bloques.length} bloque(s)${C.reset}`);
    } else {
      await db.insert(nodes).values({ ...valores, id, createdAt: ahora });
      creadas++;
      console.log(`  ${C.green}+${C.reset} ${ruta}  ${C.dim}${bloques.length} bloque(s)${C.reset}`);
    }
  }

  /* A la papelera lo que la landing vieja dejó suelto. */
  for (const ruta of RETIRAR) {
    const viejo = yaEnBase.get(ruta);
    if (!viejo) continue;
    if (!DRY) {
      await db.update(nodes).set({ deletedAt: ahora, updatedAt: ahora }).where(eq(nodes.id, viejo.id));
    }
    console.log(`  ${C.yellow}-${C.reset} ${ruta}  ${C.dim}a la papelera${C.reset}`);
  }

  /*
   * Menús: guardan ids, no rutas, para que renombrar un slug no rompa la navegación de
   * todas las páginas a la vez. Por eso se resuelven aquí, contra lo que hay en la base
   * —incluidas páginas que este guion no toca, como los legales o el catálogo.
   */
  const todas = await db.query.nodes.findMany({
    where: eq(nodes.siteId, SITE_ID),
    columns: { id: true, path: true, status: true, deletedAt: true },
  });
  const idPorRuta = new Map(
    todas.filter((n) => n.status === "published" && !n.deletedAt).map((n) => [n.path, n.id])
  );

  const menus: SiteMenus = {};
  for (const [nombre, entradas] of Object.entries(MENUS) as [keyof SiteMenus, EntradaMenu[]][]) {
    const resueltas: MenuItem[] = [];
    for (const entrada of entradas) {
      if ("url" in entrada) {
        resueltas.push({ label: entrada.label, url: entrada.url });
        continue;
      }
      const id = idPorRuta.get(entrada.path);
      if (!id) {
        console.log(`  ${C.yellow}!${C.reset} el menú ${nombre} apunta a ${entrada.path}, que no existe publicada: se omite`);
        continue;
      }
      resueltas.push({ label: entrada.label, nodeId: id });
    }
    if (resueltas.length) menus[nombre] = resueltas;
  }

  if (!DRY) {
    await db.update(settings)
      .set({ siteName: SITE_NAME, tagline: TAGLINE, theme: THEME, menus })
      .where(eq(settings.siteId, SITE_ID));
    await db.update(sites).set({ name: SITE_NAME }).where(eq(sites.id, SITE_ID));
  }

  console.log(
    `\n${C.green}✓${C.reset} ${creadas} creada(s), ${actualizadas} actualizada(s). ` +
    `Menús: ${Object.entries(menus).map(([k, v]) => `${k} (${v?.length})`).join(", ")}.`
  );
  if (DRY) console.log(`${C.dim}Simulación: no se ha escrito nada.${C.reset}`);
}

main().catch((error) => {
  console.error(`${C.red}✗${C.reset}`, error instanceof Error ? error.message : error);
  process.exit(1);
});
