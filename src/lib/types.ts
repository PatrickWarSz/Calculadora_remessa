export type Produto = {
  id: string;
  nome: string;
  rendimento: number; // peças por kg
  valor: number; // R$ por peça
};

export type Empresa = {
  id: string;
  nome: string;
  cnpj?: string;
};

export type MEI = {
  id: string;
  nome: string;
  limiteMensal: number; // R$
  jaUsadoMes: number; // R$ já faturado no mês corrente
  ativo: boolean;
};

export type Quantidades = Record<string, Record<string, string>>;
// quantidades[empresaId][produtoId] = "1234"

export type ItemCalculo = {
  produtoId: string;
  qtd: number;
  kg: number;
  valor: number;
};

export type ResumoEmpresa = {
  empresaId: string;
  itens: ItemCalculo[];
  totalKg: number;
  totalValor: number;
};

export type AlocacaoMEI = {
  meiId: string;
  valor: number;
  limite: number;
  jaUsadoMes: number;
  disponivel: number;
  estouro: number; // quanto excedeu o limite
  empresaIds: string[];
};

/* ---------- Revenda ---------- */
export type ProdutoRevenda = {
  id: string;
  nome: string;
  /** tamanhos comercializados (ex.: ["P","M","G","GG"]). Vazio = sem grade */
  tamanhos: string[];
};

export type HistoricoRevendaMes = {
  // mes no formato MM/AAAA
  mes: string;
  // vendas[empresaId][produtoRevendaId] = quantidade total vendida no mês (sem tamanho)
  vendas: Record<string, Record<string, number>>;
};

/** Pedidos de revenda em andamento, por mês.
 *  pedidos[produtoId][tamanho] = quantidade já pega na fábrica */
export type PedidosRevendaMes = Record<string, Record<string, number>>;
