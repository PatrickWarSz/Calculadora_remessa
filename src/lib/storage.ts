import { supabase } from "./supabase";
import type {
  Empresa,
  Fechamento,
  MapeamentoGrupo,
  MEI,
  NotaRevenda,
  Produto,
  ProdutoRevenda,
  Quantidades,
} from "./types";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ROW_ID = 1;

/** @deprecated Mantido apenas para não quebrar imports existentes. */
export const MES_KEY = "remessa.mes";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AppData = {
  produtos: Produto[];
  empresas: Empresa[];
  meis: MEI[];
  quantidades: Quantidades;
  meiPorEmpresa: Record<string, string>;
  precoTecidoKg: number;
  nomeTecido: string;
  produtosRevenda: ProdutoRevenda[];
  /** fechamentos[mes] */
  fechamentos: Record<string, Fechamento>;
  /** mapeamento canônico Grupo -> produtoId (próprio ou revenda) */
  mapeamentoGrupo: MapeamentoGrupo;
  /** notas de balcão de revenda */
  notasRevenda: NotaRevenda[];
};

// ─── Defaults ────────────────────────────────────────────────────────────────

const TAMS = ["P", "M", "G", "GG"];

let _seq = 0;
const uid = () => {
  if (typeof window !== "undefined") return Math.random().toString(36).slice(2, 10);
  _seq += 1;
  return `s_${_seq.toString(36)}`;
};

export const defaults = (): AppData => {
  const e1 = "e_cr", e2 = "e_rz", e3 = "e_co", e4 = "e_rc";
  const m1 = "m_iani", m2 = "m_rafa";
  const produtos: Produto[] = [
    { id: "p_leg", nome: "Leggings",    rendimento: 20, valor: 0.5,  grupoCanonico: "LEGGING"    },
    { id: "p_sho", nome: "Shorts",      rendimento: 30, valor: 0.25, grupoCanonico: "SHORT"      },
    { id: "p_top", nome: "Tops",        rendimento: 60, valor: 0.1,  grupoCanonico: "TOP"        },
    { id: "p_mqi", nome: "Macaquinhos", rendimento: 15, valor: 0.7,  grupoCanonico: "MACAQUINHO" },
    { id: "p_mca", nome: "Macacões",    rendimento: 10, valor: 0.9,  grupoCanonico: "MACACAO"    },
    { id: "p_cal", nome: "Calcinhas",   rendimento: 80, valor: 0.08, grupoCanonico: "CALCINHA"   },
    { id: "p_biq", nome: "Biquinis",    rendimento: 40, valor: 0.4,  grupoCanonico: "BIQUINI"    },
  ];
  const produtosRevenda: ProdutoRevenda[] = [
    { id: "pr_samba", nome: "Samba canção",   tamanhos: [...TAMS], grupoCanonico: "SAMBA CANCAO"  },
    { id: "pr_term",  nome: "Camisa térmica", tamanhos: [...TAMS], grupoCanonico: "CAMISA TERMICA" },
  ];
  const mapeamentoGrupo: MapeamentoGrupo = {};
  for (const p of produtos)         if (p.grupoCanonico) mapeamentoGrupo[p.grupoCanonico] = p.id;
  for (const p of produtosRevenda)  if (p.grupoCanonico) mapeamentoGrupo[p.grupoCanonico] = p.id;

  return {
    produtos,
    empresas: [
      { id: e1, nome: "CR Fitness",      apelidos: ["cr"]      },
      { id: e2, nome: "Rezende Fitness", apelidos: ["rezende"] },
      { id: e3, nome: "Costa Fitness",   apelidos: ["costa"]   },
      { id: e4, nome: "RC Fitness",      apelidos: ["rc"]      },
    ],
    meis: [
      { id: m1, nome: "Iani",   limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
      { id: m2, nome: "Rafael", limiteMensal: 6750, jaUsadoMes: 0, ativo: true },
    ],
    quantidades:    {},
    meiPorEmpresa:  { [e1]: m1, [e2]: m2, [e3]: "", [e4]: "" },
    precoTecidoKg:  0,
    nomeTecido:     "Suplex",
    produtosRevenda,
    fechamentos:    {},
    mapeamentoGrupo,
    notasRevenda:   [],
  };
};

// ─── Supabase I/O ─────────────────────────────────────────────────────────────

/**
 * Carrega o estado completo do Supabase.
 * Retorna defaults se ainda não há dados salvos.
 */
export const loadData = async (): Promise<{ appData: AppData; mesSalvo: string }> => {
  try {
    const { data, error } = await supabase
      .from("remessa_state")
      .select("app_data, mes_ativo")
      .eq("id", ROW_ID)
      .single();

    if (error || !data) {
      return { appData: defaults(), mesSalvo: "" };
    }

    const parsed = data.app_data as Partial<AppData>;
    const base   = defaults();

    // Linha vazia (primeiro uso): retorna defaults limpos
    if (!parsed || Object.keys(parsed).length === 0) {
      return { appData: base, mesSalvo: data.mes_ativo ?? "" };
    }

    return {
      appData: {
        produtos:      parsed.produtos  ?? base.produtos,
        empresas:      parsed.empresas  ?? base.empresas,
        meis:          parsed.meis      ?? base.meis,
        quantidades:   parsed.quantidades   ?? {},
        meiPorEmpresa: parsed.meiPorEmpresa ?? {},
        precoTecidoKg: parsed.precoTecidoKg ?? 0,
        nomeTecido:    parsed.nomeTecido    ?? "Suplex",
        produtosRevenda: (parsed.produtosRevenda ?? base.produtosRevenda).map((p) => ({
          ...p,
          tamanhos: p.tamanhos?.length ? p.tamanhos : [...TAMS],
        })),
        fechamentos:     parsed.fechamentos    ?? {},
        mapeamentoGrupo: { ...base.mapeamentoGrupo, ...(parsed.mapeamentoGrupo ?? {}) },
        notasRevenda:    parsed.notasRevenda   ?? [],
      },
      mesSalvo: data.mes_ativo ?? "",
    };
  } catch (err) {
    console.error("[remessa] Falha ao carregar dados:", err);
    return { appData: defaults(), mesSalvo: "" };
  }
};

/**
 * Persiste o estado completo + mês ativo no Supabase.
 * Fire-and-forget: erros são logados mas não propagados.
 */
export const saveData = async (data: AppData, mes: string): Promise<void> => {
  try {
    const { error } = await supabase.from("remessa_state").upsert({
      id:         ROW_ID,
      app_data:   data,
      mes_ativo:  mes,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("[remessa] Falha ao salvar:", error.message);
  } catch (err) {
    console.error("[remessa] Erro inesperado ao salvar:", err);
  }
};

// ─── Helpers (inalterados) ────────────────────────────────────────────────────

export const newId = uid;

export const mesAnterior = (mes: string): string => {
  const m = /^(\d{2})\/(\d{4})$/.exec(mes);
  if (!m) return "";
  let mm = parseInt(m[1], 10);
  let yy = parseInt(m[2], 10);
  mm -= 1;
  if (mm <= 0) { mm = 12; yy -= 1; }
  return `${String(mm).padStart(2, "0")}/${yy}`;
};