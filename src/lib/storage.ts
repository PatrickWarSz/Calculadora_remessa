import type { Empresa, MEI, Produto, Quantidades } from "./types";

const KEY = "remessa.v1";

export type AppData = {
  produtos: Produto[];
  empresas: Empresa[];
  meis: MEI[];
  quantidades: Quantidades;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const defaults = (): AppData => ({
  produtos: [
    { id: uid(), nome: "Leggings", rendimento: 20, valor: 0.5 },
    { id: uid(), nome: "Shorts", rendimento: 30, valor: 0.25 },
    { id: uid(), nome: "Tops", rendimento: 60, valor: 0.1 },
  ],
  empresas: [
    { id: uid(), nome: "CR Fitness" },
    { id: uid(), nome: "Rezende Fitness" },
    { id: uid(), nome: "Costa Fitness" },
  ],
  meis: [
    { id: uid(), nome: "Iani", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
    { id: uid(), nome: "Rafael", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
    { id: uid(), nome: "Helem", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
  ],
  quantidades: {},
});

export const loadData = (): AppData => {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const base = defaults();
    return {
      produtos: parsed.produtos ?? base.produtos,
      empresas: parsed.empresas ?? base.empresas,
      meis: parsed.meis ?? base.meis,
      quantidades: parsed.quantidades ?? {},
    };
  } catch {
    return defaults();
  }
};

export const saveData = (data: AppData) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(data));
};

export const newId = uid;
