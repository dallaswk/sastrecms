#!/usr/bin/env node
import { ejecutar, type Contenido, type Pagina, type EntradaMenu, type TipoContenido } from "./lib/site-seed";
import type { FieldDefinition } from "../src/lib/fields/types";

/**
 * Clínica Álvarez: un sitio de demostración, entero y ficticio.
 *
 *   npx tsx scripts/clinica.ts            # escribe en la base del inquilino
 *   npx tsx scripts/clinica.ts --dry      # enseña qué haría y no toca nada
 *   npx tsx scripts/clinica.ts --tenant=otro-slug
 *
 * Para qué: enseñar el producto con una web que parece de verdad —tratamientos con su
 * precio, equipo, opiniones, blog y legales— en vez de con tres páginas de relleno. Todo
 * lo que hay aquí es inventado: la sociedad, el CIF, el equipo y las opiniones no existen,
 * y el teléfono y el correo son de los rangos reservados para ejemplos a propósito. Si
 * esto se usa alguna vez de punto de partida real, esos datos son lo primero que hay que
 * cambiar, porque de ellos salen los documentos legales.
 *
 * Por qué un guion y no un preset: un preset es un sector, se aplica a sitios nuevos y su
 * texto acaba en la web de cualquier cliente. Aquí hay una marca concreta con nombres y
 * citas inventadas, y eso no puede ir en el catálogo que ve quien monta un sitio de
 * verdad. Mismo reparto que `landing.ts`, que es el sitio de sASTRe y tampoco es un preset.
 *
 * Idempotente por ruta: cada página se identifica por su `path` y los bloques llevan ids
 * deterministas (`sec_<pagina>_<n>`), así que volver a lanzarlo actualiza en su sitio en
 * lugar de duplicar, y no revuelve los ids —que es lo que dejaría inútil el historial de
 * revisiones.
 *
 * Lo que NO toca: usuarios, roles, permisos, medios y envíos de formulario.
 */

const TENANT = "clinica-alvarez";

/* ---------------------------------------------------------------- identidad */

const SITE_NAME = "Clínica Álvarez";
const TAGLINE = "Medicina estética con criterio médico";

/**
 * La paleta.
 *
 * Verde salvia de base y cobre de acento. El rosa empolvado es el color por defecto del
 * sector y lo que dice de una clínica es «spa»; aquí lo que hay que transmitir es que
 * quien pincha es un médico, así que el peso lo lleva un verde apagado —serio sin ser
 * hospitalario— sobre un blanco cálido, y el cobre queda reservado para lo único que hay
 * que pulsar: pedir cita.
 *
 * Titulares con la serif del sistema: da el aire de consulta que pide el sector sin
 * cargar Google Fonts, que mandaría la IP de cada visitante a Google en la misma página
 * donde se le pide consentimiento para las cookies.
 */
const THEME = {
  daisyuiTheme: "light",
  primaryColor: "#3F5D52",
  secondaryColor: "#C2A78E",
  accentColor: "#B4643A",
  baseColor: "#FBF8F4",
  borderRadius: "0.75rem",
  fontHeading: "system-serif",
  fontBody: "system",
  containerWidth: "normal",
  typeScale: "amplia",
} as const;

/**
 * Los datos de empresa, de los que salen el aviso legal y la política de privacidad.
 *
 * Inventados, y con teléfono y dominio de los rangos reservados para documentación para
 * que nadie reciba llamadas de una demo.
 */
const BUSINESS: Record<string, string> = {
  legalName: "Clínica Álvarez Medicina Estética, S.L.",
  tradeName: "Clínica Álvarez",
  taxId: "B00000000",
  address: "Calle de Cirilo Amorós 42, 2.º",
  postalCode: "46004",
  city: "Valencia",
  province: "Valencia",
  country: "España",
  email: "hola@clinicaalvarez.example",
  phone: "+34 960 000 000",
  registry: "Registro Mercantil de Valencia, tomo 9.842, folio 118, hoja V-165331. Centro sanitario autorizado n.º 46-C-00000",
  hosting: "Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107 (EE. UU.)",
};

const CONTACT_EMAIL = "hola@clinicaalvarez.example";
const SOCIAL: Record<string, string> = {
  instagram: "https://instagram.com/clinicaalvarez",
};

/* ----------------------------------------------------- tipo de contenido propio */

/**
 * «Tratamiento» como tipo propio y no como página suelta: cada uno tiene precio, duración
 * y número de sesiones, y esos tres datos son justo los que el paciente compara. Como
 * campos declarados se pintan solos en la ficha y se listan en el bloque de colección; en
 * el cuerpo de una página serían texto que hay que maquetar a mano cada vez.
 */
const TIPO_TRATAMIENTO: TipoContenido = {
  key: "tratamiento",
  label: "Tratamiento",
  icon: "💉",
  fieldSchema: [
    { key: "excerpt", label: "Resumen", type: "textarea" },
    { key: "cover_image", label: "Imagen", type: "image" },
    { key: "precio", label: "Precio", type: "text" },
    { key: "duracion", label: "Duración de la sesión", type: "text" },
    { key: "sesiones", label: "Sesiones recomendadas", type: "text" },
    { key: "body", label: "Descripción", type: "richtext" },
  ] as FieldDefinition[],
};

/* -------------------------------------------------------------------- páginas */

