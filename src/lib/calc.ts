import type {
  AlocacaoMEI,
  Empresa,
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
 * Distribui um valor total entre MEIs ativos, respeitando o limite mensal
 * (limiteMensal - jaUsadoMes). Algoritmo: preenche proporcionalmente à
 * capacidade disponível, em rodadas, até esgotar o valor ou saturar todos.
 */
export function distribuirMEIs(valorTotal: number, meis: MEI[]): {
  alocacoes: AlocacaoMEI[];
  alocado: number;
  excedente: number;
} {
  const ativos = meis.filter((m) => m.ativo);
  const aloc: AlocacaoMEI[] = ativos.map((m) => ({
    meiId: m.id,
    valor: 0,
    limite: m.limiteMensal,
    disponivel: Math.max(0, m.limiteMensal - m.jaUsadoMes),
    saturado: false,
  }));

  let restante = Math.max(0, valorTotal);
  // Round-robin proporcional: até 20 iterações
  for (let iter = 0; iter < 50 && restante > 0.005; iter++) {
    const livres = aloc.filter((a) => !a.saturado && a.disponivel - a.valor > 0.005);
    if (livres.length === 0) break;
    const capTotal = livres.reduce((s, a) => s + (a.disponivel - a.valor), 0);
    if (capTotal <= 0.005) break;
    const aDistribuir = Math.min(restante, capTotal);
    for (const a of livres) {
      const cap = a.disponivel - a.valor;
      const share = (cap / capTotal) * aDistribuir;
      const add = Math.min(share, cap);
      a.valor += add;
      restante -= add;
      if (a.disponivel - a.valor <= 0.005) a.saturado = true;
    }
  }

  const alocado = aloc.reduce((s, a) => s + a.valor, 0);
  return { alocacoes: aloc, alocado, excedente: Math.max(0, valorTotal - alocado) };
}
