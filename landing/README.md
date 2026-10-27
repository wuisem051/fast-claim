# FastClaim - Página de Aterrizaje (Landing Page)

Esta carpeta contiene la **Landing Page oficial** de FastClaim, diseñada para explicar la app, mostrar capturas reales de la interfaz, el sistema de ganancias (bonus por hora y referidos), calculadora interactiva y opciones de acceso tanto en versión Web como en Telegram Mini App.

---

## 🚀 Despliegue en Netlify

Esta carpeta está configurada de manera completamente independiente con su propio `netlify.toml` y `package.json`.

### Opción 1: Desplegar desde GitHub como un sitio separado en Netlify (Recomendado)
1. En Netlify, haz clic en **"Add new site"** > **"Import an existing project"**.
2. Selecciona el repositorio de GitHub: `fast-claim`.
3. En la configuración de construcción (**Build Settings**):
   - **Base directory**: `landing`
   - **Publish directory**: `landing` (o dejar `.` relativo a `landing`)
   - **Build command**: dejar vacío o `npm run build`
4. Haz clic en **Deploy Site**.

### Opción 2: Despliegue directo por arrastrar y soltar (Netlify Drop)
1. Ve a [Netlify Drop](https://app.netlify.com/drop).
2. Arrastra directamente la carpeta `landing` a la ventana del navegador.
3. El sitio quedará publicado al instante con su propia URL `.netlify.app`.

### Opción 3: Despliegue mediante Netlify CLI
Desde tu terminal en esta carpeta:
```bash
cd landing
npx netlify deploy --prod --dir=.
```

---

## 📁 Estructura de la Carpeta

```text
landing/
├── assets/
│   └── img/
│       ├── mockup-dashboard.jpg  # Captura de pantalla de la app (Dashboard/Claim)
│       └── mockup-withdraw.jpg   # Captura de pantalla de la app (Retiros)
├── index.html                    # Estructura principal y SEO
├── style.css                     # Sistema de diseño moderno, animaciones y responsive
├── main.js                       # Calculadora interactiva y modal de acceso
├── netlify.toml                  # Configuración de headers y redirects para Netlify
├── package.json                  # Metadatos del proyecto
└── README.md                     # Guía de despliegue
```

---

## 🎨 Características Incluidas

- **Explicación clara**: Qué es FastClaim, cómo registrarse en 3 simples pasos.
- **Calculadora en vivo**: Permite al visitante interactuar calculando cuántos tokens ARPA y USDT ganará según sus reclamos y amigos referidos.
- **Mockups de alta resolución**: Capturas reales del funcionamiento (Home/Reclamo de Bono y Pantalla de Retiro a Wallet).
- **Acceso Directo**: Botones para ingresar a la versión Web o a la versión Telegram Mini App.
- **100% Responsive & Dark Theme**: Adaptado para móviles, tablets y ordenadores con efectos de iluminación modernos (glassmorphism).