/** El formulario de contacto, declarado una vez: está en la portada y en /contacto. */
const CAMPOS_FORMULARIO = [
  { key: "nombre", label: "Nombre y apellidos", type: "text", required: "sí", width: "half" },
  { key: "telefono", label: "Teléfono", type: "tel", required: "sí", width: "half" },
  { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
  {
    key: "interes",
    label: "¿Qué te gustaría tratar?",
    type: "select",
    options: [
      "Aún no lo sé, quiero que me valoren",
      "Arrugas de expresión",
      "Volumen y contorno facial",
      "Manchas y calidad de la piel",
      "Acné o cicatrices",
      "Depilación láser",
      "Otro",
    ],
  },
  { key: "horario", label: "Cuándo te viene mejor que te llamemos", type: "text" },
  { key: "mensaje", label: "Cuéntanos lo que quieras antes de la cita", type: "textarea" },
];

const FORMULARIO = {
  title: "Pide tu valoración",
  text:
    "Te llamamos en el mismo día laborable para darte cita. La valoración dura una hora, " +
    "la hace un médico y no termina con ningún tratamiento hecho: termina con un plan y " +
    "un precio por escrito.",
  fields: CAMPOS_FORMULARIO,
  submit_label: "Pedir que me llamen",
  consent_text:
    "He leído y acepto la política de privacidad. Doy mi consentimiento para que Clínica " +
    "Álvarez trate mis datos con el fin de darme cita y responder a esta consulta.",
  success_message:
    "Gracias. Hemos recibido tu solicitud y te llamamos hoy mismo si es día laborable, o " +
    "el lunes por la mañana si nos escribes el fin de semana.",
  notify_email: "citas@clinicaalvarez.example",
  notify_subject: "Nueva solicitud de cita desde la web",
  autoreply: "sí",
  autoreply_subject: "Hemos recibido tu solicitud — Clínica Álvarez",
  autoreply_body:
    "Hola,\n\nHemos recibido tu solicitud de cita y te llamamos en el mismo día laborable " +
    "para cuadrar la hora.\n\nSi prefieres adelantarlo tú, estamos en el +34 960 000 000 de " +
    "lunes a viernes, de 9:00 a 20:00.\n\nUn saludo,\nClínica Álvarez\nCalle de Cirilo " +
    "Amorós 42, Valencia",
};

const PAGINAS: Pagina[] = [
  /* ------------------------------------------------------------------ portada */
  {
    slug: "index",
    title: "Clínica Álvarez",
    position: 0,
    seo: {
      metaTitle: "Clínica Álvarez — medicina estética en Valencia",
      metaDescription:
        "Medicina estética facial y corporal en el centro de Valencia. Valoración médica " +
        "de una hora, precio cerrado por escrito y revisión incluida a los quince días.",
    },
    sections: [
      {
        type: "notice",
        anchor: "aviso",
        data: {
          text: "Agenda de septiembre abierta: la valoración médica sigue sin coste hasta el día 30.",
          link_label: "Pedir cita",
          link_url: "/contacto",
          tone: "info",
        },
      },
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Verse bien sin dejar de parecerse a uno mismo",
          subtitle:
            "Medicina estética facial y corporal en el centro de Valencia. Empezamos por " +
            "una valoración de una hora con un médico, y muchas veces esa consulta " +
            "termina diciéndote qué no necesitas.",
          cta_label: "Pedir valoración",
          cta_url: "/contacto",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "stats",
        data: {
          title: "",
          items: [
            { value: "2009", label: "En Cirilo Amorós desde entonces" },
            { value: "14.000", label: "Tratamientos realizados" },
            { value: "4", label: "Médicos colegiados en plantilla" },
            { value: "48 h", label: "Para tener cita de valoración" },
          ],
        },
      },
      {
        type: "features",
        anchor: "por-que",
        data: {
          title: "Cómo trabajamos",
          intro:
            "La medicina estética se ha llenado de promociones y de tratamientos que se " +
            "venden por teléfono. Nosotros hacemos lo contrario, y por eso tardamos más " +
            "en empezar.",
          columns: "3",
          items: [
            {
              icon: "🩺",
              title: "Primero la consulta",
              text: "Ningún tratamiento se cierra sin ver la piel, revisar el historial y entender qué te molesta al mirarte. De ahí sale el plan, no de un catálogo.",
            },
            {
              icon: "📋",
              title: "Precio cerrado por escrito",
              text: "Sales de la valoración con el presupuesto, las sesiones que hacen falta y lo que incluye la revisión. Sin «ya veremos cuántas van a ser».",
            },
            {
              icon: "🧾",
              title: "Producto trazable",
              text: "Marcas con registro sanitario y el lote de cada vial anotado en tu historia clínica. Si preguntas qué te hemos puesto, te lo enseñamos.",
            },
            {
              icon: "🕒",
              title: "Citas sin prisa",
              text: "Una hora para la primera valoración y margen entre pacientes. Nadie entra mientras estás saliendo.",
            },
            {
              icon: "🔁",
              title: "Revisión incluida",
              text: "A los quince días miramos el resultado y ajustamos lo que haya que ajustar sin coste añadido. Es parte del tratamiento, no un extra.",
            },
            {
              icon: "🤐",
              title: "Discreción",
              text: "Consultas individuales, entrada directa desde la calle y ninguna foto tuya en redes sin que la hayas autorizado por escrito.",
            },
          ],
        },
      },
      {
        type: "collection",
        anchor: "tratamientos",
        data: {
          title: "Lo que hacemos",
          parent: "tratamientos",
          limit: 6,
          layout: "rejilla",
          show_image: "no",
          more_label: "Ver todos los tratamientos",
        },
      },
      {
        type: "split",
        anchor: "equipo",
        data: {
          title: "Un equipo médico, no un mostrador comercial",
          side: "derecha",
          image: "",
          body:
            "<p>La consulta la pasa siempre un médico colegiado, y quien te valora es " +
            "quien te trata. No hay comerciales, no hay comisiones por tratamiento " +
            "vendido y nadie te llama a los tres días para ofrecerte un bono.</p>" +
            "<p>La clínica la dirige la doctora Marta Álvarez desde 2009, y el equipo " +
            "lleva junto una media de siete años. Eso se nota sobre todo en lo que no se " +
            "hace: en cuántas veces al mes alguien sale de aquí sin tratamiento porque " +
            "no era el momento.</p>",
          cta_label: "Conocer la clínica",
          cta_url: "/la-clinica",
        },
      },
      {
        type: "steps",
        anchor: "primera-visita",
        data: {
          title: "Tu primera visita, paso a paso",
          items: [
            {
              title: "Pides cita",
              text: "Por teléfono o desde el formulario. Te llamamos el mismo día laborable para cuadrar la hora.",
            },
            {
              title: "Valoración de una hora",
              text: "Historia clínica, análisis de la piel y fotografía de partida. Te explicamos qué se puede hacer, qué no y qué haríamos nosotros.",
            },
            {
              title: "Presupuesto por escrito",
              text: "Con las sesiones, los intervalos y el precio total. Te lo llevas a casa: aquí no se firma nada el primer día.",
            },
            {
              title: "Tratamiento y revisión",
              text: "El día que decidas. A los quince días revisamos el resultado y ajustamos lo que haga falta, sin coste.",
            },
          ],
        },
      },
      {
        /*
         * Opiniones inventadas, como todo lo demás de esta demo. En un sitio real este
         * bloque va vacío hasta que hay citas de pacientes que han dado permiso por
         * escrito: la prueba social falsa es lo primero que se comprueba y lo que más
         * daño hace cuando se cae.
         */
        type: "quotes",
        anchor: "opiniones",
        data: {
          title: "Lo que cuentan los pacientes",
          layout: "rejilla",
          autoplay: "no",
          items: [
            {
              quote:
                "Fui pensando que me harían de todo y salí con una crema y la recomendación de volver en seis meses. Volví, claro.",
              author: "Carmen R.",
              role: "Paciente desde 2021",
              photo: "",
            },
            {
              quote:
                "Es la primera vez que alguien me explica qué me va a poner, cuánto dura y qué pasa cuando deje de hacerlo. Sin misterio y sin prisa.",
              author: "Javier M.",
              role: "Paciente desde 2019",
              photo: "",
            },
            {
              quote:
                "Me daba miedo acabar con esa cara de estar operada. Nadie me ha dicho que me haya hecho nada; me dicen que tengo buena cara.",
              author: "Lucía B.",
              role: "Paciente desde 2023",
              photo: "",
            },
          ],
        },
      },
      {
        type: "faq",
        anchor: "preguntas",
        data: {
          title: "Lo que más nos preguntan",
          items: [
            {
              question: "¿La primera consulta cuesta algo?",
              answer:
                "No. La valoración es gratuita y no obliga a nada: dura una hora, la pasa un médico y termina con un presupuesto por escrito que te llevas a casa.",
            },
            {
              question: "¿Se va a notar que me he hecho algo?",
              answer:
                "Ese es justamente el criterio con el que trabajamos. Buscamos que descanses mejor la cara, no que cambie: si lo que pides supone un resultado evidente o poco natural, te lo decimos y no lo hacemos.",
            },
            {
              question: "¿Duele?",
              answer:
                "Depende del tratamiento. En la mayoría se usa anestesia tópica y la molestia es la de un pellizco; en los láseres ablativos, anestesia local. En la valoración te contamos exactamente qué vas a notar.",
            },
            {
              question: "¿Puedo volver a trabajar el mismo día?",
              answer:
                "En casi todos los tratamientos faciales, sí, contando con que puede quedar algo de rojez unas horas. El láser CO2 y algunos peelings medios requieren entre tres y siete días de recuperación, y eso se planifica contigo antes.",
            },
            {
              question: "¿Cuánto dura el resultado?",
              answer:
                "La toxina botulínica, entre cuatro y seis meses. Los rellenos con ácido hialurónico, de nueve a dieciocho meses según la zona y el producto. Los tratamientos de calidad de piel piden mantenimiento anual. Nadie te va a decir que es para siempre.",
            },
            {
              question: "¿Hay edad mínima o máxima?",
              answer:
                "Mínima, dieciocho años, y en tratamientos preventivos rara vez antes de los veinticinco. Máxima no hay: lo que hay es una valoración médica que decide qué tiene sentido en cada caso.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "Empecemos por la consulta",
          text: "Una hora, sin coste y sin compromiso. Si no hace falta hacerte nada, te lo diremos.",
          button_label: "Pedir valoración",
          button_url: "/contacto",
          tone: "color",
        },
      },
    ],
  },

  /* -------------------------------------------------------------- tratamientos */
  {
    slug: "tratamientos",
    title: "Tratamientos",
    position: 1,
    seo: {
      metaTitle: "Tratamientos — Clínica Álvarez, Valencia",
      metaDescription:
        "Toxina botulínica, ácido hialurónico, peelings médicos, láser CO2, depilación " +
        "láser y mesoterapia. Precio, duración y sesiones de cada uno, sin letra pequeña.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Tratamientos",
          subtitle:
            "Cada ficha lleva el precio, cuánto dura la sesión y cuántas hacen falta. " +
            "Cuál te conviene —y si te conviene alguno— se decide en la consulta.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "collection",
        anchor: "listado",
        data: {
          title: "",
          parent: "tratamientos",
          limit: 12,
          layout: "lista",
          show_image: "no",
          more_label: "",
        },
      },
      {
        type: "prose",
        anchor: "aviso-medico",
        data: {
          title: "Antes de elegir uno",
          width: "estrecho",
          body:
            "<p>Los precios de esta página son los de una sesión estándar y sirven para " +
            "hacerse una idea. El presupuesto real sale de la valoración, porque la " +
            "cantidad de producto y el número de sesiones dependen de cada cara.</p>" +
            "<p>Todos los tratamientos son actos médicos y todos tienen " +
            "contraindicaciones. En la consulta se revisan las tuyas: no es un trámite, " +
            "es la parte que decide si se hace o no.</p>",
        },
      },
      {
        type: "cta",
        data: {
          title: "¿No sabes cuál te toca?",
          text: "Ese es el trabajo de la primera consulta. Pídela y lo vemos con tu piel delante.",
          button_label: "Pedir valoración",
          button_url: "/contacto",
          tone: "claro",
        },
      },
    ],
  },
  {
    slug: "toxina-botulinica",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Toxina botulínica",
    position: 0,
    seo: {
      metaTitle: "Toxina botulínica en Valencia — Clínica Álvarez",
      metaDescription:
        "Arrugas de expresión en frente, entrecejo y patas de gallo. Desde 240 €, sesión " +
        "de 30 minutos y revisión a los quince días incluida.",
    },
    fields: {
      excerpt:
        "Suaviza las arrugas de expresión del tercio superior de la cara sin quitarte el " +
        "gesto. Es el tratamiento con el que más se nota la mano de quien lo pone.",
      cover_image: "",
      precio: "Desde 240 €",
      duracion: "30 minutos",
      sesiones: "1 sesión, con retoque a los 15 días si hace falta",
      body:
        "<p>La toxina botulínica relaja de forma temporal los músculos responsables de las " +
        "arrugas de expresión: las líneas de la frente, el entrecejo y las patas de gallo. " +
        "No rellena ni da volumen; sólo deja de marcarse lo que se marcaba al gesticular.</p>" +
        "<h2>Qué esperar</h2>" +
        "<p>El efecto empieza a verse a los tres o cuatro días y se asienta a los quince. " +
        "Dura entre cuatro y seis meses, y con el tiempo suele espaciarse: un músculo que " +
        "trabaja menos marca menos.</p>" +
        "<p>La dosis se calcula por zona y por fuerza muscular, no por «lo que se suele " +
        "poner». Ese cálculo es la diferencia entre descansar la mirada y perder la " +
        "expresión, y es el motivo por el que no lo vendemos por teléfono.</p>" +
        "<h2>Cómo es la sesión</h2>" +
        "<p>Media hora contando la valoración del día. Se aplica frío, se marcan los " +
        "puntos y se infiltra con aguja muy fina; la molestia es la de un pellizco corto. " +
        "Se sale sin vendajes y se puede volver al trabajo, evitando ejercicio intenso y " +
        "tumbarse las cuatro horas siguientes.</p>" +
        "<h2>Cuándo no se hace</h2>" +
        "<p>Embarazo y lactancia, enfermedades neuromusculares, infección activa en la " +
        "zona y alergia conocida a alguno de sus componentes. Se revisa en la consulta.</p>",
    },
  },
  {
    slug: "acido-hialuronico",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Ácido hialurónico",
    position: 1,
    seo: {
      metaTitle: "Ácido hialurónico en Valencia — Clínica Álvarez",
      metaDescription:
        "Relleno de surcos, labios y contorno facial con ácido hialurónico reticulado. " +
        "Desde 320 € la jeringa, con revisión a los quince días incluida.",
    },
    fields: {
      excerpt:
        "Devuelve volumen donde se ha perdido: surco nasogeniano, ojeras, pómulo, mentón " +
        "y labios. Reversible, que es lo que lo hace un tratamiento tranquilo.",
      cover_image: "",
      precio: "Desde 320 € / jeringa",
      duracion: "45 minutos",
      sesiones: "1 sesión, mantenimiento cada 9-18 meses",
      body:
        "<p>El ácido hialurónico es una sustancia que tu piel ya fabrica y que va " +
        "perdiendo con los años. Infiltrado en gel reticulado, repone el volumen que la " +
        "cara ha perdido y sostiene las estructuras que se han descolgado.</p>" +
        "<h2>Dónde se usa</h2>" +
        "<ul>" +
        "<li>Surco nasogeniano y comisuras, que son los que dan cara de cansancio.</li>" +
        "<li>Ojeras marcadas por pérdida de grasa, no por pigmento.</li>" +
        "<li>Pómulo y mentón, para recuperar la proporción del óvalo.</li>" +
        "<li>Labios: hidratación y contorno. Aquí nuestro límite es claro y lo decimos en " +
        "la consulta — si lo que buscas es un aumento evidente, no somos tu clínica.</li>" +
        "</ul>" +
        "<h2>Qué esperar</h2>" +
        "<p>El resultado se ve el mismo día, aunque la primera semana está algo inflamado. " +
        "Puede quedar algún hematoma pequeño que se cubre con maquillaje a las 24 horas. " +
        "Dura entre nueve y dieciocho meses según la zona, el producto y tu metabolismo.</p>" +
        "<h2>Reversible</h2>" +
        "<p>Es el único relleno que puede deshacerse: la hialuronidasa lo disuelve en " +
        "minutos. Por eso no trabajamos con materiales permanentes, aunque duren más y " +
        "salgan más baratos a la larga: lo que no se puede quitar tampoco se puede " +
        "corregir.</p>",
    },
  },
  {
    slug: "peeling-medico",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Peeling médico",
    position: 2,
    seo: {
      metaTitle: "Peeling médico en Valencia — Clínica Álvarez",
      metaDescription:
        "Manchas, marcas de acné y textura apagada. Peelings superficiales y medios " +
        "desde 150 € la sesión, en protocolos de tres a seis sesiones.",
    },
    fields: {
      excerpt:
        "Renueva la capa superficial de la piel para tratar manchas, marcas de acné y esa " +
        "textura apagada que ninguna crema termina de arreglar.",
      cover_image: "",
      precio: "Desde 150 € / sesión",
      duracion: "40 minutos",
      sesiones: "3 a 6 sesiones, cada 3-4 semanas",
      body:
        "<p>Un peeling médico aplica un ácido a una concentración que sólo puede usarse en " +
        "consulta para provocar una renovación controlada de la piel. Al regenerarse, " +
        "sale más uniforme en color y más lisa en textura.</p>" +
        "<h2>Para qué funciona bien</h2>" +
        "<p>Melasma y manchas solares, marcas post-acné, poro dilatado y piel apagada. En " +
        "manchas hormonales el peeling es una parte del plan, no el plan entero: sin " +
        "fotoprotección diaria vuelven, y eso se dice antes de empezar, no después.</p>" +
        "<h2>Cómo es la sesión</h2>" +
        "<p>Se limpia la piel, se aplica el ácido en capas controlando el tiempo y se " +
        "neutraliza. Escuece unos minutos. Según la profundidad, la piel se descama entre " +
        "el segundo y el quinto día; en los superficiales apenas se nota y se puede hacer " +
        "vida normal desde el primer momento.</p>" +
        "<h2>Después</h2>" +
        "<p>Fotoprotección 50 sin excepciones y nada de rascar la descamación. Los " +
        "protocolos se planifican de octubre a marzo siempre que se puede, porque el sol " +
        "de aquí en verano juega en contra.</p>",
    },
  },
  {
    slug: "laser-co2",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Láser CO2 fraccionado",
    position: 3,
    seo: {
      metaTitle: "Láser CO2 fraccionado en Valencia — Clínica Álvarez",
      metaDescription:
        "Cicatrices de acné, arrugas finas y flacidez leve. 390 € la sesión facial " +
        "completa, con cinco a siete días de recuperación.",
    },
    fields: {
      excerpt:
        "El tratamiento con el que más cambia la calidad de la piel, y también el que más " +
        "recuperación pide. Cicatrices de acné, arrugas finas y flacidez leve.",
      cover_image: "",
      precio: "390 € / sesión facial completa",
      duracion: "60 minutos",
      sesiones: "1 a 3 sesiones, separadas 2 meses",
      body:
        "<p>El láser CO2 fraccionado hace miles de microcolumnas de calor en la piel " +
        "dejando intacto el tejido de alrededor. Ese daño controlado dispara la " +
        "producción de colágeno durante los meses siguientes.</p>" +
        "<h2>Para qué</h2>" +
        "<p>Cicatrices de acné, arrugas finas del contorno de ojos y del código de barras, " +
        "poro dilatado y flacidez leve. Es el tratamiento con el que más cambia la " +
        "textura, y no tiene sustituto en cicatrices marcadas.</p>" +
        "<h2>La recuperación, en serio</h2>" +
        "<p>De cinco a siete días. Los dos primeros la cara está roja e hinchada, luego " +
        "descama como una quemadura solar fuerte. Se sale a la calle desde el tercer día, " +
        "pero no se va a una boda esa semana. Lo planificamos con tu calendario delante y " +
        "nunca en pleno verano.</p>" +
        "<h2>Antes de la sesión</h2>" +
        "<p>Quince días sin exposición solar, preparación con despigmentantes en pieles " +
        "morenas y anestesia local en crema una hora antes. Se sale con la pauta de curas " +
        "por escrito y un teléfono directo por si algo no va como se esperaba.</p>",
    },
  },
  {
    slug: "depilacion-laser",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Depilación láser de diodo",
    position: 4,
    seo: {
      metaTitle: "Depilación láser de diodo en Valencia — Clínica Álvarez",
      metaDescription:
        "Depilación médica con láser de diodo, desde 45 € por zona pequeña. Bonos de seis " +
        "sesiones y valoración previa del tipo de piel y del vello.",
    },
    fields: {
      excerpt:
        "Láser de diodo con refrigeración, válido para casi todos los fototipos. Por " +
        "zonas o por bonos, siempre con valoración médica antes de la primera sesión.",
      cover_image: "",
      precio: "Desde 45 € / zona",
      duracion: "20 a 60 minutos según zona",
      sesiones: "6 a 8 sesiones, cada 4-8 semanas",
      body:
        "<p>El láser de diodo actúa sobre el pigmento del pelo y destruye el folículo en " +
        "fase de crecimiento. Como no todos los pelos están en esa fase a la vez, hacen " +
        "falta varias sesiones espaciadas: no es que la primera no funcione.</p>" +
        "<h2>Por qué aquí y no en cualquier sitio</h2>" +
        "<p>Porque antes hay una valoración médica. El vello excesivo en mujeres puede " +
        "tener una causa hormonal que conviene mirar, hay lunares que no deben recibir " +
        "láser y hay medicaciones que lo contraindican. Nada de eso lo detecta un bono " +
        "comprado por internet.</p>" +
        "<h2>Cómo es la sesión</h2>" +
        "<p>Se afeita la zona el día antes —no se depila con cera— y se aplica el láser " +
        "con el cabezal refrigerado. Se nota calor y algún pinchazo. Al terminar, frío y " +
        "crema calmante; se puede hacer vida normal evitando sol directo y sauna 48 horas.</p>" +
        "<h2>Bonos</h2>" +
        "<p>Los bonos de seis sesiones salen a mitad de precio que las sueltas y caducan a " +
        "los dos años. Si terminas antes de gastarlas, se devuelve lo no usado: pagar por " +
        "sesiones que ya no necesitas no nos parece un buen negocio a medio plazo.</p>",
    },
  },
  {
    slug: "mesoterapia-facial",
    parentSlug: "tratamientos",
    typeKey: "tratamiento",
    title: "Mesoterapia facial y skinboosters",
    position: 5,
    seo: {
      metaTitle: "Mesoterapia facial y skinboosters — Clínica Álvarez, Valencia",
      metaDescription:
        "Hidratación profunda y luminosidad con ácido hialurónico no reticulado, " +
        "vitaminas y aminoácidos. Desde 190 € la sesión.",
    },
    fields: {
      excerpt:
        "Hidratación desde dentro para pieles apagadas, deshidratadas o fumadoras. No " +
        "cambia la forma de nada: cambia cómo se ve la piel de cerca.",
      cover_image: "",
      precio: "Desde 190 € / sesión",
      duracion: "45 minutos",
      sesiones: "3 sesiones iniciales, mantenimiento cada 6 meses",
      body:
        "<p>Consiste en microinyecciones de ácido hialurónico no reticulado, vitaminas y " +
        "aminoácidos repartidas por toda la cara. No aporta volumen ni corrige arrugas " +
        "profundas: mejora la hidratación, la luminosidad y la elasticidad.</p>" +
        "<h2>Para quién tiene sentido</h2>" +
        "<p>Pieles deshidratadas, apagadas por el sol o el tabaco, y como preparación " +
        "antes de un evento —contando con que hay que hacerla con dos semanas de margen, " +
        "no la víspera. También en cuello, escote y dorso de las manos, que es donde " +
        "primero se nota la edad y donde casi nadie mira.</p>" +
        "<h2>Cómo es la sesión</h2>" +
        "<p>Anestesia en crema, cuarenta y cinco minutos y pequeños habones que " +
        "desaparecen en unas horas. Puede quedar algún hematoma leve. Al día siguiente se " +
        "hace vida normal.</p>" +
        "<h2>Qué no hace</h2>" +
        "<p>No sustituye a la crema ni a la fotoprotección, y no tensa. Si lo que buscas " +
        "es un efecto lifting, este no es el tratamiento y te lo diremos en la consulta " +
        "en vez de vendértelo igual.</p>",
    },
  },

  /* ------------------------------------------------------------------ precios */
  {
    slug: "precios",
    title: "Precios",
    position: 2,
    seo: {
      metaTitle: "Precios — Clínica Álvarez",
      metaDescription:
        "Valoración médica sin coste, sesiones sueltas y bonos. Precios cerrados por " +
        "escrito antes de empezar y financiación sin intereses a partir de 600 €.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Precios",
          subtitle:
            "Publicarlos nos parece lo mínimo. Lo que no se puede publicar es tu " +
            "presupuesto: sale de la consulta, porque depende de cuánto producto " +
            "necesites y de cuántas sesiones, no de una tarifa plana.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "",
        },
      },
      {
        type: "pricing",
        anchor: "tarifas",
        data: {
          title: "",
          intro: "IVA incluido. Los bonos caducan a los dos años y lo no usado se devuelve.",
          plans: [
            {
              name: "Valoración médica",
              price: "0 €",
              period: "",
              description: "La primera consulta, siempre. Sin compromiso y sin tratamiento el mismo día.",
              features: [
                "Una hora con un médico colegiado",
                "Historia clínica y análisis de la piel",
                "Fotografía de partida para comparar",
                "Presupuesto por escrito que te llevas",
              ].join("\n"),
              button_label: "Pedir cita",
              button_url: "/contacto",
              featured: "no",
            },
            {
              name: "Sesión suelta",
              price: "Desde 190 €",
              period: "/sesión",
              description: "Para tratamientos puntuales o de mantenimiento en pacientes que ya conocemos.",
              features: [
                "Toxina botulínica desde 240 €",
                "Ácido hialurónico desde 320 € la jeringa",
                "Peeling médico desde 150 €",
                "Mesoterapia desde 190 €",
                "Revisión a los 15 días incluida",
              ].join("\n"),
              button_label: "Ver tratamientos",
              button_url: "/tratamientos",
              featured: "no",
            },
            {
              name: "Plan de piel",
              price: "690 €",
              period: "/3 sesiones",
              description: "El formato con el que mejor funcionan los tratamientos de calidad de piel.",
              features: [
                "Tres sesiones planificadas en cuatro meses",
                "Peeling, mesoterapia o combinación de ambos",
                "Pauta de cuidado en casa incluida",
                "Revisión entre sesiones",
                "Fotografía de seguimiento",
              ].join("\n"),
              button_label: "Pedir valoración",
              button_url: "/contacto",
              featured: "sí",
            },
          ],
        },
      },
      {
        type: "features",
        anchor: "incluido",
        data: {
          title: "Incluido en cualquier tratamiento",
          intro: "",
          columns: "4",
          items: [
            { icon: "🩺", title: "Valoración previa", text: "Gratuita y sin compromiso." },
            { icon: "📄", title: "Presupuesto cerrado", text: "Por escrito antes de empezar." },
            { icon: "🔁", title: "Revisión a los 15 días", text: "Y el ajuste que haga falta." },
            { icon: "📞", title: "Teléfono directo", text: "Para dudas los días siguientes." },
          ],
        },
      },
      {
        type: "faq",
        anchor: "pagos",
        data: {
          title: "Sobre el pago",
          items: [
            {
              question: "¿Se puede financiar?",
              answer:
                "Sí, a partir de 600 € y hasta en doce meses sin intereses, con una financiera con la que trabajamos desde hace años. Se resuelve en la propia clínica el día del tratamiento.",
            },
            {
              question: "¿Hay que pagar algo por adelantado?",
              answer:
                "No para la valoración. En tratamientos con material específico se pide una señal del 20 % al reservar fecha, que se descuenta del total y se devuelve si avisas con 48 horas.",
            },
            {
              question: "¿Qué pasa si tengo que anular la cita?",
              answer:
                "Avísanos con 24 horas y no pasa nada. Somos una clínica pequeña y una silla vacía es una persona que se ha quedado sin sitio esa semana.",
            },
            {
              question: "¿Los precios de la web son los definitivos?",
              answer:
                "Son los de una sesión estándar. El tuyo sale de la valoración y no cambia después: lo que se firma en el presupuesto es lo que se cobra, aunque la sesión se alargue.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "El presupuesto empieza por una consulta",
          text: "Gratuita, de una hora y sin que salgas de aquí con nada hecho.",
          button_label: "Pedir valoración",
          button_url: "/contacto",
          tone: "color",
        },
      },
    ],
  },

  /* --------------------------------------------------------------- la clínica */
  {
    slug: "la-clinica",
    title: "La clínica",
    position: 3,
    seo: {
      metaTitle: "La clínica y el equipo — Clínica Álvarez, Valencia",
      metaDescription:
        "Quince años en Cirilo Amorós, cuatro médicos colegiados y una forma de trabajar " +
        "que empieza por decir que no cuando toca.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Quince años haciendo lo mismo",
          subtitle:
            "Abrimos en 2009 en un primero de Cirilo Amorós con dos consultas y una idea " +
            "que sigue igual: que a la medicina estética se viene a que un médico te " +
            "diga la verdad.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "",
        },
      },
      {
        type: "split",
        anchor: "historia",
        data: {
          title: "Por qué abrimos",
          side: "derecha",
          image: "",
          body:
            "<p>La doctora Marta Álvarez venía de doce años en dermatología hospitalaria y " +
            "de ver llegar a consulta las consecuencias de tratamientos hechos deprisa en " +
            "sitios donde nadie había mirado una historia clínica.</p>" +
            "<p>La clínica nació de ahí, así que su forma de trabajar viene de una " +
            "consulta de hospital y no de un centro de belleza: valoración, plan, " +
            "consentimiento informado y seguimiento. Es más lento y funciona mejor.</p>",
          cta_label: "",
          cta_url: "",
        },
      },
      {
        type: "stats",
        data: {
          title: "",
          items: [
            { value: "15", label: "Años en el mismo sitio" },
            { value: "4", label: "Médicos colegiados" },
            { value: "7", label: "Años de media del equipo con nosotros" },
            { value: "3", label: "Consultas y una sala de láser" },
          ],
        },
      },
      {
        /*
         * Nombres y trayectorias inventados. En un sitio real este bloque lleva el número
         * de colegiado de cada médico: es lo primero que comprueba un paciente informado
         * y lo exige la publicidad sanitaria.
         */
        type: "team",
        anchor: "equipo",
        data: {
          title: "El equipo",
          items: [
            {
              name: "Dra. Marta Álvarez",
              role: "Directora médica · Dermatología",
              photo: "",
              bio: "Fundadora de la clínica. Doce años previos en dermatología hospitalaria y responsable de los protocolos de láser.",
            },
            {
              name: "Dr. Nicolás Ferrer",
              role: "Medicina estética facial",
              photo: "",
              bio: "Lleva la consulta de rellenos y toxina desde 2014. Formador en técnicas de infiltración facial.",
            },
            {
              name: "Elena Ruiz",
              role: "Enfermera",
              photo: "",
              bio: "Coordina las curas, el seguimiento posterior y el teléfono directo de los días de después.",
            },
            {
              name: "Sara Beltrán",
              role: "Coordinación de pacientes",
              photo: "",
              bio: "La voz del teléfono y quien cuadra las agendas para que nadie espere más de diez minutos.",
            },
          ],
        },
      },
      {
        type: "prose",
        anchor: "instalaciones",
        data: {
          title: "La clínica por dentro",
          width: "normal",
          body:
            "<p>Tres consultas individuales, una sala de láser con la señalización y la " +
            "protección que exige la normativa, y una sala de curas. Entrada directa " +
            "desde la calle, sin recepción compartida con otros negocios y con ascensor.</p>" +
            "<p>Estamos autorizados como centro sanitario por la Conselleria de Sanitat, " +
            "el material es de un solo uso y los residuos biosanitarios los retira una " +
            "empresa autorizada. Son cosas que no se ven y que separan una clínica de un " +
            "salón.</p>" +
            "<p>Horario de lunes a viernes de 9:00 a 20:00, sin cerrar a mediodía, y " +
            "sábados por la mañana de 10:00 a 14:00 con cita previa.</p>",
        },
      },
      {
        type: "cta",
        data: {
          title: "Ven a conocernos",
          text: "La primera visita es una conversación de una hora. Se sale con un plan, no con una factura.",
          button_label: "Pedir valoración",
          button_url: "/contacto",
          tone: "claro",
        },
      },
    ],
  },

  /* ----------------------------------------------------------- primera visita */
  {
    slug: "primera-visita",
    title: "Primera visita",
    position: 4,
    seo: {
      metaTitle: "Cómo es la primera visita — Clínica Álvarez",
      metaDescription:
        "Una hora, con un médico, sin tratamiento el mismo día y con presupuesto por " +
        "escrito. Qué llevar, qué se hace y qué pasa después.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Cómo es la primera visita",
          subtitle:
            "Contado entero, para que nadie venga sin saber a qué. Dura una hora y " +
            "termina sin ningún tratamiento hecho: eso es a propósito.",
          cta_label: "Pedir cita",
          cta_url: "/contacto",
          align: "centro",
          image: "",
        },
      },
      {
        type: "steps",
        anchor: "pasos",
        data: {
          title: "",
          items: [
            {
              title: "Nos cuentas qué te molesta",
              text: "No hace falta que sepas el nombre de ningún tratamiento. Con señalar en el espejo lo que no te gusta al mirarte es suficiente para empezar.",
            },
            {
              title: "Historia clínica",
              text: "Antecedentes, alergias, medicación y tratamientos estéticos previos. Es la parte que decide qué se puede hacer, y por eso ocupa quince minutos y no dos.",
            },
            {
              title: "Exploración y fotografía",
              text: "Se valora la piel con luz adecuada y se toman fotos de partida. Sirven para comparar de verdad dentro de tres meses, cuando la memoria ya no vale.",
            },
            {
              title: "Qué haríamos y qué no",
              text: "Te explicamos las opciones con sus riesgos, su duración y su precio, y también lo que no haríamos aunque lo pidas. Muchas primeras visitas terminan en fotoprotección y volver en seis meses.",
            },
            {
              title: "Presupuesto por escrito",
              text: "Con las sesiones, los intervalos y el total. Te lo llevas a casa. Aquí no se firma nada el mismo día ni hay descuentos que caduquen esta tarde.",
            },
            {
              title: "Tú decides cuándo",
              text: "Si sigues adelante, se reserva fecha y se firma el consentimiento informado con tiempo para leerlo. Si no, no pasa absolutamente nada.",
            },
          ],
        },
      },
      {
        type: "faq",
        anchor: "dudas",
        data: {
          title: "Dudas de la primera vez",
          items: [
            {
              question: "¿Tengo que llevar algo?",
              answer:
                "La medicación que tomes habitualmente apuntada, y si te has hecho tratamientos estéticos antes, lo que sepas de ellos: qué producto, cuándo y dónde. Ven sin maquillaje si puedes, o llega diez minutos antes y te lo desmaquillamos aquí.",
            },
            {
              question: "¿Me van a hacer algo ese día?",
              answer:
                "No. No es una norma administrativa, es criterio médico: entre saber qué se va a hacer y hacerlo tiene que haber tiempo para leer el consentimiento y para cambiar de opinión.",
            },
            {
              question: "¿Puedo ir sólo a informarme?",
              answer:
                "Es exactamente para lo que es. La consulta no se cobra y no la usamos para venderte nada: si de ahí no sale un tratamiento, ha funcionado igual.",
            },
            {
              question: "¿Puedo venir acompañada?",
              answer:
                "Sí, y en la primera visita suele ayudar. Las consultas son individuales y hay sitio para dos.",
            },
            {
              question: "¿Cuánto tardan en darme cita?",
              answer:
                "Entre 48 y 72 horas para valoración. Para tratamiento, según agenda, normalmente en una o dos semanas.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "Reserva tu hora",
          text: "Te llamamos el mismo día laborable para cuadrarla.",
          button_label: "Pedir valoración",
          button_url: "/contacto",
          tone: "color",
        },
      },
    ],
  },

  /* --------------------------------------------------------------------- blog */
  {
    slug: "blog",
    title: "Consejos",
    position: 5,
    seo: {
      metaTitle: "Consejos — Clínica Álvarez",
      metaDescription:
        "Lo que contamos en consulta, escrito. Sin promesas, sin antes y después y sin " +
        "tratamientos milagrosos.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Consejos",
          subtitle: "Lo que explicamos en consulta, escrito para leerlo antes de venir.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "",
        },
      },
      {
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
    slug: "que-preguntar-antes-de-un-relleno",
    parentSlug: "blog",
    typeKey: "post",
    title: "Seis preguntas que deberías hacer antes de dejar que te infiltren nada",
    position: 0,
    publishedAt: "2026-05-14T09:00:00Z",
    seo: {
      metaTitle: "Qué preguntar antes de un relleno facial — Clínica Álvarez",
      metaDescription:
        "Qué producto, qué lote, quién lo pone y qué pasa si no te gusta. Seis preguntas " +
        "que cualquier clínica seria contesta sin incomodarse.",
    },
    fields: {
      excerpt:
        "Si alguna de estas seis preguntas incomoda a quien te va a tratar, ya tienes la " +
        "respuesta que necesitabas.",
      cover_image: "",
      body:
        "<p>La mayoría de los problemas que vemos en consulta no vienen de tratamientos " +
        "difíciles, sino de tratamientos hechos sin preguntar nada. Estas seis preguntas " +
        "no requieren saber medicina y contestarlas cuesta dos minutos.</p>" +
        "<h2>1. ¿Quién me va a tratar y cuál es su número de colegiado?</h2>" +
        "<p>Infiltrar es un acto médico. Puede hacerlo un médico o, en algunos supuestos y " +
        "bajo prescripción, personal de enfermería. El número de colegiado es público y " +
        "se comprueba en un minuto en la web del colegio.</p>" +
        "<h2>2. ¿Qué producto exactamente, y puedo ver la caja?</h2>" +
        "<p>Debe tener marcado CE y registro sanitario. En una clínica normal se abre el " +
        "vial delante de ti y el lote se pega en tu historia. Si no te lo enseñan, no es " +
        "por prisa.</p>" +
        "<h2>3. ¿Es reversible?</h2>" +
        "<p>El ácido hialurónico se disuelve con hialuronidasa. Los materiales permanentes " +
        "o semipermanentes no: duran más y salen más baratos, y cuando algo va mal la " +
        "solución pasa por cirugía. Merece la pena saber cuál te van a poner.</p>" +
        "<h2>4. ¿Qué pasa si me sale un hematoma o un nódulo?</h2>" +
        "<p>La respuesta correcta incluye un teléfono al que llamar y una revisión sin " +
        "coste. Las complicaciones leves son parte del oficio; lo que no es normal es que " +
        "no haya nadie al otro lado el sábado.</p>" +
        "<h2>5. ¿Cuántas sesiones y cuánto va a costar en total?</h2>" +
        "<p>Por escrito y antes de empezar. El presupuesto abierto —«ya iremos viendo»— es " +
        "la forma educada de que el precio final lo decidas cuando ya estás dentro.</p>" +
        "<h2>6. ¿Qué pasa si dejo de hacérmelo?</h2>" +
        "<p>Nada irreversible, si el tratamiento es el adecuado: la cara vuelve poco a " +
        "poco a donde estaba. Cualquiera que te diga que no hacértelo «lo empeora» te " +
        "está vendiendo miedo, y el miedo es mal criterio para decidir.</p>" +
        "<p>Si al hacer estas preguntas notas incomodidad en vez de respuestas, tienes toda " +
        "la información que necesitabas sobre esa clínica.</p>",
    },
  },
  {
    slug: "cuando-decimos-que-no",
    parentSlug: "blog",
    typeKey: "post",
    title: "Cuando la mejor consulta termina sin tratamiento",
    position: 1,
    publishedAt: "2026-07-02T09:00:00Z",
    seo: {
      metaTitle: "Cuando decimos que no — Clínica Álvarez",
      metaDescription:
        "Una de cada cinco primeras visitas termina sin tratamiento. Por qué eso es una " +
        "buena señal y no una oportunidad perdida.",
    },
    fields: {
      excerpt:
        "Una de cada cinco primeras visitas termina en fotoprotección y volver en seis " +
        "meses. Es la parte del trabajo que no factura y la que más nos importa.",
      cover_image: "",
      body:
        "<p>Llevamos la cuenta: alrededor de una de cada cinco primeras visitas termina sin " +
        "que propongamos ningún tratamiento. No es una postura comercial, es que muchas " +
        "veces es lo que corresponde.</p>" +
        "<h2>Cuando lo que hay no es un problema estético</h2>" +
        "<p>Una piel apagada por dormir cinco horas, un vello que ha aparecido de golpe, " +
        "unas ojeras que son la sombra del hueso y no una pérdida de grasa. En el primer " +
        "caso el tratamiento no dura; en el segundo hay que estudiar por qué; en el " +
        "tercero el relleno empeora el resultado.</p>" +
        "<h2>Cuando no es el momento</h2>" +
        "<p>Un peeling en julio con una boda en la playa en agosto. Un láser CO2 la semana " +
        "antes de un viaje. Un embarazo en curso o una lactancia. Aquí el no es un " +
        "«todavía no» y se pone fecha en la agenda.</p>" +
        "<h2>Cuando lo que se pide no va a gustar</h2>" +
        "<p>Ocurre con las referencias que se traen del móvil. Una cara que se ve bien en " +
        "una foto con filtro es a menudo el resultado de una estructura ósea distinta de " +
        "la tuya, y perseguirla con producto lleva al mismo sitio siempre: una cara que " +
        "no se parece a la de nadie. Eso lo decimos en la consulta, aunque incomode.</p>" +
        "<h2>Qué pasa después de un no</h2>" +
        "<p>Casi siempre, que esa persona vuelve. A veces a los seis meses, a veces al " +
        "año y a veces trayendo a alguien. Decir que no cuesta una factura hoy y es lo " +
        "único que sostiene una consulta durante quince años.</p>",
    },
  },

  /* ----------------------------------------------------------------- contacto */
  {
    slug: "contacto",
    title: "Contacto y cita",
    position: 6,
    seo: {
      metaTitle: "Pedir cita — Clínica Álvarez, Valencia",
      metaDescription:
        "Calle de Cirilo Amorós 42, Valencia. Teléfono +34 960 000 000, de lunes a " +
        "viernes de 9:00 a 20:00. Valoración médica sin coste.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Pedir cita",
          subtitle:
            "Por teléfono es lo más rápido. Si prefieres que te llamemos nosotros, deja " +
            "tus datos abajo y lo hacemos el mismo día laborable.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "",
        },
      },
      {
        type: "prose",
        anchor: "donde-estamos",
        data: {
          title: "Dónde estamos",
          width: "estrecho",
          body:
            "<p><strong>Clínica Álvarez</strong><br>Calle de Cirilo Amorós 42, 2.º<br>" +
            "46004 Valencia</p>" +
            "<p><strong>Teléfono</strong><br><a href=\"tel:+34960000000\">+34 960 000 000</a><br>" +
            "<strong>Correo</strong><br><a href=\"mailto:hola@clinicaalvarez.example\">hola@clinicaalvarez.example</a></p>" +
            "<p><strong>Horario</strong><br>Lunes a viernes, de 9:00 a 20:00 (sin cerrar a " +
            "mediodía)<br>Sábados, de 10:00 a 14:00 con cita previa</p>" +
            "<p><strong>Cómo llegar</strong><br>Metro Colón, a cinco minutos andando. " +
            "Parking público en Porta de la Mar. Entrada directa desde la calle, con " +
            "ascensor.</p>",
        },
      },
      {
        type: "contact",
        anchor: "formulario",
        data: FORMULARIO,
      },
    ],
  },

  /* ----------------------------------------------------------------- legales */
  {
    slug: "aviso-legal",
    title: "Aviso legal",
    position: 7,
    seo: { metaTitle: "Aviso legal — Clínica Álvarez" },
    sections: [
      { type: "legal", data: { document: "aviso-legal", show_disclaimer: "sí" } },
    ],
  },
  {
    slug: "politica-de-privacidad",
    title: "Política de privacidad",
    position: 8,
    seo: { metaTitle: "Política de privacidad — Clínica Álvarez" },
    sections: [
      { type: "legal", data: { document: "privacidad", show_disclaimer: "sí" } },
    ],
  },
  {
    slug: "politica-de-cookies",
    title: "Política de cookies",
    position: 9,
    seo: { metaTitle: "Política de cookies — Clínica Álvarez" },
    sections: [
      { type: "legal", data: { document: "cookies", show_disclaimer: "sí" } },
    ],
  },
];

