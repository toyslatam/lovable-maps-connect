# Estructura del proyecto (lovable-maps-connect)

```text
.
├─ public/
│  ├─ favicon.ico
│  ├─ placeholder.svg
│  └─ robots.txt
├─ supabase/
│  ├─ config.toml
│  └─ functions/
│     └─ google-sheets/
│        └─ index.ts
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ App.css
│  ├─ index.css
│  ├─ vite-env.d.ts
│  ├─ pages/
│  │  ├─ Login.tsx
│  │  ├─ LocationModule.tsx
│  │  ├─ PhoneModule.tsx
│  │  ├─ ConnectionsModule.tsx
│  │  ├─ UsersModule.tsx
│  │  ├─ Index.tsx
│  │  └─ NotFound.tsx
│  ├─ context/
│  │  ├─ AuthContext.tsx
│  │  └─ DataContext.tsx
│  ├─ components/
│  │  ├─ AppLayout.tsx
│  │  ├─ EstablishmentForm.tsx
│  │  └─ NavLink.tsx
│  │  └─ ui/ (componentes shadcn/ui)
│  ├─ integrations/
│  │  └─ supabase/
│  │     ├─ client.ts
│  │     └─ types.ts
│  ├─ hooks/
│  ├─ lib/
│  ├─ types/
│  └─ test/
│     ├─ example.test.ts
│     └─ setup.ts
├─ dist/ (generado al ejecutar `npm run build`)
├─ README.md
├─ index.html
├─ package.json
├─ package-lock.json
├─ bun.lock / bun.lockb
├─ vite.config.ts
├─ tsconfig*.json
├─ tailwind.config.ts
├─ postcss.config.js
├─ eslint.config.js
├─ vitest.config.ts
└─ playwright.config.ts
```

## Notas rápidas
- La sincronización con Google Sheets ocurre mediante la Edge Function `supabase/functions/google-sheets/index.ts`, invocada desde `src/context/DataContext.tsx` usando `supabase.functions.invoke`.
- La autenticación del frontend (`src/context/AuthContext.tsx`) es un **mock** basado en `localStorage` + `MOCK_USERS` (no protege la función de Supabase por sí sola).
