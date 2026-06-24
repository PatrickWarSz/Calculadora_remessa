import type {
  Empresa,
  HistoricoRevendaMes,
  MEI,
  Produto,
  ProdutoRevenda,
  Quantidades,
} from "./types";

const KEY = "remessa.v2";
const LEGACY_KEY = "remessa.v1";

export type AppData = {
  produtos: Produto[];
  empresas: Empresa[];
  meis: MEI[];
  quantidades: Quantidades;
  /** mapeamento manual empresaId -> meiId ("" = não atribuído) */
  meiPorEmpresa: Record<string, string>;
  /** preço por kg do tecido (insumo único, genérico) */
  precoTecidoKg: number;
  /** nome do tecido só para exibir nas mensagens / PDF */
  nomeTecido: string;
  /** produtos comprados de terceiros (revenda) */
  produtosRevenda: ProdutoRevenda[];
  /** histórico mensal de vendas de produtos de revenda por empresa */
  historicoRevenda: HistoricoRevendaMes[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const defaults = (): AppData => {
  const e1 = uid(), e2 = uid(), e3 = uid();
  const m1 = uid(), m2 = uid();
  return {
    produtos: [
      { id: uid(), nome: "Leggings", rendimento: 20, valor: 0.5 },
      { id: uid(), nome: "Shorts", rendimento: 30, valor: 0.25 },
      { id: uid(), nome: "Tops", rendimento: 60, valor: 0.1 },
    ],
    empresas: [
      { id: e1, nome: "CR Fitness" },
      { id: e2, nome: "Rezende Fitness" },
      { id: e3, nome: "Costa Fitness" },
    ],
    meis: [
      { id: m1, nome: "Iani", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
      { id: m2, nome: "Rafael", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
    ],
    quantidades: {},
    meiPorEmpresa: { [e1]: m1, [e2]: m2, [e3]: "" },
    precoTecidoKg: 0,
    nomeTecido: "Suplex",
    produtosRevenda: [
      { id: uid(), nome: "Samba canção" },
      { id: uid(), nome: "Camisa térmica" },
    ],
    historicoRevenda: [],
  };
};

export const loadData = (): AppData => {
  if (typeof window === "undefined") return defaults();
  try {
    const raw =
      window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const base = defaults();
    return {
      produtos: parsed.produtos ?? base.produtos,
      empresas: parsed.empresas ?? base.empresas,
      meis: parsed.meis ?? base.meis,
      quantidades: parsed.quantidades ?? {},
      meiPorEmpresa: parsed.meiPorEmpresa ?? {},
      precoTecidoKg: parsed.precoTecidoKg ?? 0,
      nomeTecido: parsed.nomeTecido ?? "Suplex",
      produtosRevenda: parsed.produtosRevenda ?? base.produtosRevenda,
      historicoRevenda: parsed.historicoRevenda ?? [],
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
