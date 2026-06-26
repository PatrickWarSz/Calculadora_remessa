import type {
  AlocacaoMEI,
  Empresa,
  Fechamento,
  ItemCalculo,
  MEI,
  Produto,
  Quantidades,
  ResumoEmpresa,
} from "./types";

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtKg = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmtInt = (n: number) => n.toLocaleString("pt-BR");

export const fmtPct = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export const parseQtd = (s: string | undefined): number => {
  if (!s) return 0;
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export function calcEmpresa(empresa: Empresa, produtos: Produto[], quantidades: Quantidades): ResumoEmpresa {
  const itens: ItemCalculo[] = produtos.map((p) => {
    const qtd = parseQtd(quantidades[empresa.id]?.[p.id]);
    return {
      produtoId: p.id,
      qtd,
      kg: p.rendimento > 0 ? qtd / p.rendimento : 0,
      valor: qtd * p.valor,
    };
  });
  return {
    empresaId: empresa.id,
    itens,
    totalKg: itens.reduce((a, i) => a + i.kg, 0),
    totalValor: itens.reduce((a, i) => a + i.valor, 0),
  };
}

export function calcTotaisProduto(produtos: Produto[], resumos: ResumoEmpresa[]) {
  return produtos.map((p) => {
    let qtd = 0;
    for (const r of resumos) {
      const it = r.itens.find((i) => i.produtoId === p.id);
      if (it) qtd += it.qtd;
    }
    return {
      produto: p,
      qtd,
      kg: p.rendimento > 0 ? qtd / p.rendimento : 0,
      valor: qtd * p.valor,
    };
  });
}

export function distribuirMEIsManual(
  empresas: Empresa[],
  resumos: ResumoEmpresa[],
  meiPorEmpresa: Record<string, string>,
  meis: MEI[],
): { alocacoes: AlocacaoMEI[]; naoAtribuido: { valor: number; empresaIds: string[] } } {
  const map = new Map<string, AlocacaoMEI>();
  for (const m of meis) {
    if (!m.ativo) continue;
    map.set(m.id, {
      meiId: m.id,
      valor: 0,
      limite: m.limiteMensal,
      jaUsadoMes: m.jaUsadoMes,
      disponivel: Math.max(0, m.limiteMensal - m.jaUsadoMes),
      estouro: 0,
      empresaIds: [],
    });
  }
  const naoAtribuido = { valor: 0, empresaIds: [] as string[] };
  empresas.forEach((e, idx) => {
    const r = resumos[idx];
    if (!r || r.totalValor <= 0.0001) return;
    const aloc = meiPorEmpresa[e.id] ? map.get(meiPorEmpresa[e.id]) : undefined;
    if (!aloc) {
      naoAtribuido.valor += r.totalValor;
      naoAtribuido.empresaIds.push(e.id);
      return;
    }
    aloc.valor += r.totalValor;
    aloc.empresaIds.push(e.id);
  });
  for (const a of map.values()) {
    a.estouro = Math.max(0, a.jaUsadoMes + a.valor - a.limite);
  }
  return { alocacoes: Array.from(map.values()), naoAtribuido };
}

/* ---------- Revenda baseada em Fechamento ---------- */

/** Proporção por empresa para um produto, usando vendas do fechamento informado. */
export function proporcaoRevendaFechamento(
  fechamento: Fechamento | undefined,
  produtoId: string,
  empresas: Empresa[],
): { empresaId: string; qtd: number; pct: number }[] {
  const vendas = empresas.map((e) => ({
    empresaId: e.id,
    qtd: fechamento?.vendas?.[e.id]?.[produtoId]?.total ?? 0,
    pct: 0,
  }));
  const total = vendas.reduce((s, v) => s + v.qtd, 0);
  if (total > 0) for (const v of vendas) v.pct = v.qtd / total;
  return vendas;
}

/** Largest-remainder: distribui inteiro entre empresas mantendo soma = totalQtd. */
export function distribuirRevenda(
  totalQtd: number,
  proporcao: { empresaId: string; pct: number }[],
): { empresaId: string; qtd: number }[] {
  if (totalQtd <= 0 || proporcao.length === 0 || proporcao.every((p) => p.pct === 0))
    return proporcao.map((p) => ({ empresaId: p.empresaId, qtd: 0 }));
  const base = proporcao.map((p) => {
    const exato = p.pct * totalQtd;
    return { empresaId: p.empresaId, qtd: Math.floor(exato), resto: exato - Math.floor(exato) };
  });
  let sobra = totalQtd - base.reduce((s, b) => s + b.qtd, 0);
  const ordem = [...base].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordem.length && sobra > 0; i++, sobra--) ordem[i].qtd += 1;
  return base.map((b) => ({ empresaId: b.empresaId, qtd: b.qtd }));
}
