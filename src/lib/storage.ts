import type {
  Empresa,
  HistoricoRevendaMes,
  MEI,
  PedidosRevendaMes,
  Produto,
  ProdutoRevenda,
  Quantidades,
} from "./types";

const KEY = "remessa.v2";
const LEGACY_KEY = "remessa.v1";
export const MES_KEY = "remessa.mes";

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
  /** pedidos de revenda já pegos na fábrica, por mês e por tamanho */
  pedidosRevenda: Record<string, PedidosRevendaMes>;
};

// IDs estáveis para SSR/client (evitam mismatch de hidratação)
let _seq = 0;
const uid = () => {
  if (typeof window !== "undefined") {
    return Math.random().toString(36).slice(2, 10);
  }
  _seq += 1;
  return `s_${_seq.toString(36)}`;
};

const TAMS = ["P", "M", "G", "GG"];

const defaults = (): AppData => {
  const e1 = "e_cr", e2 = "e_rz", e3 = "e_co";
  const m1 = "m_iani", m2 = "m_rafa";
  return {
    produtos: [
      { id: "p_leg", nome: "Leggings", rendimento: 20, valor: 0.5 },
      { id: "p_sho", nome: "Shorts", rendimento: 30, valor: 0.25 },
      { id: "p_top", nome: "Tops", rendimento: 60, valor: 0.1 },
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
      { id: "pr_samba", nome: "Samba canção", tamanhos: [...TAMS] },
      { id: "pr_term", nome: "Camisa térmica", tamanhos: [...TAMS] },
    ],
    historicoRevenda: [],
    pedidosRevenda: {},
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
      produtosRevenda: (parsed.produtosRevenda ?? base.produtosRevenda).map(
        (p) => ({ ...p, tamanhos: p.tamanhos?.length ? p.tamanhos : [...TAMS] }),
      ),
      historicoRevenda: parsed.historicoRevenda ?? [],
      pedidosRevenda: parsed.pedidosRevenda ?? {},
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

/** Retorna o mês anterior a "MM/AAAA". */
export const mesAnterior = (mes: string): string => {
  const m = /^(\d{2})\/(\d{4})$/.exec(mes);
  if (!m) return "";
  let mm = parseInt(m[1], 10);
  let yy = parseInt(m[2], 10);
  mm -= 1;
  if (mm <= 0) {
    mm = 12;
    yy -= 1;
  }
  return `${String(mm).padStart(2, "0")}/${yy}`;
};
