#!/usr/bin/env node
import { ejecutar, type Contenido, type Pagina, type EntradaMenu, type TipoContenido } from "./lib/site-seed";
import type { ImagenRemota } from "./lib/site-media";
import type { FieldDefinition } from "../src/lib/fields/types";

/**
 * Panadería Sol: la web que necesita un obrador de barrio, entera.
 *
 *   npx tsx scripts/panaderia.ts            # escribe en la base del inquilino
 *   npx tsx scripts/panaderia.ts --dry      # enseña qué haría y no toca nada
 *
 * Contenido inventado, como el de `clinica.ts`: la sociedad, el CIF, los precios, el
 * equipo y las opiniones no existen, y el teléfono y el dominio son de los rangos
 * reservados para ejemplos para que nadie reciba llamadas de una demostración.
 *
 * Las fotos sí son reales: se descargan de Pexels (licencia libre, sin atribución
 * obligatoria) y se registran en la biblioteca del sitio como si se hubieran subido por el
 * backoffice. Se declaran con su autoría en `IMAGENES` de todas formas, porque «de dónde
 * salió esta foto» es una pregunta que aparece siempre y tarde.
 *
 * Qué se ha decidido y por qué, en el contenido:
 *
 * - **Los alérgenos van en cada producto**, como campo declarado y no como texto suelto al
 *   final. Es información obligatoria en venta de alimentos, y un campo se puede listar,
 *   buscar y comprobar; un párrafo se olvida en el tercer producto.
 * - **Los horarios están en la portada y en contacto.** «¿A qué hora abren?» y «¿tenéis
 *   pan por la tarde?» son el 80 % de las llamadas a una panadería.
 * - **Encargos con formulario propio**, con fecha de recogida y alergias: es el trabajo que
 *   de verdad se pierde por no poder pedirlo a las once de la noche.
 */

const TENANT = "panaderia";

/* ---------------------------------------------------------------- identidad */

const SITE_NAME = "Panadería Sol";
const TAGLINE = "Masa madre, horno de solera y pan del día";

/**
 * La paleta.
 *
 * Marrón de corteza como color de peso, crema como fondo y el amarillo del sol —que es lo
 * que hay en el nombre— reservado para lo único que hay que pulsar. El error del sector es
 * el marrón por todas partes: una web entera color pan se lee como una carpeta vieja, así
 * que el marrón sostiene y el crema es lo que se ve.
 *
 * Titulares en Lora: una serif con algo de calor, que es exactamente lo que no da la serif
 * del sistema. Es la única concesión —una petición a Google Fonts, con lo que eso implica
 * para la IP del visitante— y se quita cambiando `fontHeading` a `system-serif` sin tocar
 * nada más.
 */
const THEME = {
  daisyuiTheme: "light",
  primaryColor: "#6B4423",
  secondaryColor: "#D9B382",
  accentColor: "#E8A317",
  baseColor: "#FDF8EF",
  borderRadius: "1rem",
  fontHeading: "lora",
  fontBody: "system",
  containerWidth: "normal",
  typeScale: "amplia",
} as const;

const BUSINESS: Record<string, string> = {
  legalName: "Hornos del Sol, S.L.",
  tradeName: "Panadería Sol",
  taxId: "B00000000",
  address: "Calle del Sol 14",
  postalCode: "28012",
  city: "Madrid",
  province: "Madrid",
  country: "España",
  email: "hola@panaderiasol.example",
  phone: "+34 910 000 000",
  registry:
    "Registro Mercantil de Madrid, tomo 21.418, folio 62, hoja M-380114. " +
    "Registro General Sanitario de Empresas Alimentarias n.º 20.00000000/M",
  hosting: "Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107 (EE. UU.)",
};

const CONTACT_EMAIL = "hola@panaderiasol.example";
const SOCIAL: Record<string, string> = {
  instagram: "https://instagram.com/panaderiasol",
  facebook: "https://facebook.com/panaderiasol",
};

/* ------------------------------------------------------------------ fotos */

/**
 * Las fotos, de Pexels. Se descargan al sembrar y quedan en la biblioteca del sitio.
 *
 * El texto alternativo se escribe aquí y no se deja para luego: es lo que oye quien navega
 * con lector de pantalla y lo único que queda si la imagen no carga.
 */
const IMAGENES: ImagenRemota[] = [
  {
    key: "portada",
    url: "https://images.pexels.com/photos/105861/pexels-photo-105861.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Cesta de mimbre con panes rústicos recién horneados y enharinados",
    credit: "Pexels · foto 105861",
  },
  {
    key: "obrador",
    url: "https://images.pexels.com/photos/3218467/pexels-photo-3218467.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Manos de un panadero formando piezas de masa sobre una mesa enharinada",
    credit: "Pexels · foto 3218467",
  },
  {
    key: "escaparate",
    url: "https://images.pexels.com/photos/3341067/pexels-photo-3341067.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Escaparate de una panadería con bandejas de bollería y pasteles",
    credit: "Pexels · foto 3341067",
  },
  {
    key: "amasando",
    url: "https://images.pexels.com/photos/7447297/pexels-photo-7447297.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Panadero con gorro y delantal trabajando la masa en el obrador",
    credit: "Pexels · foto 7447297",
  },
  {
    key: "croissants",
    url: "https://images.pexels.com/photos/7966375/pexels-photo-7966375.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Manos colocando croissants sin hornear en una bandeja con papel",
    credit: "Pexels · foto 7966375",
  },
  {
    key: "croissant",
    url: "https://images.pexels.com/photos/3892469/pexels-photo-3892469.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Croissant hojaldrado sobre una tabla de madera",
    credit: "Pexels · foto 3892469",
  },
  {
    key: "panes",
    url: "https://images.pexels.com/photos/10202998/pexels-photo-10202998.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Varios panes de distintas harinas, uno de ellos cubierto de semillas",
    credit: "Pexels · foto 10202998",
  },
  {
    key: "bollos",
    url: "https://images.pexels.com/photos/1287278/pexels-photo-1287278.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Bollos redondos recién horneados y espolvoreados de harina",
    credit: "Pexels · foto 1287278",
  },
  {
    key: "cesta",
    url: "https://images.pexels.com/photos/1871024/pexels-photo-1871024.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Cesta con barras y panecillos variados con semillas",
    credit: "Pexels · foto 1871024",
  },
  {
    key: "tarta",
    url: "https://images.pexels.com/photos/4018839/pexels-photo-4018839.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Tarta de manzana casera recién sacada del molde, con manzanas al lado",
    credit: "Pexels · foto 4018839",
  },
  {
    key: "pasteleria",
    url: "https://images.pexels.com/photos/30890368/pexels-photo-30890368.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Vitrina de pastelería vista desde la calle, con bandejas de dulces",
    credit: "Pexels · foto 30890368",
  },
  {
    key: "mostrador",
    url: "https://images.pexels.com/photos/30095179/pexels-photo-30095179.jpeg?auto=compress&cs=tinysrgb&w=1600",
    alt: "Mostrador con café para llevar y vitrina de pasteles individuales",
    credit: "Pexels · foto 30095179",
  },
];

