import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, BarChart3, Users, ChevronDown, CalendarDays } from "lucide-react";

type DayMetric = {
  day: string;
  total: number;
  phoneDone: number;
  phoneEmpty: number;
  locationDone: number;
  locationEmpty: number;
  contentDone: number;
  contentEmpty: number;
};

type SurveyorMetric = {
  surveyor: string;
  total: number;
  phoneDone: number;
  locationDone: number;
  contentDone: number;
  pendingAny: number;
  byDay: Array<{
    day: string;
    total: number;
    phoneDone: number;
    locationDone: number;
    contentDone: number;
  }>;
};

type DuplicateGroup = {
  key: string;
  normalizedName: string;
  city: string;
  rows: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    surveyor: string;
    facadePhotoUrl: string;
  }>;
};

function statusFilled(v: string): boolean {
  return (v || "").trim().length > 0;
}

function show(v: string): string {
  const t = (v || "").trim();
  return t || "Sin dato";
}

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function normalizeName(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ca|c a|c.a|srl|s r l|c.a.|sa|s a|cafe|panaderia|pasteleria)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = bigrams(a);
  const bb = bigrams(b);
  const bMap = new Map<string, number>();
  bb.forEach((x) => bMap.set(x, (bMap.get(x) || 0) + 1));
  let overlap = 0;
  aa.forEach((x) => {
    const n = bMap.get(x) || 0;
    if (n > 0) {
      overlap += 1;
      bMap.set(x, n - 1);
    }
  });
  return (2 * overlap) / (aa.length + bb.length);
}

