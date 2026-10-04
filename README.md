# TakumiStudios · Bot de Discord

Creado por TakumiStudios. Anuncios mediante comandos y acceso a canales mediante un rol de verificado. Necesita Node.js 22.12 o superior y un proceso encendido para responder.

## Preparación

1. Crea una aplicación en https://discord.com/developers/applications y obtén su token en **Bot**. Guarda el token únicamente en `.env`.
2. En **OAuth2 → URL Generator**, selecciona `bot` y `applications.commands`. Selecciona **Ver canales**, **Enviar mensajes**, **Insertar enlaces** y **Gestionar roles**. Abre el enlace para invitar al bot a tu servidor. No necesita Administrador ni intents privilegiados.
3. Crea un rol **Verificado** sin permisos administrativos. En la lista de roles coloca el rol del bot por encima de él.
4. Activa el modo desarrollador en Discord (Ajustes → Avanzado) para copiar los IDs de la aplicación, servidor y rol.
5. Ejecuta en esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` y sustituye los cuatro valores. Después:

```powershell
npm run deploy
npm start
```

`deploy` registra los comandos en el servidor configurado. Repite ese comando si modificas su definición. El botón sigue funcionando después de reiniciar el bot porque se atiende por un identificador persistente.

## Alojamiento

Usa Node.js 22.12 o superior, instala las dependencias con `npm ci` y configura el archivo de entrada como `index.js`. El comando de arranque es `npm start` o `node index.js`.

El punto de entrada en la raíz carga `.env` automáticamente. También admite las variables de entorno configuradas en el panel del alojamiento sin un archivo `.env`. Sube `index.js`, `src/`, `package.json` y `package-lock.json`; si usas `.env`, súbelo de forma privada. Ejecuta `npm run deploy` con `.env` para registrar los comandos en Discord.

## Acceso a los canales

En cada categoría privada, configura **Ver canal** en ❌ para `@everyone` y en ✅ para **Verificado**. Sincroniza con la categoría los canales que deban quedar protegidos. Si hay canales de voz, permite también **Conectar** al rol Verificado.

Mantén `#normas` y `#verificacion` visibles para `@everyone`. En `#verificacion` puedes desactivar **Enviar mensajes** para `@everyone`, permitiéndolo al bot. En las categorías privadas permite al bot **Ver canal**, **Enviar mensajes** e **Insertar enlaces** si publicará anuncios allí.

Revisa que otros roles y permisos individuales no concedan acceso a los canales privados antes de verificar. Los administradores conservan su acceso. El bot asigna el rol; las restricciones las establecen estos permisos de Discord. No modifica automáticamente los canales existentes.

## Comandos

- `/anuncio canal:#anuncios titulo:Noticias mensaje:Tu texto`: publica directamente cuando se indican canal, título y mensaje. Mantiene la imagen adjunta opcional y admite `importancia`, `color`, `enlace` y `boton`. No envía menciones masivas. En un canal de anuncios, publica el mensaje pero no lo difunde automáticamente a servidores seguidores.
- `/anuncio` sin parámetros abre un formulario para título, mensaje, enlace, texto del botón y color. Después muestra una vista previa privada con selector de canal e importancia y botones **Editar**, **Publicar** y **Cancelar**. Los parámetros parciales se conservan en el formulario; si ya hay título y mensaje pero falta el canal, se abre directamente la vista previa. Para incluir una imagen en este flujo, usa `/anuncio imagen:archivo` y rellena el formulario.
- `importancia` puede ser `informativo` (azul, predeterminada), `novedad` (verde), `importante` (naranja) o `urgente` (rojo). Se muestra también en el pie del anuncio. `color`, por ejemplo `#FF8800`, tiene prioridad sobre el color de la importancia; bórralo en **Editar** para recuperar el color predeterminado.
- `enlace` acepta HTTP o HTTPS y crea un botón con el texto de `boton` (o **Abrir enlace**). Los enlaces también se pueden escribir en el mensaje.

Los borradores solo los puede controlar su autor y caducan a los 15 minutos o al reiniciar el bot. Antes de publicar se comprueban de nuevo los permisos del usuario y del bot. Tras subir estos cambios al alojamiento, ejecuta `npm run deploy` para actualizar los parámetros de Discord y reinicia el bot.

- `/verificacion canal:#verificacion`: publica el panel de acceso. Al pulsar **Verificarme**, el usuario recibe el rol configurado; si ya lo tiene, se le informa en privado.

Ambos comandos requieren **Gestionar servidor**. El botón está disponible para los miembros. Esta verificación es una aceptación de acceso mediante botón, no una comprobación de identidad ni un captcha.

## Comprobación

```powershell
npm test
```

Con el bot conectado, publica el panel y prueba con una cuenta sin permisos administrativos: antes de pulsar no debe ver los canales privados; después debe recibir Verificado y poder acceder. Repite la pulsación y reinicia el bot para comprobar el panel. Prueba también un anuncio y que un usuario normal no pueda ejecutar los comandos del equipo.

Si falla la verificación, comprueba que el ID del rol sea correcto, que no sea un rol de integración, que no tenga permisos administrativos y que esté por debajo del rol del bot. Si cierras la terminal o apagas el equipo, el bot deja de responder; para uso permanente ejecútalo en un servidor o servicio de alojamiento.

Referencias: [discord.js](https://discord.js.org/docs/packages/discord.js/14.27.0) y [roles y permisos de Discord](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions).
