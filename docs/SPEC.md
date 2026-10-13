# Olmo Métricas — Especificación v1

Calculadora pública de métricas para negocios de suscripción (apps, streaming, música, SaaS B2C). En 2 minutos responde: **¿cuánto ingreso de verdad, cuánto vale cada cliente y si el negocio se sostiene?**

Estado: **aprobado e implementado (v1)** · 2026-10-13

---

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Stack | Igual que Olmo Cotiza: Vite + React en SiteGround, Supabase (Postgres + RLS), deploy por rsync |
| Motor de cálculo | **En SQL**: `public.calculate_metrics(inputs)` en Postgres. El frontend lo llama en cada cambio (debounce de 220 ms). Sin `supabase-js`: 4 llamadas RPC con `fetch` |
| Dominio | `metricas.olmo.agency` |
| Marca | Olmo siempre visible: header, footer "Hecho por olmo", PDF y CTA a olmo.agency |
| Idiomas | Español e inglés. Detecta el idioma del navegador y tiene toggle ES / EN |
| Moneda | Selector USD (default), COP, MXN, EUR. Solo cambia el formato; no convierte |
| Persistencia | Cada estudio se guarda anónimo y recibe un link para compartir `/e/<slug>`. Correo opcional al exportar |
| Crecimiento | % **bruto** de usuarios nuevos al mes, marcado con asterisco y nota |
| Plan anual | Opcional: precio anual + % de usuarios en plan anual |
| Comisiones | Presets + campo libre (% + fijo por transacción) |
| Revenue anual | Se muestran los dos: run-rate (MRR × 12) y proyectado a 12 meses, con la explicación |
| Costos | Marketing, nómina, contenido/licencias, infraestructura, otros fijos y costo variable por usuario |
| PDF | `window.print()` con hoja de impresión A4 (texto real, no imagen) |
| Repo | `santiagocardonao/olmo-metricas`, público, README en inglés |
| Ejemplo | Streaming genérico ficticio ("Cinemar"), precargado |

---

## 2. Campos de entrada

### Usuarios y crecimiento
| Campo | Default ejemplo | Validación |
|---|---|---|
| Usuarios activos pagos hoy | 50.000 | entero ≥ 0 |
| Crecimiento bruto mensual* | 7 % | 0–100 |
| Churn mensual (plan mensual) | 5 % | 0–100 |

\* *Usuarios nuevos que entran cada mes como % de la base activa, antes de restar el churn. Si creces 7 % y pierdes 5 %, tu crecimiento neto es ~2 %.*

### Precio y planes
| Campo | Default | Notas |
|---|---|---|
| Precio mensual | 9,99 | |
| ☐ Tengo plan anual | activado | muestra los 3 campos siguientes |
| Precio plan anual (total al año) | 99,99 | muestra "equivale a X/mes, Y % de descuento" |
| % de usuarios en plan anual | 25 % | |
| % que no renueva el plan anual | 30 % | se convierte a churn mensual equivalente |

### Comisiones e impuestos
| Campo | Default | Notas |
|---|---|---|
| Preset de pasarela | Stripe | Stripe 2,9 % + 0,30 · App Store / Google Play 15 % · App Store / Google Play 30 % · Wompi 2,65 % + 700 COP · Mercado Pago 3,49 % · Personalizado |
| Comisión % | 2,9 % | editable; al editar, el preset pasa a "Personalizado" |
| Fijo por transacción | 0,30 | en la moneda elegida |
| IVA / impuesto incluido en el precio | 0 % | ej. 19 % en Colombia. Se descuenta del ingreso neto |

### Costos mensuales
| Campo | Default |
|---|---|
| Marketing / adquisición | 120.000 |
| Nómina | 150.000 |
| Contenido y licencias | 90.000 |
| Infraestructura y herramientas | 15.000 |
| Otros costos fijos (oficina, legal, contabilidad) | 10.000 |
| Costo variable por usuario activo (servidores, ancho de banda, soporte, regalías) | 0,80 |

Opcional arriba del formulario: **Nombre de la empresa** (sale en el PDF).

---

## 3. Fórmulas

Notación: `U` usuarios hoy · `a` % en plan anual · `Pm` precio mensual · `Pa` precio anual · `f` comisión % · `F` fijo por transacción · `t` impuesto incluido · `cm` churn mensual · `ca` no renovación anual · `g` crecimiento bruto · `v` costo variable por usuario.

Si el plan anual está apagado, `a = 0`.

### Por usuario (mensual)
```
ARPU bruto            = (1−a)·Pm + a·Pa/12
Impuesto por usuario  = ARPU · t/(1+t)
Comisión por usuario  = (1−a)·(Pm·f + F) + a·(Pa·f + F)/12     ← el plan anual paga 1 transacción al año
Ingreso neto/usuario  = ARPU − impuesto − comisión
Margen de contribución/usuario = ingreso neto − v
```