function getPhotoCandidates(rawUrl: string): string[] {
  const url = (rawUrl || "").trim();
  if (!url) return [];
  const m = url.match(/\/file\/d\/([^/]+)/i) || url.match(/[?&]id=([^&]+)/i);
  const id = m?.[1];
  if (!id) return [url];
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w600`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    url,
  ];
}

function DuplicatePhoto({ rawUrl, alt }: { rawUrl: string; alt: string }) {
  const candidates = useMemo(() => getPhotoCandidates(rawUrl), [rawUrl]);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];

  if (!src) {
    return <p className="text-xs text-muted-foreground mt-2">Sin foto de fachada.</p>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-36 object-contain rounded border mt-2 bg-muted/20"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx < candidates.length - 1) setIdx((v) => v + 1);
        else setIdx(candidates.length);
      }}
    />
  );
}

export default function MetricsModule() {
  const { establishments } = useData();

  const dayMetrics = useMemo<DayMetric[]>(() => {
    const map = new Map<string, DayMetric>();
    establishments.forEach((r) => {
      const day = (r.recordDate || "").trim() || "Sin fecha";
      const current = map.get(day) || {
        day,
        total: 0,
        phoneDone: 0,
        phoneEmpty: 0,
        locationDone: 0,
        locationEmpty: 0,
        contentDone: 0,
        contentEmpty: 0,
      };
      current.total += 1;
      if (statusFilled(r.phoneStatus)) current.phoneDone += 1;
      else current.phoneEmpty += 1;
      if (statusFilled(r.localizedStatus)) current.locationDone += 1;
      else current.locationEmpty += 1;
      if (statusFilled(r.contentStatus)) current.contentDone += 1;
      else current.contentEmpty += 1;
      map.set(day, current);
    });
    return Array.from(map.values()).sort((a, b) => b.day.localeCompare(a.day));
  }, [establishments]);

  const surveyorMetrics = useMemo<SurveyorMetric[]>(() => {
    const map = new Map<string, Omit<SurveyorMetric, "byDay"> & { byDayMap: Map<string, { total: number; phoneDone: number; locationDone: number; contentDone: number }> }>();
    establishments.forEach((r) => {
      const surveyor = (r.listaNombre || r.contactName || r.localizedBy || "Sin encuestador").trim() || "Sin encuestador";
      const day = (r.recordDate || "").trim() || "Sin fecha";
      const current = map.get(surveyor) || {
        surveyor,
        total: 0,
        phoneDone: 0,
        locationDone: 0,
        contentDone: 0,
        pendingAny: 0,
        byDayMap: new Map<string, { total: number; phoneDone: number; locationDone: number; contentDone: number }>(),
      };
      current.total += 1;
      const phoneDone = statusFilled(r.phoneStatus);
      const locationDone = statusFilled(r.localizedStatus);
      const contentDone = statusFilled(r.contentStatus);
      if (phoneDone) current.phoneDone += 1;
      if (locationDone) current.locationDone += 1;
      if (contentDone) current.contentDone += 1;
      if (!phoneDone || !locationDone || !contentDone) current.pendingAny += 1;

      const dayStats = current.byDayMap.get(day) || { total: 0, phoneDone: 0, locationDone: 0, contentDone: 0 };
      dayStats.total += 1;
      if (phoneDone) dayStats.phoneDone += 1;
      if (locationDone) dayStats.locationDone += 1;
      if (contentDone) dayStats.contentDone += 1;
      current.byDayMap.set(day, dayStats);

      map.set(surveyor, current);
    });
    return Array.from(map.values())
      .map((m) => ({
        surveyor: m.surveyor,
        total: m.total,
        phoneDone: m.phoneDone,
        locationDone: m.locationDone,
        contentDone: m.contentDone,
        pendingAny: m.pendingAny,
        byDay: Array.from(m.byDayMap.entries())
          .map(([day, v]) => ({ day, ...v }))
          .sort((a, b) => b.day.localeCompare(a.day)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [establishments]);

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const grouped = new Map<string, DuplicateGroup>();
    const normalizedRows = establishments.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      city: r.city,
      surveyor: r.listaNombre || "Sin encuestador",
      facadePhotoUrl: r.facadePhotoUrl,
      nName: normalizeName(r.name),
      nCity: normalizeName(r.city),
    }));

    normalizedRows.forEach((r) => {
      if (!r.nName) return;
      const key = `${r.nName}||${r.nCity}`;
      const g = grouped.get(key) || {
        key,
        normalizedName: r.nName,
        city: r.city || "Sin ciudad",
        rows: [],
      };
      g.rows.push({
        id: r.id,
        name: r.name,
        address: r.address,
        city: r.city,
        surveyor: r.surveyor,
        facadePhotoUrl: r.facadePhotoUrl,
      });
      grouped.set(key, g);
    });

    return Array.from(grouped.values())
      .filter((g) => g.rows.length > 1)
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [establishments]);

  const similarNamePairs = useMemo(() => {
    const rows = establishments.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      address: r.address,
      surveyor: r.listaNombre || "Sin encuestador",
      facadePhotoUrl: r.facadePhotoUrl,
      nName: normalizeName(r.name),
      nCity: normalizeName(r.city),
    }));
    const pairs: Array<{
      key: string;
      score: number;
      a: typeof rows[number];
      b: typeof rows[number];
    }> = [];
    const byCity = new Map<string, typeof rows>();
    rows.forEach((r) => {
      const bucket = byCity.get(r.nCity) || [];
      bucket.push(r);
      byCity.set(r.nCity, bucket);
    });
    byCity.forEach((group) => {
      const max = Math.min(group.length, 140);
      for (let i = 0; i < max; i += 1) {
        for (let j = i + 1; j < max; j += 1) {
          const a = group[i];
          const b = group[j];
          if (!a.nName || !b.nName || a.nName === b.nName) continue;
          const score = diceSimilarity(a.nName, b.nName);
          if (score < 0.85) continue;
          pairs.push({ key: `${a.id}:${b.id}`, score, a, b });
        }
      }
    });
    return pairs.sort((x, y) => y.score - x.score).slice(0, 20);
  }, [establishments]);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const daySheet = XLSX.utils.json_to_sheet(dayMetrics.map((m) => ({
      Fecha: m.day,
      Total: m.total,
      Telefono_Completado: m.phoneDone,
      Telefono_Vacio: m.phoneEmpty,
      Localizacion_Completado: m.locationDone,
      Localizacion_Vacio: m.locationEmpty,
      Contenido_Completado: m.contentDone,
      Contenido_Vacio: m.contentEmpty,
    })));
    XLSX.utils.book_append_sheet(wb, daySheet, "Metricas_Dia");

    const surveyorSheet = XLSX.utils.json_to_sheet(surveyorMetrics.map((m) => ({
      Encuestador: m.surveyor,
      Registros: m.total,
      Telefono_Completado: m.phoneDone,
      Localizacion_Completado: m.locationDone,
      Contenido_Completado: m.contentDone,
      Pendiente_Algun_Estado: m.pendingAny,
    })));
    XLSX.utils.book_append_sheet(wb, surveyorSheet, "Encuestadores");

    const surveyorDaySheet = XLSX.utils.json_to_sheet(
      surveyorMetrics.flatMap((m) =>
        m.byDay.map((d) => ({
          Encuestador: m.surveyor,
          Fecha: d.day,
          Registros: d.total,
          Telefono_Completado: d.phoneDone,
          Localizacion_Completado: d.locationDone,
          Contenido_Completado: d.contentDone,
        }))
      )
    );
    XLSX.utils.book_append_sheet(wb, surveyorDaySheet, "Encuestador_Por_Dia");

    const duplicatesSheet = XLSX.utils.json_to_sheet(
      duplicateGroups.flatMap((g) =>
        g.rows.map((r) => ({
          Tipo: "Nombre igual normalizado",
          Grupo: g.normalizedName,
          Nombre: r.name,
          Ciudad: r.city,
          Direccion: r.address,
          Encuestador: r.surveyor,
          Foto_Fachada_URL: r.facadePhotoUrl,
        }))
      )
    );
    XLSX.utils.book_append_sheet(wb, duplicatesSheet, "Posibles_Duplicados");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `reporte_encuestadores_${stamp}.xlsx`);
  };

  const total = establishments.length;
  const phoneEmptyTotal = establishments.filter((r) => !statusFilled(r.phoneStatus)).length;
  const locationEmptyTotal = establishments.filter((r) => !statusFilled(r.localizedStatus)).length;
  const contentEmptyTotal = establishments.filter((r) => !statusFilled(r.contentStatus)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento diario, encuestadores, estados vacíos y posibles duplicados.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total registros</p>
          <p className="text-2xl font-semibold">{total}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vacíos telefónico</p>
          <p className="text-2xl font-semibold text-amber-600">{phoneEmptyTotal}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vacíos localización</p>
          <p className="text-2xl font-semibold text-amber-600">{locationEmptyTotal}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vacíos contenido</p>
          <p className="text-2xl font-semibold text-amber-600">{contentEmptyTotal}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void exportExcel()} className="gap-2">
          <Download className="w-4 h-4" />
          Descargar reporte Excel
        </Button>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <p className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Métricas por día</p>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Fecha</th>
                <th className="py-2 pr-2">Total</th>
                <th className="py-2 pr-2">Tel completado</th>
                <th className="py-2 pr-2">Tel vacío</th>
                <th className="py-2 pr-2">Loc completado</th>
                <th className="py-2 pr-2">Loc vacío</th>
                <th className="py-2 pr-2">Cont completado</th>
                <th className="py-2 pr-2">Cont vacío</th>
              </tr>
            </thead>
            <tbody>
              {dayMetrics.map((m) => (
                <tr key={m.day} className="border-b last:border-0">
                  <td className="py-2 pr-2">{m.day}</td>
                  <td className="py-2 pr-2">{m.total}</td>
                  <td className="py-2 pr-2">{m.phoneDone}</td>
                  <td className="py-2 pr-2">{m.phoneEmpty}</td>
                  <td className="py-2 pr-2">{m.locationDone}</td>
                  <td className="py-2 pr-2">{m.locationEmpty}</td>
                  <td className="py-2 pr-2">{m.contentDone}</td>
                  <td className="py-2 pr-2">{m.contentEmpty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <p className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Seguimiento por encuestador</p>
        <p className="text-xs text-muted-foreground mt-1">Haz clic en cada encuestador para ver cuántos registros hizo por día.</p>
        <div className="mt-3 space-y-2">
          {surveyorMetrics.map((m) => (
            <details key={m.surveyor} className="rounded-lg border bg-background group">
              <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-3">
                <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.surveyor}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.total} registros · Pendientes: {m.pendingAny}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs">
                  <span>Tel {m.phoneDone}/{m.total}</span>
                  <span>Loc {m.locationDone}/{m.total}</span>
                  <span>Cont {m.contentDone}/{m.total}</span>
                </div>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className="grid md:grid-cols-3 gap-2">
                  <div className="rounded-md border p-2">
                    <p className="text-[11px] text-muted-foreground">Teléfono completado</p>
                    <p className="text-sm font-semibold">{pct(m.phoneDone, m.total)}%</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-[11px] text-muted-foreground">Localización completado</p>
                    <p className="text-sm font-semibold">{pct(m.locationDone, m.total)}%</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-[11px] text-muted-foreground">Contenido completado</p>
                    <p className="text-sm font-semibold">{pct(m.contentDone, m.total)}%</p>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="px-2 py-1.5 text-xs font-medium bg-muted/40 flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Producción por día
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left border-b bg-muted/20">
                          <th className="py-1.5 px-2">Fecha</th>
                          <th className="py-1.5 px-2">Registros</th>
                          <th className="py-1.5 px-2">Tel</th>
                          <th className="py-1.5 px-2">Loc</th>
                          <th className="py-1.5 px-2">Cont</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.byDay.map((d) => (
                          <tr key={`${m.surveyor}-${d.day}`} className="border-b last:border-0">
                            <td className="py-1.5 px-2">{d.day}</td>
                            <td className="py-1.5 px-2">{d.total}</td>
                            <td className="py-1.5 px-2">{d.phoneDone}</td>
                            <td className="py-1.5 px-2">{d.locationDone}</td>
                            <td className="py-1.5 px-2">{d.contentDone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Panaderías agrupadas por posible duplicado</p>
        <p className="text-xs text-muted-foreground mt-1">
          Agrupado por nombre normalizado en la misma ciudad para revisión rápida con foto.
        </p>
        <div className="mt-3 space-y-3">
          {duplicateGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se detectaron posibles duplicados.</p>
          ) : (
            duplicateGroups.map((g) => (
              <details key={g.key} className="rounded-lg border bg-background group">
                <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-3">
                  <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{show(g.rows[0]?.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {show(g.city)} · {g.rows.length} registros en el grupo
                    </p>
                  </div>
                </summary>
                <div className="px-3 pb-3 grid md:grid-cols-2 gap-3">
                  {g.rows.map((r) => {
                    return (
                      <div key={r.id} className="rounded-md border p-2">
                        <p className="text-sm font-medium">{show(r.name)}</p>
                        <p className="text-xs text-muted-foreground">{show(r.city)} · {show(r.address)}</p>
                        <p className="text-xs text-muted-foreground">Encuestador: {show(r.surveyor)}</p>
                        <DuplicatePhoto rawUrl={r.facadePhotoUrl} alt={`Fachada ${r.name}`} />
                      </div>
                    );
                  })}
                </div>
              </details>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Nombres similares para revisión</p>
        <p className="text-xs text-muted-foreground mt-1">
          Coincidencias por similitud alta (misma ciudad), para detectar variaciones de escritura.
        </p>
        <div className="mt-3 space-y-2">
          {similarNamePairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron coincidencias similares.</p>
          ) : (
            similarNamePairs.map((p) => (
              <div key={p.key} className="rounded-md border p-2 text-sm">
                <p className="font-medium">
                  {show(p.a.name)} ↔ {show(p.b.name)} <span className="text-xs text-muted-foreground">({Math.round(p.score * 100)}%)</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {show(p.a.city)} · {show(p.a.address)} / {show(p.b.address)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

