MEMES.IO · ZIP LISTO PARA GITHUB PAGES
=======================================

1. En https://github.com/new crea un repositorio PÚBLICO llamado memes-io.
   (GitHub Free requiere repositorio público para Pages).
2. Entra en el repositorio. Pulsa Add file > Upload files.
3. DESCOMPRIME ESTE ZIP y sube todos los archivos y carpetas que contiene
   (index.html y app.js deben quedar EN LA RAIZ del repositorio, no en subcarpeta).
   Si GitHub no admite arrastrar carpetas, arrastra directamente todo el contenido
   de la carpeta descomprimida o utiliza GitHub Desktop.
4. Pulsa Commit changes.
5. Ve a Settings > Pages > Build and deployment:
   Source: Deploy from a branch
   Branch: main
   Folder: /(root)
   Pulsa Save.
6. Cuando publique, la dirección será:
   https://TU-USUARIO.github.io/memes-io/
   El enlace exacto aparecerá en la sección Pages.

QUE FUNCIONA GRATIS SOLO CON GITHUB PAGES
- El mapa de burbujas, movimiento, zoom, arrastre y minimapa.
- Simulación DEMO, callers/grupos ficticios, feed simulado.
- Filtros de tamaño/color, modo día/noche, Axiom/Padre por doble clic.
- Descarga JSON de la simulación (etiquetado como DEMO).

QUE NO FUNCIONA SIN SERVIDOR (NO LO PRESENTAMOS COMO DATOS REALES)
- Recopilación real de Pump.fun, Kolscan, Telegram y Axiom.
- Ejecución en segundo plano de rastreo, informes en vivo e históricos persistentes.
- Integraciones RPC/IA que contienen claves privadas, captura de pestañas Axiom.

DATOS REALES CON SERVIDOR SEPARADO (OPCIONAL)
- Instala el ZIP memes_io_backend_para_github_pages.zip en un hosting Node HTTPS.
- Configura HOST, PORT, MEMES_WEB_PASSWORD y MEMES_ALLOWED_ORIGIN
  como indica LEEME_GITHUB_PAGES.txt del backend.
- En la web publicada pulsa 'Servidor en vivo'. Introduce la dirección HTTPS del
  backend y la contraseña. Se prueban antes de activarlo.
- El puente Axiom opcional debe conectarse al backend, no a Pages.

SEGURIDAD
- No subas archivos .env, claves API, runtime-data, secretos ni contraseña.
- No publiques las bases de datos de uso particular ni los archivos del backend
  en el repositorio de Pages.
- Los sitios Pages en GitHub Free se publican desde repositorios públicos.