### Churn combinado
```
Churn mensual equivalente del anual = 1 − (1 − ca)^(1/12)
Churn combinado (c)   = (1−a)·cm + a·churn_anual_equivalente
Vida promedio (meses) = 1 / c
```

### Ingresos
```
MRR bruto     = U · ARPU
MRR neto      = U · ingreso neto por usuario
ARR run-rate  = MRR × 12              ← "si nada cambia"
Revenue 12 meses proyectado = Σ (m = 0..11) U_m · ARPU    ← con crecimiento y churn
U_m           = U · (1 + g − c)^m
```
Se muestran bruto y neto para ambos. Texto explicativo: *"El run-rate supone que mañana eres igual a hoy. La proyección aplica tu crecimiento y tu churn mes a mes. Si tu crecimiento neto es positivo, la proyección supera al run-rate."*

Nota sobre el plan anual: se cobra por adelantado, pero se reconoce como 1/12 por mes (así lo cuenta cualquier inversionista). Se aclara en una nota al pie.

### CLTV
```
CLTV bruto       = ARPU / c
CLTV por margen  = margen de contribución por usuario / c     ← cifra principal
```
Se muestra el de margen como cifra principal y el bruto como referencia, con una nota: *"El CLTV bruto sobreestima: ignora comisiones, impuestos y costos de servir al usuario."*

### Adquisición
```
Usuarios nuevos/mes  = U · g
Crecimiento neto     = g − c
CAC                  = marketing / usuarios nuevos
LTV : CAC            = CLTV por margen / CAC
Payback (meses)      = CAC / margen de contribución por usuario
```

### Rentabilidad
```
Costos fijos     = marketing + nómina + contenido + infraestructura + otros
Utilidad mensual = U · margen de contribución − costos fijos
Margen neto      = utilidad / MRR bruto
Punto de equilibrio (usuarios) = costos fijos / margen de contribución por usuario
Meses al equilibrio = primer m de la proyección con utilidad ≥ 0 (o "no ocurre en 24 meses")
```

### Supuestos de la proyección (se muestran en pantalla y en el PDF)
- Precio, % anual, comisiones, churn y costos se mantienen constantes.
- El crecimiento bruto es % de la base activa, así que crece en términos absolutos.
- Se proyecta a 12 meses en la tabla y a 24 para calcular el equilibrio.

### Casos límite
- Churn 0 → vida infinita. Se muestra "∞" y el CLTV se calcula a 60 meses con aviso: *"Un churn de 0 % no es realista; usamos 5 años como techo."*
- Crecimiento 0 → CAC, LTV:CAC y payback muestran "—" con el texto "Sin usuarios nuevos no hay CAC".
- Margen de contribución ≤ 0 → payback y punto de equilibrio "no se alcanza", con una alerta roja: *"Pierdes dinero con cada usuario antes de pagar costos fijos."*

---

## 4. Semáforo (benchmarks B2C)

| Métrica | Verde | Amarillo | Rojo |
|---|---|---|---|
| Churn combinado mensual | ≤ 3 % | 3–7 % | > 7 % |
| LTV : CAC | ≥ 3 | 1–3 | < 1 |
| Payback | ≤ 6 meses | 6–12 | > 12 |
| Crecimiento neto mensual | ≥ 3 % | 0–3 % | < 0 |
| Margen neto | ≥ 15 % | 0–15 % | < 0 |

Cada indicador tiene una línea de diagnóstico ("Tu churn está en el rango típico del streaming…") en ES y EN. Los rangos son referencias generales y así se dice.

---

## 5. Pantallas

### `/` Calculadora
- **Header:** logo olmo · toggle ES/EN · selector de moneda.
- **Hero:** "Valida tus *ingresos* en 2 minutos" (Inter 600 con la palabra en Source Serif italic y gradiente). Bajada: "Para apps, streaming y cualquier negocio de suscripción."
- **Cuerpo, en dos columnas en desktop:**
  - Izquierda: formulario en 4 tarjetas (Usuarios · Precio · Comisiones · Costos). Cada campo tiene un tooltip "¿qué es esto?".
  - Derecha, fija al hacer scroll: los KPIs principales en vivo (MRR, ARR, CLTV, LTV:CAC, utilidad mensual).
- **Debajo, a todo el ancho:**
  1. Tarjetas de KPIs completos (sección 3), con el semáforo.
  2. Run-rate vs proyectado, con la explicación.
  3. Gráfica de 12 meses: usuarios, MRR y utilidad (SVG propio, sin librerías).
  4. Tabla mes a mes.
  5. Supuestos y notas.