/* ---------------------------------------------------------------------- menús */

const MENUS: Record<"main" | "footer" | "legal", EntradaMenu[]> = {
  main: [
    { label: "Tratamientos", path: "/tratamientos" },
    { label: "Precios", path: "/precios" },
    { label: "La clínica", path: "/la-clinica" },
    { label: "Primera visita", path: "/primera-visita" },
    { label: "Pedir cita", path: "/contacto" },
  ],
  footer: [
    { label: "Consejos", path: "/blog" },
    { label: "Equipo", path: "/la-clinica" },
    { label: "+34 960 000 000", url: "tel:+34960000000" },
    { label: "hola@clinicaalvarez.example", url: "mailto:hola@clinicaalvarez.example" },
  ],
  legal: [
    { label: "Aviso legal", path: "/aviso-legal" },
    { label: "Privacidad", path: "/politica-de-privacidad" },
    { label: "Cookies", path: "/politica-de-cookies" },
  ],
};

/* ------------------------------------------------------------------ escritura */

const CLINICA: Contenido = {
  tenant: TENANT,
  siteName: SITE_NAME,
  tagline: TAGLINE,
  theme: THEME,
  contactEmail: CONTACT_EMAIL,
  socialLinks: SOCIAL,
  business: BUSINESS,
  contentTypes: [TIPO_TRATAMIENTO],
  pages: PAGINAS,
  menus: MENUS,
};

await ejecutar(CLINICA);

console.log(
  "\x1b[2mDatos de empresa, equipo y opiniones son inventados: cámbialos en Ajustes antes " +
    "de enseñar esto como si fuera una clínica real.\x1b[0m"
);
