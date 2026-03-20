import { createContext, useContext, useState, ReactNode } from "react";
import { Establishment } from "@/types/establishment";

const SAMPLE_DATA: Establishment[] = [
  {
    id: "1",
    name: "Farmacia Central",
    address: "Av. Libertador 1240, Caracas",
    latitude: 10.4880,
    longitude: -66.8792,
    phone: "+584121234567",
    contactName: "María González",
    notes: "Horario extendido hasta las 10pm",
  },
  {
    id: "2",
    name: "Bodega Don Pedro",
    address: "Calle 5, San Cristóbal",
    latitude: 7.7669,
    longitude: -72.2250,
    phone: "+584149876543",
    contactName: "Pedro Ramírez",
    notes: "Solo atiende de lunes a viernes",
  },
  {
    id: "3",
    name: "Taller Mecánico Rápido",
    address: "Zona Industrial, Valencia",
    latitude: 10.1579,
    longitude: -67.9972,
    phone: "+584161112233",
    contactName: "Carlos Mendoza",
    notes: "Especialista en frenos y suspensión",
  },
  {
    id: "4",
    name: "Panadería La Espiga",
    address: "Av. Bolívar Norte 89, Maracay",
    latitude: 10.2469,
    longitude: -67.5958,
    phone: "+584244445566",
    contactName: "Ana Morales",
    notes: "",
  },
];

interface DataContextType {
  establishments: Establishment[];
  addEstablishment: (e: Omit<Establishment, "id">) => void;
  updateEstablishment: (e: Establishment) => void;
  deleteEstablishment: (id: string) => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [establishments, setEstablishments] = useState<Establishment[]>(SAMPLE_DATA);

  const addEstablishment = (e: Omit<Establishment, "id">) => {
    setEstablishments((prev) => [...prev, { ...e, id: crypto.randomUUID() }]);
  };

  const updateEstablishment = (e: Establishment) => {
    setEstablishments((prev) => prev.map((item) => (item.id === e.id ? e : item)));
  };

  const deleteEstablishment = (id: string) => {
    setEstablishments((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <DataContext.Provider value={{ establishments, addEstablishment, updateEstablishment, deleteEstablishment }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}
