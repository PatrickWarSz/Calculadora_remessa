import * as XLSX from "xlsx";
import type { Empresa, Fechamento, MapeamentoGrupo, VendaItem } from "./types";

export type LinhaPlanilha = {
  codigo: string;
  descricao: string;
  qtd: number;
  marca: string;
  grupo: string; // já normalizado (UPPER, sem acento)
};

export type ResultadoImport = {
  empresaId: string;
  empresaNome: string;
  linhas: LinhaPlanilha[];
  /** vendas[produtoId] agregado */
  vendasPorProduto: Record<string, VendaItem>;
  /** linhas que não casaram com nenhum produto cadastrado */
  pendentes: { grupo: string; descricao: string; qtd: number }[];
  /** todos os grupos encontrados (para diagnóstico) */
  gruposEncontrados: string[];
};

const norm = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** Detecta tamanho ao final da descrição. Tenta padrões mais longos primeiro. */
const TAM_RE =
  /\s(P\/M|G\/GG|XGG|XXG|XGGG?|GGG|PP|GG|XG|P|M|G)$/i;

export function detectarTamanho(descricao: string): string | null {
  const m = TAM_RE.exec(descricao.trim());
  if (!m) return null;
  return m[1].toUpperCase();
}

/** Tenta identificar empresa pelo nome do arquivo + apelidos. */
export function detectarEmpresa(
  filename: string,
  empresas: Empresa[],
): Empresa | null {
  const n = norm(filename.replace(/\.[^.]+$/, "").replace(/[_\-]/g, " "));
  // testa apelidos e nomes
  const candidatos: { e: Empresa; score: number }[] = [];
  for (const e of empresas) {
    const tokens: string[] = [];
    const nm = norm(e.nome);
    nm.split(/\s+/).forEach((t) => tokens.push(t));
    (e.apelidos ?? []).forEach((a) => tokens.push(norm(a)));
    let score = 0;
    for (const t of tokens) if (t && n.includes(t)) score += t.length;
    if (score > 0) candidatos.push({ e, score });
  }
  candidatos.sort((a, b) => b.score - a.score);
  return candidatos[0]?.e ?? null;
}

async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

/** Lê um .xls/.xlsx de vendas no formato (Código, Descrição, Quant., Marca, Grupo). */
export async function lerPlanilhaVendas(file: File): Promise<LinhaPlanilha[]> {
  const wb = await readWorkbook(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true,
    defval: "",
  });
  const findKey = (obj: Record<string, unknown>, alvo: string): string | null => {
    const a = norm(alvo);
    for (const k of Object.keys(obj)) {
      const n = norm(k).replace(/\./g, "");
      if (n === a) return k;
    }
    return null;
  };
  if (rows.length === 0) return [];
  const sample = rows[0];
  const kCod = findKey(sample, "CODIGO");
  const kDes = findKey(sample, "DESCRICAO");
  const kQtd = findKey(sample, "QUANT") || findKey(sample, "QUANTIDADE") || findKey(sample, "QTD");
  const kMar = findKey(sample, "MARCA");
  const kGru = findKey(sample, "GRUPO");

  return rows
    .map((r) => ({
      codigo: String(r[kCod ?? ""] ?? ""),
      descricao: String(r[kDes ?? ""] ?? ""),
      qtd: Number(r[kQtd ?? ""] ?? 0) || 0,
      marca: String(r[kMar ?? ""] ?? ""),
      grupo: norm(r[kGru ?? ""]),
    }))
    .filter((l) => l.grupo && l.qtd > 0);
}

/** Agrega linhas em vendas por produto, usando o mapeamento Grupo→Produto. */
export function agregarVendas(
  linhas: LinhaPlanilha[],
  mapa: MapeamentoGrupo,
): {
  vendasPorProduto: Record<string, VendaItem>;
  pendentes: { grupo: string; descricao: string; qtd: number }[];
  gruposEncontrados: string[];
} {
  const out: Record<string, VendaItem> = {};
  const pendentes: { grupo: string; descricao: string; qtd: number }[] = [];
  const grupos = new Set<string>();
  for (const l of linhas) {
    grupos.add(l.grupo);
    const produtoId = mapa[l.grupo];
    if (!produtoId) {
      pendentes.push({ grupo: l.grupo, descricao: l.descricao, qtd: l.qtd });
      continue;
    }
    if (!out[produtoId]) out[produtoId] = { total: 0, porTamanho: {} };
    out[produtoId].total += l.qtd;
    const tam = detectarTamanho(l.descricao);
    if (tam) out[produtoId].porTamanho[tam] = (out[produtoId].porTamanho[tam] ?? 0) + l.qtd;
    else out[produtoId].porTamanho["—"] = (out[produtoId].porTamanho["—"] ?? 0) + l.qtd;
  }
  return { vendasPorProduto: out, pendentes, gruposEncontrados: Array.from(grupos).sort() };
}

/** Aplica o resultado do import ao Fechamento do mês. */
export function aplicarImportFechamento(
  fechamento: Fechamento | undefined,
  mes: string,
  empresaId: string,
  result: { vendasPorProduto: Record<string, VendaItem>; pendentes: { grupo: string; descricao: string; qtd: number }[] },
): Fechamento {
  const base: Fechamento = fechamento ?? {
    mes,
    vendas: {},
    importadoEm: {},
    pendentes: {},
  };
  return {
    ...base,
    mes,
    vendas: { ...base.vendas, [empresaId]: result.vendasPorProduto },
    importadoEm: { ...base.importadoEm, [empresaId]: Date.now() },
    pendentes: { ...base.pendentes, [empresaId]: result.pendentes },
  };
}
