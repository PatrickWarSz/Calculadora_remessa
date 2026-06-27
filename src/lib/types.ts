export type Produto = {
  id: string;
  nome: string;
  rendimento: number; // peças por kg
  valor: number; // R$ por peça
  /** Nome canônico do GRUPO no relatório do ERP (ex.: "LEGGING"). Usado p/ auto-mapeamento. */
  grupoCanonico?: string;
};

export type Empresa = {
  id: string;
  nome: string;
  cnpj?: string;
  /** apelidos para casar com nomes nas planilhas do ERP (case-insensitive) */
  apelidos?: string[];
};

export type MEI = {
  id: string;
  nome: string;
  limiteMensal: number;
  jaUsadoMes: number;
  ativo: boolean;
};

export type Quantidades = Record<string, Record<string, string>>;

/** Remessa extra: instância adicional de uma empresa no mesmo mês (industrialização avulsa). */
export type RemessaExtra = {
  id: string;          // id único usado como chave em quantidades e meiPorEmpresa
  empresaBaseId: string;
  rotulo?: string;     // opcional, ex.: "fim de mês"
};

export type ItemCalculo = { produtoId: string; qtd: number; kg: number; valor: number };
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
  estouro: number;
  empresaIds: string[];
};

/* ---------- Revenda ---------- */
export type ProdutoRevenda = {
  id: string;
  nome: string;
  tamanhos: string[];
  grupoCanonico?: string;
};

/* ---------- Fechamento mensal (vindo das planilhas) ---------- */
export type VendaItem = {
  /** total da empresa no mês para esse produto */
  total: number;
  /** breakdown por tamanho (quando detectado) */
  porTamanho: Record<string, number>;
};

export type Fechamento = {
  /** "MM/AAAA" */
  mes: string;
  /** vendas[empresaId][produtoId] = VendaItem */
  vendas: Record<string, Record<string, VendaItem>>;
  /** timestamp do último import por empresa */
  importadoEm: Record<string, number>;
  /** linhas com grupo desconhecido (preserva pra você revisar) */
  pendentes: Record<string, { grupo: string; descricao: string; qtd: number }[]>;
};

/* ---------- Notas de balcão de revenda ---------- */
export type NotaRevenda = {
  id: string;
  /** "MM/AAAA" — mês em que a nota foi pega */
  mes: string;
  /** ISO date */
  data: string;
  produtoId: string;
  /** qtd pega por tamanho */
  porTamanho: Record<string, number>;
  /** mês usado como base de proporção */
  baseMes: string;
  /** distribuição final: [empresaId][tamanho] = qtd */
  distribuicao: Record<string, Record<string, number>>;
  observacao?: string;
};

/** Mapeamento Grupo (ERP) -> produto cadastrado. Pode apontar pra produto próprio OU revenda. */
export type MapeamentoGrupo = Record<string, string>;
