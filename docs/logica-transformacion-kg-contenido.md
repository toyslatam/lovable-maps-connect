# Logica de transformacion a kg en Contenido

Este documento describe la logica propuesta para normalizar cantidades de `Contenido` a kg y evaluar criterios de cumplimiento sin romper columnas no relacionadas.

## Objetivo

Normalizar a kg los valores capturados en:

- `M`: Total de harina que consume
- `N`: Elabora panaderia
- `O`: Elabora pasteleria
- `Q/R/S/T`: Levaduras por marca (texto cualitativo)

usando:

- `BE`: unidad declarada por el encuestado para harina
- texto libre en la misma celda (si viene unidad embebida)

## Columnas involucradas

- `A`: fecha y hora de respuesta (se usa solo dia/mes/anio para filtros)
- `M/N/O`: cantidades de harina (texto libre)
- `BE`: unidad de medida de harina reportada
- `Q/R/S/T`: cantidades de levadura (texto libre por marca)
- `CD/CG/CH/DB/DC`: criterios de control ya existentes

## Regla de parseo (texto cualitativo)

Para cada campo de cantidad:

1. Si contiene `/` -> se considera no estandarizable automaticamente (resultado `null`).
2. Si esta vacio o no tiene digitos -> `null`.
3. Extraer primer numero util (admitir `,` y `.`).
4. Detectar unidad buscando en `texto + unidad fallback`:
   - `kg`, `kilo`, `kilos`
   - `bulto`, `bultos`
   - `lb`, `libra`, `libras`
   - `arroba`, `arrobas`
5. Aplicar factor de conversion (alineado con tu formula):
   - kg/kilos -> `* (0.08 * 12.5)`
   - bulto/bultos -> `* (4 * 12.5)`
   - lb -> `* (0.0363 * 125)`
   - libra/libras -> `* (0.0363 * 12.5)`
   - arroba/arrobas -> `* 12.5`
   - sin unidad detectada -> `* 12.5`

> Nota: para `M/N/O`, el `fallback` de unidad debe ser `BE`.

## Regla especifica para levaduras (Q/R/S/T)

Los textos de marcas suelen venir tipo:

- `Cantidad semanal:25 libras, Precio de compra:1234`

Parseo recomendado:

1. Tomar preferentemente la porcion asociada a cantidad (antes de coma o primer bloque con numero).
2. Extraer numero de cantidad y unidad en esa porcion.
3. Convertir a kg:
   - kg -> `1`
   - libras/lb -> `0.453592`
   - gramos/g -> `0.001`
   - sin unidad -> asumir kg (o marcar incierto segun preferencia funcional)
4. Sumar `Q + R + S + T` para `Levadura total kg`.

## Criterios de cumplimiento en kg

### Criterio 1: Total Cant Correctas

- Convertir `M`, `N`, `O` a kg.
- Cumple si `M_kg == N_kg + O_kg` dentro de tolerancia (ej. 0.001 o configurable).
- Si alguno no parsea -> `Sin dato`.

### Criterio 2: Cumple con Criterios (DB/DC)

Mantener estructura actual, pero con entrada normalizada:

- `CD` puede derivarse de campo estandarizado o de `M_kg`.
- `DB`: `CG / CD < 0.15` -> Cumple.
- `DC`: falla por umbrales existentes en `CG/CH`.

## Filtros de fecha (columna A)

- `A` viene fecha-hora.
- Para filtrar:
  - parsear y normalizar a `YYYY-MM-DD`
  - comparar solo fecha, ignorando hora.

## Persistencia segura (sin tocar otras columnas)

Para evitar sobrescribir columnas no pedidas:

- Usar updates puntuales por fila:
  - `updateStatus`: `BN/BS/BV/BW`
  - `updateContentFields`: `M/N/O/Q/R/S/T`
- Nunca reescribir bloque completo al guardar estos campos.

## Validaciones UI recomendadas

- Mostrar para `M/N/O`:
  - valor original
  - kg estimado
  - estado de parseo (`ok`, `sin dato`, `formato ambiguo`)
- En boton `Info`:
  - tabla de referencia por tipo de negocio (como imagen 2)
  - `% levadura estimado = levadura_total_kg / harina_total_kg * 100`
  - rango esperado y semaforo (dentro/fuera).

## Casos de prueba minimos

1. `Cantidad:25 libras` + `BE=lb` -> parseo a kg correcto.
2. `M` con unidad en texto y `BE` vacio -> debe usar unidad del texto.
3. `M` sin unidad en texto y `BE=arrobas` -> debe usar BE.
4. `M` con `/` -> no estandariza, criterios en `Sin dato`.
5. `Q/R/S/T` con texto mixto (precio incluido) -> solo cantidad afecta kg.
6. Filtro por fecha con valores `dd/mm/yyyy hh:mm:ss` -> toma solo fecha.

## Decision pendiente antes de implementar ajuste fino

Definir una politica unica para textos ambiguos de levadura sin unidad:

- Opcion A: asumir kg.
- Opcion B: asumir libras.
- Opcion C: marcar como `Sin dato` y pedir correccion manual.