- **Cierre:** botón principal **"Exportar estudio en PDF"** y botón secundario "Copiar link del estudio".
- **Footer:** banda violeta de Olmo: "¿Tu app necesita una web que convierta? Hablemos" → olmo.agency.
- **Móvil:** todo en una columna; los KPIs en vivo pasan a una barra inferior compacta.

### `/e/:slug` Estudio compartido
Carga los inputs guardados, recalcula y muestra lo mismo. Si el visitante edita algo, se crea un estudio nuevo al exportar o copiar el link. El original no se modifica nunca.

### Impresión / PDF
- Hoja `@media print` en A4, 2 páginas:
  1. Portada compacta con gradiente Olmo, nombre de la empresa, fecha, moneda y KPIs principales con semáforo.
  2. Inputs resumidos, gráfica, tabla de 12 meses, supuestos, link al estudio y "Hecho por olmo · metricas.olmo.agency".
- Oculta el formulario y los botones; fuerza los colores de fondo con `print-color-adjust: exact`.

### Flujo al exportar
1. Clic en "Exportar estudio en PDF" → se guarda el estudio (si aún no existe) y se obtiene el slug.
2. Modal opcional: "¿Quieres recibir actualizaciones de Olmo? Tu correo" + casilla de autorización de datos (Ley 1581 de Colombia). Botón "Omitir".
3. Se abre `window.print()`.

---

## 6. Backend (Supabase)

### Tabla `metric_studies`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid pk | |
| slug | text unique | aleatorio, 12 caracteres base62 (~71 bits) |
| locale | text | `es` / `en` |
| currency | text | `USD` `COP` `MXN` `EUR` |
| company_name | text null | ≤ 120 caracteres |
| inputs | jsonb | ≤ 4 KB; versión del esquema incluida (`v: 1`) |
| results | jsonb | snapshot de KPIs, solo para estadísticas |
| email | text null | solo con consentimiento |
| consent_at | timestamptz null | |
| created_at | timestamptz | |

### Seguridad
- RLS activado; `anon` **no** puede leer ni escribir la tabla directamente.
- Todo pasa por funciones `security definer` con `search_path = ''`, igual que en Cotiza:
  - `create_study(inputs, results, locale, currency, company_name) → slug`: valida tipos y rangos, tamaño y límite global diario (p. ej. 5.000 estudios/día).
  - `get_study(slug) → {inputs, locale, currency, company_name}`: nunca devuelve el correo.
  - `attach_email(slug, email, consent)`: solo si el estudio tiene menos de 1 hora y aún no tiene correo.
- Las fórmulas viven en Postgres (`calculate_metrics`, `security invoker`, no lee tablas). `create_study` recalcula los resultados en el servidor; nunca confía en los números del cliente.
- `get_benchmarks()` devuelve medianas de churn, crecimiento neto, LTV:CAC y margen sobre estudios con inputs distintos. La app las muestra cuando hay 20 o más.
- Sin IP ni datos personales, salvo el correo voluntario.

### Proyecto
Mismo proyecto de Supabase de Cotiza (`dxukpgcsodrbktkhcutk`), tabla nueva `metric_studies`.

---

## 7. Repositorio

```
olmo-metricas/
  README.md              inglés: qué es, cómo funciona, fórmulas, seguridad, desarrollo
  docs/
    SPEC.md              este documento
    FORMULAS.md          fórmulas con ejemplo numérico resuelto (inglés)
  supabase/
    migrations/          tabla, RLS y funciones
  app/
    src/lib/api.js       llamadas RPC y hook useMetrics
    src/lib/defaults.js  ejemplo, presets de pasarelas, monedas
    src/lib/i18n.js      textos ES / EN
    src/lib/*.test.js    tests (node --test)
    src/…                componentes
    public/.htaccess     rewrite SPA
```

---

## 8. Ejemplo "Cinemar" (verificación)

Con los defaults: ARPU ≈ 9,58 · comisión ≈ 0,51 · margen de contribución ≈ 8,27 por usuario · churn combinado ≈ 4,5 % · CLTV por margen ≈ 184 · usuarios nuevos 3.500 · CAC ≈ 34 · LTV:CAC ≈ 5,4 · payback ≈ 4 meses · MRR ≈ 479 mil · utilidad ≈ +28 mil/mes. Es un negocio sano pero ajustado, buen punto de partida para mover variables.

---

## 9. Decisiones finales

1. Supabase: mismo proyecto de Cotiza, tabla nueva.
2. Subdominio `metricas.olmo.agency`, creado en SiteGround el 2026-10-13.
3. Los correos se quedan en Supabase por ahora (columna `email` + `consent_at`).
