import type {
  AlocacaoMEI,
  Empresa,
  HistoricoRevendaMes,
  ItemCalculo,
  MEI,
  Produto,
  ProdutoRevenda,
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

export function calcEmpresa(
  empresa: Empresa,
  produtos: Produto[],
  quantidades: Quantidades,
): ResumoEmpresa {
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

export function calcTotaisProduto(
  produtos: Produto[],
  resumos: ResumoEmpresa[],
): { produto: Produto; qtd: number; kg: number; valor: number }[] {
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

/**
 * Distribuição MANUAL: cada empresa é atribuída a um MEI via meiPorEmpresa.
 * O valor total da empresa vai inteiro para esse MEI. Empresas sem MEI
 * atribuído ficam em "naoAtribuido". MEIs sem empresa atribuída ainda
 * aparecem com valor 0 para visibilidade.
 */
export function distribuirMEIsManual(
  empresas: Empresa[],
  resumos: ResumoEmpresa[],
  meiPorEmpresa: Record<string, string>,
  meis: MEI[],
): {
  alocacoes: AlocacaoMEI[];
  naoAtribuido: { valor: number; empresaIds: string[] };
} {
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

  const naoAtribuido: { valor: number; empresaIds: string[] } = {
    valor: 0,
    empresaIds: [],
  };

  empresas.forEach((e, idx) => {
    const r = resumos[idx];
    if (!r || r.totalValor <= 0.0001) return;
    const meiId = meiPorEmpresa[e.id];
    const aloc = meiId ? map.get(meiId) : undefined;
    if (!aloc) {
      naoAtribuido.valor += r.totalValor;
      naoAtribuido.empresaIds.push(e.id);
      return;
    }
    aloc.valor += r.totalValor;
    aloc.empresaIds.push(e.id);
  });

  for (const a of map.values()) {
    const totalNoMes = a.jaUsadoMes + a.valor;
    a.estouro = Math.max(0, totalNoMes - a.limite);
  }

  return { alocacoes: Array.from(map.values()), naoAtribuido };
}

/* ---------- Revenda: proporção de vendas ---------- */

/** Para um produto de revenda, soma vendas por empresa no mês informado. */
export function proporcaoRevenda(
  historicoMes: HistoricoRevendaMes | undefined,
  produtoId: string,
  empresas: Empresa[],
): { empresaId: string; qtd: number; pct: number }[] {
  const vendas = empresas.map((e) => ({
    empresaId: e.id,
    qtd: historicoMes?.vendas[e.id]?.[produtoId] ?? 0,
    pct: 0,
  }));
  const total = vendas.reduce((s, v) => s + v.qtd, 0);
  if (total > 0) {
    for (const v of vendas) v.pct = v.qtd / total;
  }
  return vendas;
}

/**
 * Distribui uma quantidade total que será comprada de um produto de revenda
 * entre as empresas, pela proporção do mês de referência.
 * Usa "largest remainder" para manter a soma exatamente igual ao total.
 */
export function distribuirRevenda(
  totalQtd: number,
  proporcao: { empresaId: string; pct: number }[],
): { empresaId: string; qtd: number }[] {
  if (totalQtd <= 0 || proporcao.every((p) => p.pct === 0)) {
    return proporcao.map((p) => ({ empresaId: p.empresaId, qtd: 0 }));
  }
  const raw = proporcao.map((p) => ({
    empresaId: p.empresaId,
    exato: p.pct * totalQtd,
  }));
  const base = raw.map((r) => ({
    empresaId: r.empresaId,
    qtd: Math.floor(r.exato),
    resto: r.exato - Math.floor(r.exato),
  }));
  let distribuido = base.reduce((s, b) => s + b.qtd, 0);
  let sobra = totalQtd - distribuido;
  // distribui a sobra pelos maiores restos
  const ordem = [...base].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordem.length && sobra > 0; i++) {
    ordem[i].qtd += 1;
    sobra--;
  }
  return base.map((b) => ({ empresaId: b.empresaId, qtd: b.qtd }));
}

export function listarProdutosRevendaUsados(
  historicoMes: HistoricoRevendaMes | undefined,
  produtosRevenda: ProdutoRevenda[],
): ProdutoRevenda[] {
  if (!historicoMes) return [];
  const usados = new Set<string>();
  for (const e of Object.values(historicoMes.vendas)) {
    for (const [pid, qtd] of Object.entries(e)) {
      if (qtd > 0) usados.add(pid);
    }
  }
  return produtosRevenda.filter((p) => usados.has(p.id));
}
