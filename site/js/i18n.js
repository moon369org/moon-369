/* Moon's languages. English is the source text; each other language maps English to its own words.
   MoonT(english, vars) translates one string ({name} placeholders are filled from vars).
   Any text node or label that exactly matches an English string is translated as the page draws,
   so static text needs no markup. Moonmarks, numbers and brand names (Moon, Moonmark, Lune) stay as they are.
   The language follows the phone; moonLang in local storage overrides it. */
(function (root) {
  if (root.MoonI18n) return;
  var ES = {
    // tabs, switch, top
    'NOW': 'AHORA', 'NIGHTS': 'NOCHES', 'EVENTS': 'EVENTOS', 'MOON': 'LUNA', 'SKY': 'CIELO', 'TIDE': 'MAREA', 'View': 'Vista', 'App': 'App', 'Moon home': 'Inicio de Moon',
    // now
    'MOON TIME · THE SAME EVERYWHERE': 'HORA LUNAR · LA MISMA EN TODAS PARTES', 'MARK THIS MOMENT': 'MARCAR ESTE MOMENTO', 'CREATE AN EVENT': 'CREAR UN EVENTO',
    'The Moon right now': 'La Luna ahora mismo', 'YOUR MOMENTS': 'TUS MOMENTOS', 'EDIT': 'EDITAR', 'DONE': 'LISTO', 'REMOVE': 'QUITAR',
    'Removing a moment only clears it from this phone. The proof stays on Moon and its link still works.': 'Quitar un momento solo lo borra de este teléfono. La prueba queda en Moon y su enlace sigue funcionando.',
    'Remove from this phone': 'Quitar de este teléfono', 'Removed from this phone. The proof stays on Moon.': 'Quitado de este teléfono. La prueba queda en Moon.',
    'Add Moon to your home screen': 'Añade Moon a tu pantalla de inicio', 'To keep Moon on your home screen: tap Share, then Add to Home Screen.': 'Para tener Moon en tu pantalla de inicio: toca Compartir y luego Añadir a pantalla de inicio.',
    'Your local time: {t}': 'Tu hora local: {t}', 'A moment': 'Un momento', 'A photo': 'Una foto',
    // sheet
    'SHARE THIS MOMENT': 'COMPARTE ESTE MOMENTO', 'NEW EVENT': 'NUEVO EVENTO', 'MARK IT': 'MARCARLO', 'CREATE EVENT': 'CREAR EVENTO', 'CANCEL': 'CANCELAR',
    "What's happening? (optional)": '¿Qué está pasando? (opcional)', "What's happening": 'Qué está pasando', 'Name the event': 'Ponle nombre al evento',
    '+ ADD A PHOTO · OPTIONAL': '+ AÑADIR UNA FOTO · OPCIONAL', 'PHOTO': 'FOTO', 'Remove the photo': 'Quitar la foto',
    'Signed at this moment. It stays on your phone: only its fingerprint goes to Moon.': 'Firmada en este momento. Se queda en tu teléfono: solo su huella va a Moon.',
    'SIGNING THE PHOTO…': 'FIRMANDO LA FOTO…', 'YOUR MOMENT IS READY': 'TU MOMENTO ESTÁ LISTO', 'YOUR EVENT IS READY': 'TU EVENTO ESTÁ LISTO',
    'It works right away. Anyone who opens it sees it in their own time.': 'Funciona al instante. Quien lo abra lo verá en su propia hora.',
    'SHARE': 'COMPARTIR', 'COPY LINK': 'COPIAR ENLACE', 'SAVE CARD': 'GUARDAR TARJETA', 'POST TO X': 'PUBLICAR EN X', 'COPY COUNTDOWN EMBED': 'COPIAR CUENTA ATRÁS', 'Link': 'Enlace',
    '{t} your time.': '{t}, tu hora.', 'Moonmark {m}': 'Moonmark {m}',
    'Name the event first': 'Primero ponle nombre al evento', 'Pick a photo': 'Elige una foto', 'Signing a photo needs a connection': 'Firmar una foto necesita conexión',
    'Moon could not sign it. Try again.': 'Moon no pudo firmarla. Inténtalo de nuevo.', 'Moon could not sign it': 'Moon no pudo firmarla',
    'Shared. Anyone who opens it can find their own moon.': 'Compartido. Quien lo abra puede encontrar su propia luna.', 'Anyone who opens it can find their own moon.': 'Quien lo abra puede encontrar su propia luna.',
    'Link copied. Anyone who opens it can find their own moon.': 'Enlace copiado. Quien lo abra puede encontrar su propia luna.',
    'Card saved. Anyone who opens it can find their own moon.': 'Tarjeta guardada. Quien lo abra puede encontrar su propia luna.',
    'The card needs a connection': 'La tarjeta necesita conexión', 'Countdown embed copied': 'Cuenta atrás copiada', 'Copy this link': 'Copia este enlace', 'Copy this embed code': 'Copia este código',
    '{name}: Moonmark {mark}. Opens in your own time:': '{name}: Moonmark {mark}. Se abre en tu propia hora:', 'Moonmark {mark}. Opens in your own time:': 'Moonmark {mark}. Se abre en tu propia hora:',
    '{name}: Moonmark {mark}. Opens in your own time.': '{name}: Moonmark {mark}. Se abre en tu propia hora.', 'Moonmark {mark}. Opens in your own time.': 'Moonmark {mark}. Se abre en tu propia hora.',
    'A moment on Moon': 'Un momento en Moon',
    // nights
    'EXPLORE A NIGHT': 'EXPLORA UNA NOCHE', 'I WAS BORN': 'NACÍ', 'WE MET': 'NOS CONOCIMOS', 'OUR WEDDING': 'NUESTRA BODA', 'MY CHILD WAS BORN': 'NACIÓ MI HIJO', 'ANY DAY': 'CUALQUIER DÍA',
    'DATE': 'FECHA', 'TIME · OPTIONAL': 'HORA · OPCIONAL', 'Mar 14, 1988': '14 mar 1988', '9:30 PM': '21:30', 'SHOW ME THE MOON': 'MUÉSTRAME LA LUNA', 'SHARE THIS MOON': 'COMPARTE ESTA LUNA',
    'THE MOON ON': 'LA LUNA EL', 'THE MOON WHEN I WAS BORN': 'LA LUNA CUANDO NACÍ', 'THE MOON WHEN WE MET': 'LA LUNA CUANDO NOS CONOCIMOS',
    'THE MOON ON OUR WEDDING DAY': 'LA LUNA EL DÍA DE NUESTRA BODA', 'THE MOON WHEN MY CHILD WAS BORN': 'LA LUNA CUANDO NACIÓ MI HIJO',
    'I was born': 'Nací', 'We met': 'Nos conocimos', 'Our wedding': 'Nuestra boda', 'My child was born': 'Nació mi hijo', 'A day': 'Un día',
    'CYCLE': 'CICLO', 'At midday': 'A mediodía', 'At {t} your time': 'A las {t}, tu hora', '{p} · {n}% lit': '{p} · {n}% iluminada',
    'This moon returns to this date in {y}.': 'Esta luna vuelve a esta fecha en {y}.', 'YOUR NIGHTS · SAVED ON THIS PHONE': 'TUS NOCHES · GUARDADAS EN ESTE TELÉFONO', 'Pick a date first': 'Primero elige una fecha',
    // events
    'EVENTS · ONE LINK, EVERY TIME ZONE': 'EVENTOS · UN ENLACE, TODAS LAS ZONAS HORARIAS', 'NAME': 'NOMBRE', 'Party, launch, call…': 'Fiesta, lanzamiento, llamada…',
    'DATE & TIME · YOUR TIME': 'FECHA Y HORA · TU HORA', '+ 1 HOUR': '+ 1 HORA', '+ 1 DAY': '+ 1 DÍA', '+ 1 WEEK': '+ 1 SEMANA', 'MAKE THE LINK': 'CREAR EL ENLACE',
    'Everyone who opens the link sees it in their own time.': 'Quien abra el enlace lo verá en su propia hora.', 'YOUR EVENTS': 'TUS EVENTOS', 'Pick a date and time': 'Elige fecha y hora',
    'Moonmark {m}. Everyone who opens the link sees it in their own time.': 'Moonmark {m}. Quien abra el enlace lo verá en su propia hora.',
    // sky
    "THE MOON'S PATH TODAY": 'EL CAMINO DE LA LUNA HOY', "THE MOON'S PATH · LOOKING SOUTH": 'EL CAMINO DE LA LUNA · MIRANDO AL SUR', "THE MOON'S PATH · LOOKING NORTH": 'EL CAMINO DE LA LUNA · MIRANDO AL NORTE',
    "The moon's path depends on where you are. Your location stays on this phone.": 'El camino de la luna depende de dónde estés. Tu ubicación se queda en este teléfono.',
    'USE MY LOCATION': 'USAR MI UBICACIÓN', 'FINDING YOU…': 'BUSCÁNDOTE…', 'OR A US ZIP CODE': 'O UN CÓDIGO POSTAL DE EE. UU.', 'ZIP code': 'Código postal', 'SHOW': 'MOSTRAR', 'CHANGE': 'CAMBIAR', 'YOUR LOCATION': 'TU UBICACIÓN',
    'Enter a 5-digit ZIP code': 'Escribe un código postal de 5 dígitos', 'That ZIP code was not found': 'No encontramos ese código postal', 'Could not look up that ZIP code': 'No se pudo buscar ese código postal',
    'Looking up a ZIP code needs a connection': 'Buscar un código postal necesita conexión', 'Location is not available on this device': 'La ubicación no está disponible en este dispositivo',
    'Allow location for Moon in Settings to see the sky': 'Permite la ubicación para Moon en Ajustes para ver el cielo',
    'Right now': 'Ahora mismo', 'At {t}': 'A las {t}', 'is': 'está', 'was': 'estaba', 'will be': 'estará',
    '{when} the moon {verb} {deg}° up in the {dir}.': '{when}, la luna {verb} a {deg}° de altura, hacia el {dir}.', '{when} the moon {verb} below the horizon.': '{when}, la luna {verb} bajo el horizonte.',
    'RISE': 'SALIDA', 'HIGHEST': 'MÁS ALTA', 'SET': 'PUESTA', 'PLAY': 'REPRODUCIR', 'PAUSE': 'PAUSA', 'MOON UP': 'LUNA VISIBLE', 'BELOW THE HORIZON': 'BAJO EL HORIZONTE',
    'in the {dir}': 'por el {dir}', '{deg}° up, {dir}': '{deg}° de altura, {dir}', 'not up': 'no sale', 'not that day': 'no ese día', 'RISE {t}': 'SALIDA {t}', 'SET {t}': 'PUESTA {t}',
    ' · yesterday': ' · ayer', ' · tomorrow': ' · mañana', 'YESTERDAY': 'AYER', 'TOMORROW': 'MAÑANA',
    'north': 'norte', 'north-northeast': 'norte-noreste', 'northeast': 'noreste', 'east-northeast': 'este-noreste', 'east': 'este', 'east-southeast': 'este-sureste', 'southeast': 'sureste', 'south-southeast': 'sur-sureste',
    'south': 'sur', 'south-southwest': 'sur-suroeste', 'southwest': 'suroeste', 'west-southwest': 'oeste-suroeste', 'west': 'oeste', 'west-northwest': 'oeste-noroeste', 'northwest': 'noroeste', 'north-northwest': 'norte-noroeste',
    'W': 'O', 'SW': 'SO', 'NW': 'NO', 'WSW': 'OSO', 'WNW': 'ONO', 'SSW': 'SSO', 'NNW': 'NNO',
    // tide
    'TIDES': 'MAREAS', 'Finding the nearest tide station…': 'Buscando la estación de mareas más cercana…', 'Tides need a connection.': 'Las mareas necesitan conexión.', 'Tide times are not available right now.': 'Las horas de marea no están disponibles ahora.',
    'Rising': 'Subiendo', 'Falling': 'Bajando', 'High': 'Pleamar', 'Low': 'Bajamar', 'HIGH': 'PLEAMAR', 'LOW': 'BAJAMAR', 'NOW_AXIS': 'AHORA',
    '{dir} · {lvl} now.': '{dir} · {lvl} ahora.', '{kind} tide {ft} at {t}.': '{kind} de {ft} a las {t}.', 'Nearest coast: {place}.': 'Costa más cercana: {place}.',
    'NOAA predictions for {place} · {far}heights above {datum}.': 'Predicciones de NOAA para {place} · {far}alturas sobre {datum}.', '{km} km away, the nearest station · ': 'a {km} km, la estación más cercana · ',
    'SPRING TIDES': 'MAREAS VIVAS', 'NEAP TIDES': 'MAREAS MUERTAS', 'TIDES GROWING': 'MAREAS EN AUMENTO', 'TIDES EASING': 'MAREAS EN DESCENSO',
    'Sun and moon pull in line, so highs run higher and lows lower.': 'El Sol y la Luna tiran alineados: las pleamares suben más y las bajamares bajan más.',
    'Sun and moon pull at right angles, so the range between high and low is smallest.': 'El Sol y la Luna tiran en ángulo recto: la diferencia entre pleamar y bajamar es mínima.',
    'The range between high and low is growing toward spring tides.': 'La diferencia entre pleamar y bajamar crece hacia las mareas vivas.',
    'The range between high and low is shrinking toward neap tides.': 'La diferencia entre pleamar y bajamar se reduce hacia las mareas muertas.',
    ' The moon is close ({km} km), adding a little extra.': ' La Luna está cerca ({km} km) y suma un poco más.', ' Expect king tides.': ' Espera mareas reales.',
    ' The moon is far ({km} km), taking a little off.': ' La Luna está lejos ({km} km) y resta un poco.',
    'Next spring tides {a} · next neap tides {b}.': 'Próximas mareas vivas {a} · próximas mareas muertas {b}.',
    // phases
    'New moon': 'Luna nueva', 'Waxing crescent': 'Creciente', 'First quarter': 'Cuarto creciente', 'Waxing gibbous': 'Gibosa creciente', 'Full moon': 'Luna llena',
    'Waning gibbous': 'Gibosa menguante', 'Last quarter': 'Cuarto menguante', 'Waning crescent': 'Menguante',
    // language
    'LANGUAGE': 'IDIOMA',
  };
  var DICTS = { es: ES };
  var lang = 'en';
  try { var o = localStorage.getItem('moonLang'); lang = o && (o === 'en' || DICTS[o]) ? o : ((navigator.language || 'en').slice(0, 2).toLowerCase()); } catch (e) {}
  if (!DICTS[lang]) lang = 'en';
  var D = DICTS[lang] || {};
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function T(s, v) { var x = D[s]; return fill(x != null ? x : s, v); }
  // Translate whole text nodes and labels that exactly match an English string.
  var ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
  function node(n) {
    if (n.nodeType === 3) { var t = n.nodeValue, k = t.trim(); if (k && D[k] != null && D[k] !== k) n.nodeValue = t.replace(k, D[k]); return; }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
    ATTRS.forEach(function (a) { var v = n.getAttribute && n.getAttribute(a); if (v && D[v] != null) n.setAttribute(a, D[v]); });
    for (var c = n.firstChild; c; c = c.nextSibling) node(c);
  }
  function apply(rootEl) { if (lang === 'en') return; node(rootEl || document.body); }
  if (lang !== 'en') {
    document.documentElement.lang = lang;
    var start = function () {
      apply(document.body);
      new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') node(m.target); else m.addedNodes.forEach(node); }); })
        .observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  function set(l) { try { if (l === 'auto') localStorage.removeItem('moonLang'); else localStorage.setItem('moonLang', l); } catch (e) {} location.reload(); }
  root.MoonI18n = { lang: lang, T: T, apply: apply, set: set, languages: [['en', 'English'], ['es', 'Español']] };
  root.MoonT = T;
})(window);