/* ----------------------------------------------------- tipo de contenido propio */

/**
 * «Producto» como tipo propio: precio, formato y alérgenos son campos, no párrafos.
 *
 * Los alérgenos sobre todo. Van declarados para que estén siempre —un campo vacío se ve, un
 * párrafo que falta no— y para que el día que haya que enseñarlos en una tabla, o que un
 * agente los liste por MCP, el dato ya esté separado del texto.
 */
const TIPO_PRODUCTO: TipoContenido = {
  key: "producto",
  label: "Producto",
  icon: "🥖",
  fieldSchema: [
    { key: "excerpt", label: "Resumen", type: "textarea" },
    { key: "cover_image", label: "Foto", type: "image" },
    { key: "precio", label: "Precio", type: "text" },
    { key: "formato", label: "Formato", type: "text" },
    { key: "ingredientes", label: "Ingredientes", type: "textarea" },
    { key: "alergenos", label: "Alérgenos", type: "text" },
    { key: "disponibilidad", label: "Cuándo lo hay", type: "text" },
    { key: "body", label: "Descripción", type: "richtext" },
  ] as FieldDefinition[],
};

/* -------------------------------------------------------------- formularios */

const CAMPOS_CONTACTO = [
  { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
  { key: "telefono", label: "Teléfono", type: "tel", width: "half" },
  { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
  { key: "mensaje", label: "Cuéntanos", type: "textarea", required: "sí" },
];

const CAMPOS_ENCARGO = [
  { key: "nombre", label: "Nombre y apellidos", type: "text", required: "sí", width: "half" },
  { key: "telefono", label: "Teléfono", type: "tel", required: "sí", width: "half" },
  { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
  {
    key: "que",
    label: "¿Qué quieres encargar?",
    type: "select",
    required: "sí",
    options: [
      "Pan (hogazas, barras, centeno)",
      "Bollería para desayuno",
      "Tarta",
      "Roscón de Reyes",
      "Bandeja de pastas o salados",
      "Otra cosa",
    ],
  },
  { key: "cantidad", label: "Cantidad", type: "text", width: "half" },
  { key: "recogida", label: "Día de recogida", type: "date", required: "sí", width: "half" },
  {
    key: "alergias",
    label: "Alergias o intolerancias",
    type: "textarea",
    help: "Dinos cuáles y te confirmamos si podemos hacerlo sin riesgo de contaminación cruzada.",
  },
  { key: "detalles", label: "Detalles del encargo", type: "textarea" },
];

/* -------------------------------------------------------------------- páginas */

const PAGINAS: Pagina[] = [
  /* ------------------------------------------------------------------ portada */
  {
    slug: "index",
    title: "Panadería Sol",
    position: 0,
    seo: {
      metaTitle: "Panadería Sol — pan de masa madre en el centro de Madrid",
      metaDescription:
        "Obrador propio en la calle del Sol desde 1972. Pan de masa madre con fermentación " +
        "de 24 horas, bollería de mantequilla y encargos con dos días de antelación.",
    },
    sections: [
      {
        type: "notice",
        anchor: "aviso",
        data: {
          text: "Del 1 al 15 de agosto cerramos por vacaciones. La última hornada es el 31 de julio.",
          link_label: "Ver horarios",
          link_url: "/contacto#horario",
          tone: "aviso",
        },
      },
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Pan hecho esta mañana, como el de siempre",
          subtitle:
            "Amasamos a las cinco, horneamos a las siete y abrimos a las ocho. Masa madre, " +
            "harinas molidas en Castilla y fermentaciones de 24 horas: por eso el pan de " +
            "ayer todavía está bueno hoy.",
          cta_label: "Ver el pan de hoy",
          cta_url: "/productos",
          align: "izquierda",
          image: "@portada",
        },
      },
      {
        type: "stats",
        data: {
          title: "",
          items: [
            { value: "1972", label: "Abriendo el mismo horno" },
            { value: "3", label: "Generaciones en el obrador" },
            { value: "24 h", label: "De fermentación en la masa madre" },
            { value: "07:00", label: "Primera hornada del día" },
          ],
        },
      },
      {
        type: "features",
        anchor: "que-hacemos",
        data: {
          title: "Lo que sale del horno",
          intro:
            "Todo se hace aquí, en el obrador de la calle del Sol. No trabajamos con masas " +
            "congeladas ni con precocido: si un día se acaba, se acaba.",
          columns: "3",
          items: [
            {
              icon: "🍞",
              title: "Pan de masa madre",
              text: "Hogazas de trigo, centeno y espelta con 24 horas de fermentación. Miga alveolada, corteza fina y buen aguante al segundo día.",
            },
            {
              icon: "🥖",
              title: "Barras y panecillos",
              text: "La barra rústica de toda la vida, más chapatas, colines y panecillos para bocadillo. Dos hornadas: 08:00 y 17:30.",
            },
            {
              icon: "🥐",
              title: "Bollería de mantequilla",
              text: "Croissants, napolitanas y caracolas laminadas a mano con mantequilla de verdad. Nada de margarina, y se nota al segundo bocado.",
            },
            {
              icon: "🎂",
              title: "Tartas y encargos",
              text: "Tartas caseras, bandejas de pastas y roscones por temporada. Con dos días de antelación, o cinco en diciembre.",
            },
            {
              icon: "☕",
              title: "Desayunos",
              text: "Café de tueste natural, tostada de hogaza con tomate y bollería recién hecha. Hay cuatro mesas y una barra pequeña.",
            },
            {
              icon: "🚚",
              title: "Reparto a hostelería",
              text: "Servimos pan diario a bares y restaurantes del centro, con entrega antes de las 07:30 y pedido cerrado la tarde anterior.",
            },
          ],
        },
      },
      {
        type: "collection",
        anchor: "productos",
        data: {
          title: "Del mostrador",
          parent: "productos",
          limit: 6,
          layout: "rejilla",
          show_image: "sí",
          more_label: "Ver todo el mostrador",
        },
      },
      {
        type: "split",
        anchor: "masa-madre",
        data: {
          title: "La masa madre lleva cuarenta años trabajando aquí",
          side: "derecha",
          image: "@obrador",
          body:
            "<p>La empezó el abuelo con harina y agua a finales de los ochenta, y se " +
            "refresca todos los días desde entonces. No es folclore: es lo que hace que el " +
            "pan tenga sabor propio y que aguante sin ponerse gomoso.</p>" +
            "<p>Amasamos con poca levadura y mucho tiempo. Veinticuatro horas de frío hacen " +
            "el trabajo que la prisa hace con aditivos, y ese es todo el secreto que hay.</p>",
          cta_label: "Conocer el obrador",
          cta_url: "/la-panaderia",
        },
      },
      {
        type: "split",
        anchor: "horarios",
        data: {
          title: "A qué hora hay pan",
          side: "izquierda",
          image: "@bollos",
          body:
            "<p><strong>Lunes a viernes:</strong> de 08:00 a 14:30 y de 17:00 a 20:30.<br>" +
            "<strong>Sábados:</strong> de 08:00 a 15:00.<br>" +
            "<strong>Domingos:</strong> de 09:00 a 14:00, sólo pan y bollería.</p>" +
            "<p>Hay dos hornadas de barra, a las 08:00 y a las 17:30, así que por la tarde " +
            "el pan es igual de reciente que por la mañana. La bollería sale a las 07:30 y " +
            "cuando se acaba no se repone: preferimos quedarnos cortos a tirar bandejas.</p>",
          cta_label: "Cómo llegar",
          cta_url: "/contacto",
        },
      },
      {
        type: "gallery",
        anchor: "la-tienda",
        data: {
          title: "La tienda y el obrador",
          images: ["@escaparate", "@croissants", "@amasando", "@mostrador", "@pasteleria", "@cesta"],
          layout: "mosaico",
          columns: "3",
          lightbox: "sí",
        },
      },
      {
        /*
         * Opiniones inventadas, como el resto de la demostración. En un sitio real este
         * bloque se queda vacío hasta que haya reseñas de verdad con permiso de quien las
         * escribió: en un negocio de barrio, una cita falsa la desmonta el vecino que la lee.
         */
        type: "quotes",
        anchor: "opiniones",
        data: {
          title: "Lo que dicen en el barrio",
          layout: "rejilla",
          autoplay: "no",
          items: [
            {
              quote: "Llevo comprando aquí desde que iba al colegio. Es de las pocas cosas del barrio que no ha cambiado a peor.",
              author: "Ana",
              role: "Vecina de la calle del Sol",
              photo: "",
            },
            {
              quote: "Pedí una tarta para el cumpleaños de mi madre con dos días y me la hicieron sin frutos secos por la alergia de mi hermano. Perfecta.",
              author: "Marcos",
              role: "Cliente de encargos",
              photo: "",
            },
            {
              quote: "Servimos su hogaza en el restaurante desde hace tres años. Llega a las siete y cuarto, todos los días, sin fallar uno.",
              author: "Carla",
              role: "Taberna La Cava",
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
              question: "¿Hay pan por la tarde?",
              answer:
                "Sí. La segunda hornada de barra y chapata sale a las 17:30, así que a partir de esa hora el pan es del día y está recién hecho. Las hogazas grandes suelen aguantar toda la jornada.",
            },
            {
              question: "¿Se puede reservar el pan?",
              answer:
                "Sí, y no cuesta nada: llámanos por la mañana y te lo apartamos con tu nombre hasta la hora que nos digas. Para hogazas grandes de fin de semana es lo más seguro.",
            },
            {
              question: "¿Tenéis pan sin gluten?",
              answer:
                "No. En el obrador se trabaja con harina de trigo todos los días y no podemos garantizar que no haya contaminación cruzada. Preferimos decirlo claro antes que vender algo que no es seguro para un celíaco.",
            },
            {
              question: "¿Cuánto aguanta el pan de masa madre?",
              answer:
                "Dos o tres días bien de sabor y hasta cinco para tostar. Guárdalo en una bolsa de tela o boca abajo sobre la tabla, nunca en el frigorífico: ahí es donde se pone gomoso.",
            },
            {
              question: "¿Con cuánta antelación hay que hacer un encargo?",
              answer:
                "Dos días para pan y bollería, tres para tartas y cinco en Navidad y Reyes. Si es para hoy, llámanos: a veces se puede.",
            },
            {
              question: "¿Se puede pagar con tarjeta?",
              answer: "Sí, con tarjeta y con móvil desde cualquier importe. No cobramos mínimo.",
            },
          ],
        },
      },
      {
        type: "cta",
        data: {
          title: "¿Te lo apartamos?",
          text: "Llámanos antes de las 13:00 y te guardamos lo que necesites para la tarde.",
          button_label: "Hacer un encargo",
          button_url: "/encargos",
          tone: "color",
        },
      },
    ],
  },

  /* ----------------------------------------------------------------- productos */
  {
    slug: "productos",
    title: "El mostrador",
    position: 1,
    seo: {
      metaTitle: "Pan, bollería y tartas — Panadería Sol, Madrid",
      metaDescription:
        "Hogaza de masa madre, barra rústica, croissants de mantequilla y tartas caseras. " +
        "Precio, formato y alérgenos de cada pieza.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "El mostrador",
          subtitle:
            "Lo que hay cada día. Los precios son los de la tienda; los alérgenos, los de " +
            "cada ficha. Si algo no está, pregúntanos: casi todo se puede encargar.",
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
          parent: "productos",
          limit: 12,
          layout: "rejilla",
          show_image: "sí",
          more_label: "",
        },
      },
      {
        type: "prose",
        anchor: "alergenos",
        data: {
          title: "Sobre alérgenos",
          width: "estrecho",
          body:
            "<p>En cada ficha están los alérgenos de esa pieza. Trabajamos a diario con " +
            "<strong>gluten, huevo, leche y frutos secos</strong> en el mismo obrador, así " +
            "que no podemos garantizar la ausencia de trazas en ningún producto.</p>" +
            "<p>Para un encargo con una alergia concreta, dínoslo al hacerlo: te diremos " +
            "con franqueza si podemos hacerlo con seguridad o si es mejor que no.</p>",
        },
      },
      {
        type: "cta",
        data: {
          title: "¿Lo quieres para un día concreto?",
          text: "Con dos días de antelación te lo tenemos hecho y apartado.",
          button_label: "Hacer un encargo",
          button_url: "/encargos",
          tone: "claro",
        },
      },
    ],
  },
  {
    slug: "hogaza-de-masa-madre",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Hogaza de masa madre",
    position: 0,
    seo: {
      metaTitle: "Hogaza de masa madre — Panadería Sol",
      metaDescription: "Hogaza de 1 kg con 24 horas de fermentación, harina de trigo molida en Castilla. 4,80 €.",
    },
    fields: {
      excerpt:
        "Nuestro pan de siempre: 1 kg, corteza fina y miga con alveolo. El que aguanta " +
        "tres días sin perder gracia.",
      cover_image: "@panes",
      precio: "4,80 €",
      formato: "Hogaza de 1 kg (media, 2,60 €)",
      ingredientes: "Harina de trigo T80, agua, masa madre de cultivo, sal marina",
      alergenos: "Gluten (trigo). Elaborado en obrador con huevo, leche y frutos secos",
      disponibilidad: "Todos los días, desde las 08:00",
      body:
        "<p>Se amasa a las cinco de la mañana con la masa madre refrescada el día anterior, " +
        "reposa veinticuatro horas en frío y entra al horno de solera a 250°.</p>" +
        "<h2>Por qué aguanta</h2>" +
        "<p>La fermentación larga acidifica la miga, y una miga ácida se seca mucho más " +
        "despacio. De ahí que al tercer día siga buena para tostar en lugar de convertirse " +
        "en una piedra — y de ahí también que sea más digestiva que un pan de dos horas.</p>" +
        "<h2>Cómo guardarla</h2>" +
        "<p>Bolsa de tela o boca abajo sobre la tabla, con el corte hacia la madera. Nunca " +
        "en el frigorífico: el frío es lo que la pone gomosa. Si sobra, se congela cortada " +
        "en rebanadas el mismo día.</p>",
    },
  },
  {
    slug: "barra-rustica",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Barra rústica",
    position: 1,
    seo: {
      metaTitle: "Barra rústica — Panadería Sol",
      metaDescription: "La barra de toda la vida, con masa madre y dos hornadas al día. 1,50 €.",
    },
    fields: {
      excerpt:
        "La de toda la vida, con un punto de masa madre. Dos hornadas al día para que por " +
        "la tarde sea igual de reciente.",
      cover_image: "@cesta",
      precio: "1,50 €",
      formato: "Barra de 250 g",
      ingredientes: "Harina de trigo, agua, masa madre, levadura, sal",
      alergenos: "Gluten (trigo). Elaborado en obrador con huevo, leche y frutos secos",
      disponibilidad: "Hornadas a las 08:00 y a las 17:30",
      body:
        "<p>Corteza crujiente y miga tierna, para bocadillo y para mojar. Lleva un 20 % de " +
        "masa madre, que es lo que la separa de la barra industrial: sabe a algo.</p>" +
        "<p>Es el producto que más se agota. Si la quieres para la comida del domingo, " +
        "llámanos el sábado y te la apartamos.</p>",
    },
  },
  {
    slug: "pan-de-centeno",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Pan de centeno con semillas",
    position: 2,
    seo: {
      metaTitle: "Pan de centeno con semillas — Panadería Sol",
      metaDescription: "Centeno integral al 70 % con girasol, lino y sésamo. Molde de 800 g, 5,40 €.",
    },
    fields: {
      excerpt:
        "Centeno integral al 70 %, denso y de sabor profundo, con girasol, lino y sésamo. " +
        "El que piden quienes desayunan salado.",
      cover_image: "@bollos",
      precio: "5,40 €",
      formato: "Molde de 800 g",
      ingredientes: "Harina de centeno integral, harina de trigo, agua, masa madre de centeno, semillas de girasol, lino y sésamo, sal",
      alergenos: "Gluten (centeno, trigo), sésamo. Elaborado en obrador con huevo, leche y frutos secos",
      disponibilidad: "Martes, jueves y sábado",
      body:
        "<p>Un pan denso, de miga cerrada y sabor largo, que no se parece en nada al de " +
        "trigo. Fermenta treinta y seis horas con masa madre de centeno propia.</p>" +
        "<p>Aguanta una semana entera envuelto en un paño y va especialmente bien con " +
        "quesos curados, ahumados y conservas. Se corta fino: es más pan del que parece.</p>",
    },
  },
  {
    slug: "croissant-de-mantequilla",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Croissant de mantequilla",
    position: 3,
    seo: {
      metaTitle: "Croissant de mantequilla — Panadería Sol",
      metaDescription: "Laminado a mano con mantequilla, sin margarina. 1,80 € la unidad.",
    },
    fields: {
      excerpt:
        "Laminado a mano con mantequilla de verdad, tres vueltas y una noche de reposo. " +
        "Sale del horno a las 07:30.",
      cover_image: "@croissant",
      precio: "1,80 €",
      formato: "Unidad · docena, 19 €",
      ingredientes: "Harina de trigo, mantequilla (26 %), agua, huevo, azúcar, levadura, leche, sal",
      alergenos: "Gluten (trigo), leche, huevo. Elaborado en obrador con frutos secos",
      disponibilidad: "Todos los días a las 07:30, hasta agotar",
      body:
        "<p>Mantequilla, no margarina: cuesta bastante más y es toda la diferencia entre un " +
        "croissant que se deshace en capas y uno que se queda pegado al paladar.</p>" +
        "<p>Se lamina a mano con tres vueltas simples y reposa una noche en frío antes de " +
        "formarse. Por eso hay los que hay: cuando se acaban, no se reponen hasta mañana.</p>",
    },
  },
  {
    slug: "tarta-de-manzana",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Tarta de manzana",
    position: 4,
    seo: {
      metaTitle: "Tarta de manzana casera — Panadería Sol",
      metaDescription: "Masa quebrada, crema pastelera y manzana reineta. Por encargo con dos días, desde 18 €.",
    },
    fields: {
      excerpt:
        "Masa quebrada, crema pastelera y reineta laminada. La receta de la abuela, sin " +
        "conservantes y sin brillo de gelatina.",
      cover_image: "@tarta",
      precio: "Desde 18 € (6 raciones)",
      formato: "6, 10 o 14 raciones · por encargo",
      ingredientes: "Harina de trigo, mantequilla, huevo, leche, azúcar, manzana reineta, canela",
      alergenos: "Gluten (trigo), leche, huevo. Elaborado en obrador con frutos secos",
      disponibilidad: "Por encargo, con dos días de antelación",
      body:
        "<p>Base de masa quebrada hecha en el día, crema pastelera cocida a mano y manzana " +
        "reineta laminada encima. Nada de gelatina para dar brillo: lo que brilla es el " +
        "almíbar de la propia manzana.</p>" +
        "<p>Se puede hacer sin lactosa avisando al encargarla. Sin gluten no, y preferimos " +
        "decirlo antes: el obrador trabaja con harina de trigo a diario.</p>",
    },
  },
  {
    slug: "bandeja-de-pastas",
    parentSlug: "productos",
    typeKey: "producto",
    title: "Bandeja de pastas y salados",
    position: 5,
    seo: {
      metaTitle: "Bandejas de pastas y salados — Panadería Sol",
      metaDescription: "Surtido de pastas de té y salados para reuniones. Desde 14 € la bandeja.",
    },
    fields: {
      excerpt:
        "Surtido de pastas de té, hojaldres y salados para una reunión, un cumpleaños o " +
        "una mesa de oficina. Se monta al gusto.",
      cover_image: "@pasteleria",
      precio: "Desde 14 € (500 g)",
      formato: "500 g, 1 kg o bandeja mixta · por encargo",
      ingredientes: "Varía según el surtido; se detalla al encargar",
      alergenos: "Gluten, leche, huevo y frutos secos según pieza. Se especifica al encargar",
      disponibilidad: "Por encargo, con dos días de antelación",
      body:
        "<p>Se monta con lo que haya ese día: pastas de té, hojaldritos, palmeritas, " +
        "empanadillas y saladitos. Dinos si la quieres dulce, salada o mitad y mitad.</p>" +
        "<p>Para más de veinte personas, avisa con tres días. Y si hay una alergia en la " +
        "mesa, dilo al encargar: montamos la bandeja dejando fuera lo que haga falta.</p>",
    },
  },

  /* ------------------------------------------------------------------ encargos */
  {
    slug: "encargos",
    title: "Encargos",
    position: 2,
    seo: {
      metaTitle: "Encargos y tartas por encargo — Panadería Sol",
      metaDescription:
        "Pan, bollería, tartas y roscones por encargo con dos días de antelación. " +
        "Formulario abierto a cualquier hora.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Encarga y pásalo a recoger",
          subtitle:
            "Dos días para pan y bollería, tres para tartas y cinco en Navidad. Se paga al " +
            "recoger y no pedimos señal salvo en encargos grandes.",
          cta_label: "Ir al formulario",
          cta_url: "#formulario",
          align: "centro",
          image: "@croissants",
        },
      },
      {
        type: "steps",
        anchor: "como-va",
        data: {
          title: "Cómo funciona",
          items: [
            {
              title: "Nos lo cuentas",
              text: "Por teléfono en horario de tienda, o por el formulario a cualquier hora, que es para lo que está.",
            },
            {
              title: "Te confirmamos",
              text: "Te llamamos o te escribimos el mismo día laborable con el precio cerrado y la hora de recogida. Hasta que no confirmamos, no hay encargo.",
            },
            {
              title: "Lo horneamos ese día",
              text: "Todo se hace el día de la recogida. Una tarta encargada para el sábado se monta el sábado por la mañana.",
            },
            {
              title: "Lo recoges y lo pagas",
              text: "En tienda, en la hora acordada. Con tarjeta o en efectivo, como prefieras.",
            },
          ],
        },
      },
      {
        type: "features",
        anchor: "que-se-encarga",
        data: {
          title: "Qué se puede encargar",
          intro: "",
          columns: "4",
          items: [
            { icon: "🍞", title: "Pan", text: "Hogazas grandes, centeno, panecillos para bocadillo o para un catering." },
            { icon: "🥐", title: "Bollería", text: "Bandejas de croissants y napolitanas para un desayuno de oficina." },
            { icon: "🎂", title: "Tartas", text: "Manzana, queso, chocolate y zanahoria. Con dedicatoria si nos la dices." },
            { icon: "👑", title: "Roscón", text: "En Navidad y Reyes, con nata, trufa o sin relleno. Se reserva desde el 1 de diciembre." },
          ],
        },
      },
      {
        type: "contact",
        anchor: "formulario",
        data: {
          title: "Hacer un encargo",
          text:
            "Rellena lo que sepas y nosotros te llamamos para cerrar los detalles. Si el " +
            "día que pides está completo, te propondremos otro antes de darlo por hecho.",
          fields: CAMPOS_ENCARGO,
          submit_label: "Enviar el encargo",
          consent_text:
            "He leído y acepto la política de privacidad. Doy mi consentimiento para que " +
            "Panadería Sol trate mis datos con el fin de gestionar este encargo.",
          success_message:
            "Gracias. Hemos recibido tu encargo y te confirmamos por teléfono el mismo día " +
            "laborable. Ojo: hasta que no te confirmemos, el encargo no está cerrado.",
          notify_email: "encargos@panaderiasol.example",
          notify_subject: "Nuevo encargo desde la web",
          autoreply: "sí",
          autoreply_subject: "Hemos recibido tu encargo — Panadería Sol",
          autoreply_body:
            "Hola,\n\nHemos recibido tu encargo y te llamamos hoy mismo, si es día " +
            "laborable, para confirmarte precio y hora de recogida.\n\nHasta esa llamada el " +
            "encargo no está cerrado, así que si tienes prisa puedes adelantarlo en el " +
            "+34 910 000 000.\n\nUn saludo,\nPanadería Sol\nCalle del Sol 14, Madrid",
        },
      },
      {
        type: "faq",
        anchor: "dudas",
        data: {
          title: "Dudas sobre los encargos",
          items: [
            {
              question: "¿Cuánto tiempo antes hay que pedirlo?",
              answer: "Dos días para pan y bollería, tres para tartas y cinco en Navidad y Reyes. Para más de veinte personas, tres días en cualquier caso.",
            },
            {
              question: "¿Hay que pagar por adelantado?",
              answer: "No, salvo en encargos de más de 100 €, donde pedimos la mitad al confirmar. Se paga al recoger.",
            },
            {
              question: "¿Y si no puedo ir a recogerlo?",
              answer: "Avísanos y lo guardamos hasta el cierre del día siguiente si es pan. Una tarta no aguanta: si no vienes, se pierde y se cobra.",
            },
            {
              question: "¿Podéis hacerlo sin lactosa o sin huevo?",
              answer: "Sin lactosa y sin huevo, en varias recetas, sí. Sin gluten no: en el obrador hay harina de trigo en el aire todos los días.",
            },
            {
              question: "¿Repartís a domicilio?",
              answer: "A particulares no. A bares y restaurantes del centro, sí, con entrega antes de las 07:30.",
            },
          ],
        },
      },
    ],
  },

  /* -------------------------------------------------------------- la panadería */
  {
    slug: "la-panaderia",
    title: "La panadería",
    position: 3,
    seo: {
      metaTitle: "La panadería y el obrador — Panadería Sol, Madrid",
      metaDescription:
        "Tres generaciones en la calle del Sol desde 1972: horno de solera, masa madre de " +
        "cuarenta años y seis personas en el obrador.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Cincuenta años en la misma esquina",
          subtitle:
            "Abrió Antonio en 1972 con un horno de solera y dos empleados. El horno sigue " +
            "siendo el mismo; lo demás ha cambiado lo justo.",
          cta_label: "",
          cta_url: "",
          align: "izquierda",
          image: "@amasando",
        },
      },
      {
        type: "split",
        anchor: "historia",
        data: {
          title: "Tres generaciones y una decisión que no se tomó",
          side: "derecha",
          image: "@escaparate",
          body:
            "<p>En los noventa vino el pan precocido y medio barrio se pasó a él: costaba " +
            "un tercio y no había que madrugar. Aquí se decidió no hacerlo, y durante unos " +
            "años esa decisión fue cara.</p>" +
            "<p>Hoy es la razón por la que la gente cruza dos calles para venir. No fue " +
            "visión de futuro: fue cabezonería, y salió bien.</p>",
          cta_label: "",
          cta_url: "",
        },
      },
      {
        type: "stats",
        data: {
          title: "",
          items: [
            { value: "1972", label: "Año de apertura" },
            { value: "6", label: "Personas en el obrador y la tienda" },
            { value: "40", label: "Años de la masa madre" },
            { value: "05:00", label: "Hora a la que se enciende el horno" },
          ],
        },
      },
      {
        /*
         * Sin fotos en las fichas del equipo, a propósito: poner un retrato de banco de
         * imágenes con el nombre de una persona inventada es exactamente el tipo de detalle
         * que convierte una demostración en un engaño. Las fotos del equipo las hace el
         * cliente, o no van.
         */
        type: "team",
        anchor: "equipo",
        data: {
          title: "Quién está detrás del mostrador",
          items: [
            { name: "Antonio Sol", role: "Fundador", photo: "", bio: "Abrió el horno en 1972. Sigue viniendo a las seis a mirar cómo va la masa." },
            { name: "Marisa Sol", role: "Maestra panadera", photo: "", bio: "Segunda generación. Lleva el obrador y decide qué se hornea cada día." },
            { name: "Diego Sol", role: "Obrador y bollería", photo: "", bio: "Tercera generación. Se ocupa del laminado y de las tartas por encargo." },
            { name: "Rocío Nieto", role: "Tienda y encargos", photo: "", bio: "La voz del teléfono. Se acuerda de lo que compra cada cliente, y no es una manera de hablar." },
          ],
        },
      },
      {
        type: "prose",
        anchor: "el-obrador",
        data: {
          title: "Cómo trabajamos",
          width: "normal",
          body:
            "<p>El horno es de solera refractaria, de los que dan calor por abajo y hacen " +
            "esa corteza que un horno de aire no consigue. Se enciende a las cinco y no se " +
            "apaga hasta la tarde.</p>" +
            "<p>Las harinas vienen de dos molinos de Castilla, sin aditivos ni mejorantes, " +
            "y cambian con la cosecha: por eso el pan de enero no sabe exactamente igual " +
            "que el de septiembre. La masa madre se refresca cada tarde, sin fallar un día " +
            "desde hace cuarenta años; en vacaciones se va a casa de Marisa.</p>" +
            "<p>Lo que sobra al cierre no se tira: se reparte con el comedor social del " +
            "barrio, que pasa a recogerlo de lunes a viernes.</p>",
        },
      },
      {
        type: "cta",
        data: {
          title: "Pásate a probarlo",
          text: "Calle del Sol 14, Madrid. Abrimos a las ocho, y a esa hora huele mejor.",
          button_label: "Cómo llegar",
          button_url: "/contacto",
          tone: "color",
        },
      },
    ],
  },

  /* ----------------------------------------------------------------- desayunos */
  {
    slug: "desayunos",
    title: "Desayunos y cafetería",
    position: 4,
    seo: {
      metaTitle: "Desayunos en el centro de Madrid — Panadería Sol",
      metaDescription:
        "Café de tueste natural, tostada de hogaza con tomate y bollería recién hecha. " +
        "Cuatro mesas y barra, de 08:00 a 12:00.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Desayunar aquí mismo",
          subtitle:
            "Cuatro mesas, una barra pequeña y el pan a dos metros del horno. Sin " +
            "reservas: se entra y, si hay sitio, se sienta uno.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "@mostrador",
        },
      },
      {
        type: "features",
        anchor: "la-carta",
        data: {
          title: "La carta, que es corta a propósito",
          intro: "Café, pan y bollería. Ni zumos de veinte frutas ni tostadas de aguacate: eso lo hacen mejor en otro sitio.",
          columns: "3",
          items: [
            { icon: "☕", title: "Café · 1,40 €", text: "Tueste natural de un tostador de Madrid. Con leche, 1,60 €; para llevar, en vaso compostable." },
            { icon: "🍅", title: "Tostada de hogaza · 2,20 €", text: "Con tomate y aceite de oliva virgen extra, o con mantequilla y mermelada casera." },
            { icon: "🥐", title: "Bollería · desde 1,60 €", text: "Croissant, napolitana o caracola, recién salidos. A partir de las 07:30." },
            { icon: "🥪", title: "Bocadillo · desde 3,50 €", text: "En barra rústica del día: tortilla, jamón, queso manchego o lomo. Para llevar, listo en dos minutos." },
            { icon: "🍊", title: "Zumo de naranja · 2,20 €", text: "Exprimido en el momento, sin más." },
            { icon: "🧃", title: "Combo desayuno · 3,50 €", text: "Café, zumo y bollería o tostada. De 08:00 a 11:00, de lunes a viernes." },
          ],
        },
      },
      {
        type: "split",
        anchor: "para-llevar",
        data: {
          title: "Con prisa, para llevar",
          side: "izquierda",
          image: "@croissant",
          body:
            "<p>De ocho a nueve y media hay cola, y lo sabemos. Por eso el mostrador de " +
            "para llevar es independiente del de tienda: café y bollería en un minuto, sin " +
            "esperar detrás de quien está comprando el pan de la semana.</p>" +
            "<p>Si sois una oficina, dejad el pedido la tarde anterior y lo tenéis " +
            "preparado a la hora que digáis.</p>",
          cta_label: "Pedir para la oficina",
          cta_url: "/encargos",
        },
      },
      {
        type: "cta",
        data: {
          title: "De 08:00 a 12:00, todos los días",
          text: "Los domingos, de 09:00 a 13:00. Hay dos mesas en la calle cuando el tiempo acompaña.",
          button_label: "Dónde estamos",
          button_url: "/contacto",
          tone: "claro",
        },
      },
    ],
  },

  /* -------------------------------------------------------------- hostelería */
  {
    slug: "para-hosteleria",
    title: "Para hostelería",
    position: 5,
    seo: {
      metaTitle: "Pan para bares y restaurantes en Madrid centro — Panadería Sol",
      metaDescription:
        "Reparto diario de pan a hostelería antes de las 07:30, con pedido cerrado la " +
        "tarde anterior y factura mensual.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Pan para tu carta, en tu puerta antes de las 07:30",
          subtitle:
            "Servimos a bares, restaurantes y hoteles del centro de Madrid. Mismo pan que " +
            "el de la tienda, en el formato que te sirva a ti.",
          cta_label: "Pedir precios",
          cta_url: "/contacto",
          align: "izquierda",
          image: "@cesta",
        },
      },
      {
        type: "features",
        anchor: "como-trabajamos",
        data: {
          title: "Cómo trabajamos con hostelería",
          intro: "",
          columns: "3",
          items: [
            { icon: "🕖", title: "Entrega antes de las 07:30", text: "Todos los días, festivos incluidos si lo necesitas. Con dos rutas: centro y Chamberí." },
            { icon: "📞", title: "Pedido hasta las 19:00", text: "Se cierra la tarde anterior por teléfono o WhatsApp. Los cambios de última hora, si el horno aún puede, entran." },
            { icon: "🥖", title: "Formatos a medida", text: "Panecillo de 60 g, chapata para bocadillo, hogaza en rebanadas o barra sin cortar." },
            { icon: "🧾", title: "Factura mensual", text: "Un solo albarán al mes con el detalle diario. Pago a 30 días desde el tercer mes." },
            { icon: "❄️", title: "Masa cruda congelada", text: "Si prefieres hornear tú, servimos la masa formada y ultracongelada con su pauta." },
            { icon: "🤝", title: "Sin permanencia", text: "Ni contrato de mínimos ni penalización. Si un mes cierras por vacaciones, no se factura." },
          ],
        },
      },
      {
        type: "split",
        anchor: "prueba",
        data: {
          title: "Pruébalo una semana",
          side: "derecha",
          image: "@obrador",
          body:
            "<p>Te llevamos durante siete días lo que sirves normalmente, en las cantidades " +
            "que nos digas y sin coste de alta. Si al octavo día no ha cambiado nada en tu " +
            "cocina, lo dejamos y no ha pasado nada.</p>" +
            "<p>Lo que suele cambiar es el desperdicio: al aguantar el pan mejor la " +
            "jornada, se tira bastante menos del que se compra.</p>",
          cta_label: "Hablar con nosotros",
          cta_url: "/contacto",
        },
      },
      {
        type: "cta",
        data: {
          title: "Cuéntanos qué sirves",
          text: "Con la carta delante te decimos qué pan encaja y a qué precio, sin compromiso.",
          button_label: "Pedir precios",
          button_url: "/contacto",
          tone: "color",
        },
      },
    ],
  },

  /* --------------------------------------------------------------------- blog */
  {
    slug: "consejos",
    title: "Consejos",
    position: 6,
    seo: {
      metaTitle: "Consejos sobre el pan — Panadería Sol",
      metaDescription: "Cómo conservar el pan, qué es la masa madre y otras cosas que contamos en el mostrador.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Consejos",
          subtitle: "Lo que explicamos en el mostrador, por si no coincidimos.",
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
          parent: "consejos",
          limit: 12,
          layout: "lista",
          show_image: "sí",
          more_label: "",
        },
      },
    ],
  },
  {
    slug: "como-conservar-el-pan",
    parentSlug: "consejos",
    typeKey: "post",
    title: "Cómo conservar el pan (y por qué el frigorífico es lo peor)",
    position: 0,
    publishedAt: "2026-04-18T08:00:00Z",
    seo: {
      metaTitle: "Cómo conservar el pan de masa madre — Panadería Sol",
      metaDescription:
        "La nevera acelera el endurecimiento del pan. Bolsa de tela, boca abajo y congelado " +
        "en rebanadas: lo que sí funciona.",
    },
    fields: {
      excerpt:
        "La nevera no conserva el pan: lo endurece más rápido que dejarlo en la encimera. " +
        "Lo que sí funciona son tres cosas y ninguna cuesta dinero.",
      cover_image: "@panes",
      body:
        "<p>Es la pregunta que más nos hacen y casi todo el mundo llega con la misma " +
        "costumbre equivocada: meterlo en el frigorífico.</p>" +
        "<h2>Por qué la nevera es lo peor</h2>" +
        "<p>El pan se endurece porque el almidón de la miga recristaliza, y ese proceso es " +
        "más rápido entre 0 y 8 grados que a temperatura ambiente. O sea: en la nevera el " +
        "pan se pone gomoso <em>antes</em> que fuera. Lo único que la nevera evita es el " +
        "moho, que en un pan de masa madre tarda días en aparecer.</p>" +
        "<h2>Lo que sí funciona</h2>" +
        "<ul>" +
        "<li><strong>Bolsa de tela o papel</strong>, nunca plástico cerrado: el plástico " +
        "guarda la humedad y reblandece la corteza.</li>" +
        "<li><strong>Boca abajo sobre la tabla</strong>, con el corte apoyado en la madera. " +
        "La propia miga se tapa a sí misma.</li>" +
        "<li><strong>Congelar en rebanadas el mismo día</strong>, no al tercero. Del " +
        "congelador a la tostadora, sin descongelar.</li>" +
        "</ul>" +
        "<h2>Y si ya está duro</h2>" +
        "<p>Un golpe de horno lo resucita: se moja ligeramente la corteza con la mano, y " +
        "cinco minutos a 200°. Sale casi como recién hecho y aguanta un par de horas así. " +
        "Después, migas, torrijas o sopa de ajo, que para eso se inventaron.</p>",
    },
  },
  {
    slug: "que-es-la-masa-madre",
    parentSlug: "consejos",
    typeKey: "post",
    title: "Qué es la masa madre y por qué tarda tanto",
    position: 1,
    publishedAt: "2026-06-06T08:00:00Z",
    seo: {
      metaTitle: "Qué es la masa madre — Panadería Sol",
      metaDescription:
        "Harina, agua y tiempo. Qué aporta de verdad la masa madre al sabor, a la " +
        "digestión y a la conservación del pan.",
    },
    fields: {
      excerpt:
        "Harina, agua y cuarenta años de costumbre. Qué hace de verdad, y por qué no todo " +
        "el pan que dice llevarla la lleva.",
      cover_image: "@obrador",
      body:
        "<p>Una masa madre es harina y agua fermentadas por las levaduras y bacterias que " +
        "ya viven en la harina y en el aire del obrador. Se refresca cada día con más " +
        "harina y más agua, y puede durar generaciones. La nuestra tiene unos cuarenta " +
        "años.</p>" +
        "<h2>Qué aporta</h2>" +
        "<p><strong>Sabor.</strong> Las bacterias lácticas producen ácidos que dan ese " +
        "punto ligeramente ácido y un aroma que la levadura industrial no da.</p>" +
        "<p><strong>Conservación.</strong> Esos mismos ácidos retrasan el moho y el " +
        "endurecimiento, así que el pan aguanta días en lugar de horas.</p>" +
        "<p><strong>Digestión.</strong> La fermentación larga predigiere parte del almidón " +
        "y degrada buena parte del gluten. Sienta mejor a mucha gente — que no es lo mismo " +
        "que ser apto para celíacos: no lo es, y quien diga lo contrario miente.</p>" +
        "<h2>Por qué tarda</h2>" +
        "<p>Porque hay poca levadura trabajando. Un pan industrial fermenta en una hora con " +
        "una dosis alta de levadura de panadería; el nuestro tarda veinticuatro entre el " +
        "amasado, el reposo en frío y el formado. Ese tiempo es el ingrediente.</p>" +
        "<h2>Cómo saber si un pan la lleva de verdad</h2>" +
        "<p>Mira la etiqueta, que desde 2019 tiene que decirlo. Y fíjate en la miga: " +
        "alveolos irregulares, corteza gruesa y algo de acidez al final del bocado. Si " +
        "todas las piezas son idénticas y la miga es un algodón uniforme, hay poco tiempo " +
        "detrás de ese pan.</p>",
    },
  },

  /* ----------------------------------------------------------------- contacto */
  {
    slug: "contacto",
    title: "Dónde estamos",
    position: 7,
    seo: {
      metaTitle: "Dónde estamos y horarios — Panadería Sol, Madrid",
      metaDescription:
        "Calle del Sol 14, 28012 Madrid. De lunes a viernes de 08:00 a 14:30 y de 17:00 a " +
        "20:30. Teléfono +34 910 000 000.",
    },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "Dónde estamos",
          subtitle: "Calle del Sol 14, a dos minutos de la plaza. Metro Tirso de Molina o Sol.",
          cta_label: "",
          cta_url: "",
          align: "centro",
          image: "",
        },
      },
      {
        type: "prose",
        anchor: "horario",
        data: {
          title: "Horario y contacto",
          width: "estrecho",
          body:
            "<p><strong>Panadería Sol</strong><br>Calle del Sol 14<br>28012 Madrid</p>" +
            "<p><strong>Teléfono</strong><br><a href=\"tel:+34910000000\">+34 910 000 000</a><br>" +
            "<strong>Correo</strong><br><a href=\"mailto:hola@panaderiasol.example\">hola@panaderiasol.example</a></p>" +
            "<p><strong>Horario</strong><br>" +
            "Lunes a viernes: 08:00 – 14:30 y 17:00 – 20:30<br>" +
            "Sábados: 08:00 – 15:00<br>" +
            "Domingos: 09:00 – 14:00 (pan y bollería)<br>" +
            "Cerrado del 1 al 15 de agosto</p>" +
            "<p><strong>Cómo llegar</strong><br>Metro Tirso de Molina (línea 1) a cuatro " +
            "minutos y Sol (líneas 1, 2 y 3) a siete. Autobuses 6, 26 y 32. No hay " +
            "aparcamiento en la puerta: la calle es peatonal.</p>",
        },
      },
      {
        type: "contact",
        anchor: "formulario",
        data: {
          title: "Escríbenos",
          text:
            "Para encargos usa mejor el formulario de encargos, que pregunta lo que hace " +
            "falta. Aquí, para cualquier otra cosa: hostelería, sugerencias o si te has " +
            "dejado algo en la tienda.",
          fields: CAMPOS_CONTACTO,
          submit_label: "Enviar",
          consent_text:
            "He leído y acepto la política de privacidad. Doy mi consentimiento para que " +
            "Panadería Sol trate mis datos para responder a esta consulta.",
          success_message: "Gracias, hemos recibido tu mensaje. Te contestamos en un día laborable.",
          notify_email: "hola@panaderiasol.example",
          notify_subject: "Mensaje desde la web",
          autoreply: "no",
        },
      },
    ],
  },

  /* ------------------------------------------------------------------ legales */
  {
    slug: "aviso-legal",
    title: "Aviso legal",
    position: 8,
    seo: { metaTitle: "Aviso legal — Panadería Sol" },
    sections: [{ type: "legal", data: { document: "aviso-legal", show_disclaimer: "sí" } }],
  },
  {
    slug: "politica-de-privacidad",
    title: "Política de privacidad",
    position: 9,
    seo: { metaTitle: "Política de privacidad — Panadería Sol" },
    sections: [{ type: "legal", data: { document: "privacidad", show_disclaimer: "sí" } }],
  },
  {
    slug: "politica-de-cookies",
    title: "Política de cookies",
    position: 10,
    seo: { metaTitle: "Política de cookies — Panadería Sol" },
    sections: [{ type: "legal", data: { document: "cookies", show_disclaimer: "sí" } }],
  },
];

