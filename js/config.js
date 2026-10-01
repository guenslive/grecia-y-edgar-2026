/* =====================================================================
   CONFIGURACIÓN
   Todo lo que ella va a leer está aquí. Cambia los textos entre comillas
   y el contenido de cada cartel sin tocar el resto del código.

   · Para ver la página:
       python3 servidor.py   →   http://localhost:8080
     (abrir index.html con doble clic no funciona por los módulos JS; este
     servidor además permite adelantar la canción en el reproductor).
   · Para ir directo al final mientras editas:  http://localhost:8080/?saltar
   · Para acelerar la animación:                http://localhost:8080/?velocidad=3
   ===================================================================== */

window.CONFIG = {
  // Cómo le dices. Se usa donde aparezca {nombre}.
  nombre: "mi amor",

  // Fecha y hora en que empezaron (año-mes-díaThora:min:seg). Alimenta el contador.
  inicio: "2019-10-01T00:00:00",

  // Textos de la escena
  intro: "El 1 de octubre de 2019 plantamos algo pequeñito, pero muy especial.",
  pista: "Toca la semilla",
  titulo: "7 años contigo",
  subtitulo: "Feliz aniversario, {nombre}",
  pistaCarteles: "Toca todo, es para ti 🖤",

  // Una etiqueta por año; aparecen conforme crecen las ramas.
  // La nota es opcional (déjala en "" si no quieres texto extra).
  anios: [
    { anio: 2019, nota: "aquí empezó todo" },
    { anio: 2020, nota: "" },
    { anio: 2021, nota: "" },
    { anio: 2022, nota: "" },
    { anio: 2023, nota: "" },
    { anio: 2024, nota: "" },
    { anio: 2025, nota: "" },
    { anio: 2026, nota: "hoy" },
  ],

  // El corazón tallado en el tronco muestra este texto al tocarlo.
  corazon: "G y E, desde 2019",

  // Lo que dice la manta del avión que pasa de vez en cuando (dentro de un
  // corazón; que sea corto, unas 3 o 4 letras).
  avion: "G&E",

  // Ruta a un mp3 (por ejemplo "musica/nuestra-cancion.mp3") para que suene
  // su canción en lugar de la cajita musical. Déjalo en "" para usar la cajita.
  musica: "",

  // Segundos que tarda el árbol en crecer (sin contar la floración).
  duracionCrecimiento: 22,

  // Carteles de madera. "texto" es lo que se lee en la madera (corto, se ve en
  // mayúsculas pixeladas). "contenido" acepta HTML. Opcionales: "fotos" (una
  // lista de { src, pie } con imágenes en la carpeta fotos/), "canciones"
  // (abre un reproductor con la letra en tiempo real) e "historieta".
  carteles: [
    {
      texto: "Cómo empezó",
      titulo: "Cómo empezó todo",
      // Historieta animada: cada viñeta tiene una escena dibujada (no cambies
      // "escena") y sus textos, que sí puedes editar.
      historieta: [
        {
          escena: "laboratorio",
          texto: "Tercero de prepa. Un día cualquiera, en la clase de computación.",
        },
        {
          escena: "puerta",
          texto: "Ya todos estábamos sentados cuando se abrió la puerta y llegaste tú, un poquito tarde, porque habías hecho una permuta.",
          pensamiento: "qué bonita…",
          nota: "No fue amor a primera vista, pero si senti algo especial no se, y por supuesto pensé que eras muy bonita.",
        },
        {
          escena: "salivosa",
          texto: "Recuerdo que yo me sentaba junto a Lupita. Ustedes platicaban mucho y un día no recuerdo muy bien si fue a ti o Ruth que les escupió en el ojo jajaja.",
          globo: "¡Bien salivosa!",
          nota: "Se me salió sin querer… jajaja, pero desde ahí nos hicimos amiguitos.",
        },
        {
          escena: "tiempo",
          texto: "A finales de la prepa me empezaste a gustar jejej, dejamos de platicar un tiempo por mi culpa, me disculpo por eso :(, pero volvimos a estar en contacto en la universidad.",
          contacto: "Grecia ♥",
        },
        {
          escena: "esperar",
          texto: "Tú salías bastante tarde de la uni, y yo siempre que podía, te esperaba para llevarte a tu casita. Así por un tiempo.",
        },
        {
          escena: "pregunta",
          texto: "1 de octubre de 2019. Después de la uni, de camino a tu casita, ahí en mi coche por fin me arme de valor.",
          globo: "¿Quieres ser mi novia?",
          respuesta: "¡Sí!",
          nota: "Ha sido de los días en que más nervioso he estado… y me dijiste que siiii.",
        },
        {
          escena: "papeleria",
          texto: "Antes de llegar a tu casita me pediste que pasáramos a una papelería. Ahí, ya como novios, nos dimos nuestro primer besito ♥♥.",
          nota: "Y así empezó todo.",
        },
      ],
    },
    {
      texto: "Canciones",
      titulo: "Musiquita linda que te dedico",
      // La nubecita que flota junto a la grabadora.
      globo: "musiquita que te dedico 🖤",
      // Cada canción necesita su mp3 y su letra sincronizada (.lrc) en la
      // carpeta musica/. Suenan en este orden; al terminar una sigue la otra.
      canciones: [
        {
          titulo: "we fell in love in october",
          artista: "girl in red",
          audio: "musica/we-fell-in-love-in-october.mp3",
          letra: "musica/we-fell-in-love-in-october.lrc",
          dedicatoria: "[Nuestra otra canción.]",
        },
        {
          titulo: "My Kind of Woman",
          artista: "Mac DeMarco",
          audio: "musica/my-kind-of-woman.mp3",
          letra: "musica/my-kind-of-woman.lrc",
          dedicatoria: "[Te dedico esta canción.]",
        },
      ],
    },
    {
      texto: "7 razones",
      titulo: "7 cosas por las que te amo",
      // La nubecita que flota junto a la maquinita.
      globo: "un jueguito para ti 🖤",
      // Minijuego: ella atrapa corazones que caen del cerezo y cada uno le
      // muestra una razón, en este orden. Escribe aquí tus 7 razones.
      juego: {
        razones: [
          "Eres honesta.",
          "Eres una maravillosa persona.",
          "Eres divertida, me encanta pasar el tiempo contigo, aunque estemos en silencio.",
          "Me encantan tus ojos, tu mirada es la más hermosa.",
          "Que tengas bien definidos tus gustos e ideologías, no eres susceptible a la opinión de los demás.",
          "Eres fuerte, aunque estés cansada o te sientas mal por la fibromialgia, siempre te esfuerzas en dar lo mejor de ti.",
          "Porque simplemente eres el amor de mi vida 🖤",
        ],
        // Lo que aparece al final, cuando llegas corriendo a abrazarla.
        final: "…y podría seguir toda la vida. Te amo ♥",
      },
    },
    {
      texto: "Una carta",
      titulo: "Para ti",
      // No cuelga del árbol: sale de un buzón que aparece en la isla.
      buzon: true,
      // La nubecita que flota junto al buzón.
      globo: "una cartita para ti 🖤",
      // Carta en un sobre con sello que ella abre al tocarlo. Cada texto de
      // "parrafos" es un párrafo: cámbialos con tus palabras.
      carta: {
        saludo: "Holii mi vida, feliz aniversarioo:",
        parrafos: [
          "Hoy cumplimos 7 años juntos, 7 años desde el día que más nervioso me he sentido jajaja. Gracias por un año más a mi lado, por seguir eligiéndome; gracias por estos años, a veces juntitos y a veces separados, pero siempre en mi corazón; gracias por los lindos momentos que hemos pasado, y también por los no tan buenos, porque gracias a ellos se fortalece la relación.",
          "Sé que hay cosas que podríamos mejorar ambos, que no siempre estaremos de acuerdo en todo, que habrá discusiones, y sé que aún nos queda mucho por aprender el uno del otro, de nuestra relación y de nosotros mismos. Pero mientras exista el espacio para dialogar y estar abiertos al cambio, a los sentimientos del otro, y siempre tener la intención de apoyarnos mutuamente, nuestra relación siempre podrá seguir fuerte. Yo estoy dispuesto a seguir haciéndolo, a mejorar, aprender y siempre dar lo mejor de mí para ti. El amor que siento por ti no es algo que solo sienta momentáneamente o por costumbre: te amo con todo mi corazón, todo el tiempo, siempre estoy pensando en ti.",
          "El tiempo se pasa volando, y más cuando es a tu lado. No puedo creer que ya llevamos 7 años juntos, y el amor que siento por ti no ha hecho nada más que crecer cada vez más y más. Gracias por decirme que sí ese 1 de octubre del 2019, gracias por darme la oportunidad de demostrarte lo comprometido que estaba en esa nueva relación, gracias por escribir esta linda historia junto a mí.",
          "Siempre te lo he dicho, pero nunca me cansaré de recordártelo: siempre te he admirado, eres una mujer maravillosa y hermosa en todos los aspectos. Al principio me enamoré de tu belleza física, pero ahora amo tu alma, tu esencia, toda tú. Admiro la fortaleza mental y física que tienes para lidiar con una enfermedad crónica que no hace la vida para nada sencilla, pero aun así siempre te veo esforzándote en dar lo mejor de ti: en tu trabajo, que requiere de mucha energía, en tus viajes y en tu vida cotidiana. Sé que te cansas, y mucho, pero eso solo hace ver tu esfuerzo mucho más impresionante.",
          "Sé que tu trabajo es difícil y siempre te lleva muy lejos, a veces hasta el otro lado del mundo, y que nos toca extrañarnos seguido. Pero estoy muy orgulloso de ti, y aunque la distancia a veces pese, mi amor por ti me da la fortaleza de siempre poderte esperar, de no rendirme, de saber que vale la pena. Y así como antes de que fuéramos novios te esperaba a la salida de la uni, ahora te voy a esperar siempre, en donde sea, con todo mi amor para recibirte.",
          "No sé qué nos espera en un futuro, la situación cada vez está más complicada en todo el mundo, pero si de algo estoy seguro es que, si me lo permites, quiero estar siempre a tu lado. Seguirte amando como hasta hoy lo he hecho, darte lo mejor de mí y esforzarme siempre por ti.",
          "Te amo mucho mucho muchísimo, mi vida hermosa 🖤🖤. Otra vez, gracias por estos 7 años juntos, y vamos por más 🖤🖤",
        ],
        despedida: "Te amo mucho, licenciada 🖤",
        // opcional: tu nombre, debajo de la despedida
        firma: "",
      },
    },
    {
      texto: "Lo que viene",
      titulo: "Lo que viene",
      // Otra historieta, igual que la de "Cómo empezó": no cambies "escena";
      // los textos sí puedes editarlos.
      historieta: [
        {
          escena: "altamar",
          texto: "Sé que muchas veces vas a estar muyyy lejos, en algún lugar en medio del mar, en otro continente o país.",
        },
        {
          escena: "codigo",
          texto: "y yo aquí, desde mi casa o trabajo, contando los días para volverte a ver.",
        },
        {
          escena: "llamada",
          texto: "Pero aunque haya todo un mar de por medio, siempre encontramos la forma de estar cerquita ♥",
          globo: "¡Te extraño mucho mucho ♥♥!",
          respuesta: "¡y yo a ti ♥!",
        },
        {
          escena: "puerto",
          texto: "Y cada vez que regreses, así como antes te esperaba a la salida de la uni, aquí estaré esperándote siempre.",
          nota: "Siempre te voy a esperar mi vida ♥",
        },
        {
          escena: "siempre",
          texto: "No sé todo lo que viene, pero si de algo estoy seguro es que, y es que si hay futuro, quiero estar siempre a tu lado.",
          nota: "En tierra o en altamar ♥",
        },
      ],
    },
  ],
};
