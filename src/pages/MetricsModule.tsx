import { useMemo } from "react";
import { useData } from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, BarChart3, Users } from "lucide-react";

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
};

type DuplicateGroup = {
  key: string;
  kind: "igual" | "similar";
  score?: number;
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
    const map = new Map<string, SurveyorMetric>();
    establishments.forEach((r) => {
      const surveyor = (r.listaNombre || r.contactName || r.localizedBy || "Sin encuestador").trim() || "Sin encuestador";
      const current = map.get(surveyor) || {
        surveyor,
        total: 0,
        phoneDone: 0,
        locationDone: 0,
        contentDone: 0,
        pendingAny: 0,
      };
      current.total += 1;
      const phoneDone = statusFilled(r.phoneStatus);
      const locationDone = statusFilled(r.localizedStatus);
      const contentDone = statusFilled(r.contentStatus);
      if (phoneDone) current.phoneDone += 1;
      if (locationDone) current.locationDone += 1;
      if (contentDone) current.contentDone += 1;
      if (!phoneDone || !locationDone || !contentDone) current.pendingAny += 1;
      map.set(surveyor, current);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [establishments]);

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const exact = new Map<string, DuplicateGroup>();
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
      const g = exact.get(key) || { key, kind: "igual", rows: [] };
      g.rows.push({
        id: r.id, name: r.name, address: r.address, city: r.city, surveyor: r.surveyor, facadePhotoUrl: r.facadePhotoUrl,
      });
      exact.set(key, g);
    });

    const exactGroups = Array.from(exact.values()).filter((g) => g.rows.length > 1);

    const similarGroups: DuplicateGroup[] = [];
    const byCity = new Map<string, typeof normalizedRows>();
    normalizedRows.forEach((r) => {
      const bucket = byCity.get(r.nCity) || [];
      bucket.push(r);
      byCity.set(r.nCity, bucket);
    });

    byCity.forEach((rows, cityKey) => {
      const max = Math.min(rows.length, 160);
      for (let i = 0; i < max; i += 1) {
        for (let j = i + 1; j < max; j += 1) {
          const a = rows[i];
          const b = rows[j];
          if (!a.nName || !b.nName || a.nName === b.nName) continue;
          const score = diceSimilarity(a.nName, b.nName);
          if (score < 0.82) continue;
          similarGroups.push({
            key: `${cityKey}:${a.id}:${b.id}`,
            kind: "similar",
            score,
            rows: [
              { id: a.id, name: a.name, address: a.address, city: a.city, surveyor: a.surveyor, facadePhotoUrl: a.facadePhotoUrl },
              { id: b.id, name: b.name, address: b.address, city: b.city, surveyor: b.surveyor, facadePhotoUrl: b.facadePhotoUrl },
            ],
          });
          if (similarGroups.length >= 40) return;
        }
      }
    });

    return [...exactGroups, ...similarGroups];
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

    const duplicatesSheet = XLSX.utils.json_to_sheet(
      duplicateGroups.flatMap((g) =>
        g.rows.map((r) => ({
          Tipo: g.kind === "igual" ? "Nombre igual normalizado" : "Nombre similar",
          Similitud: g.score ? Number((g.score * 100).toFixed(1)) : "",
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
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Encuestador</th>
                <th className="py-2 pr-2">Registros</th>
                <th className="py-2 pr-2">Tel</th>
                <th className="py-2 pr-2">Loc</th>
                <th className="py-2 pr-2">Cont</th>
                <th className="py-2 pr-2">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {surveyorMetrics.map((m) => (
                <tr key={m.surveyor} className="border-b last:border-0">
                  <td className="py-2 pr-2">{m.surveyor}</td>
                  <td className="py-2 pr-2">{m.total}</td>
                  <td className="py-2 pr-2">{m.phoneDone}</td>
                  <td className="py-2 pr-2">{m.locationDone}</td>
                  <td className="py-2 pr-2">{m.contentDone}</td>
                  <td className="py-2 pr-2">{m.pendingAny}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Posibles duplicados</p>
        <p className="text-xs text-muted-foreground mt-1">
          Basado en nombre normalizado y similitud de texto en la misma ciudad.
        </p>
        <div className="mt-3 space-y-3">
          {duplicateGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se detectaron posibles duplicados.</p>
          ) : (
            duplicateGroups.map((g) => (
              <div key={g.key} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  {g.kind === "igual" ? "Nombre igual normalizado" : `Nombre similar (${Math.round((g.score || 0) * 100)}%)`}
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  {g.rows.map((r) => {
                    const photo = getPhotoCandidates(r.facadePhotoUrl)[0];
                    return (
                      <div key={r.id} className="rounded-md border p-2">
                        <p className="text-sm font-medium">{show(r.name)}</p>
                        <p className="text-xs text-muted-foreground">{show(r.city)} · {show(r.address)}</p>
                        <p className="text-xs text-muted-foreground">Encuestador: {show(r.surveyor)}</p>
                        {photo ? (
                          <img
                            src={photo}
                            alt={`Fachada ${r.name}`}
                            className="w-full h-32 object-contain rounded border mt-2 bg-muted/20"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">Sin foto de fachada.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