/* ---------------------------------------------------------------------- menús */

const MENUS: Record<"main" | "footer" | "legal", EntradaMenu[]> = {
  main: [
    { label: "El mostrador", path: "/productos" },
    { label: "Encargos", path: "/encargos" },
    { label: "Desayunos", path: "/desayunos" },
    { label: "La panadería", path: "/la-panaderia" },
    { label: "Dónde estamos", path: "/contacto" },
  ],
  footer: [
    { label: "Para hostelería", path: "/para-hosteleria" },
    { label: "Consejos", path: "/consejos" },
    { label: "+34 910 000 000", url: "tel:+34910000000" },
    { label: "hola@panaderiasol.example", url: "mailto:hola@panaderiasol.example" },
  ],
  legal: [
    { label: "Aviso legal", path: "/aviso-legal" },
    { label: "Privacidad", path: "/politica-de-privacidad" },
    { label: "Cookies", path: "/politica-de-cookies" },
  ],
};

/* ------------------------------------------------------------------ escritura */

const PANADERIA: Contenido = {
  tenant: TENANT,
  siteName: SITE_NAME,
  tagline: TAGLINE,
  theme: THEME,
  contactEmail: CONTACT_EMAIL,
  socialLinks: SOCIAL,
  business: BUSINESS,
  images: IMAGENES,
  contentTypes: [TIPO_PRODUCTO],
  pages: PAGINAS,
  menus: MENUS,
};

await ejecutar(PANADERIA);

console.log(
  "\x1b[2mNegocio, precios, equipo y opiniones son inventados. Las fotos vienen de Pexels " +
    "y quedan en public/uploads, que es el almacén de desarrollo: en producción los medios " +
    "viven en R2.\x1b[0m"
);
