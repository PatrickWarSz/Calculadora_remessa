
## O que vamos consertar

A confusão atual vem de 3 coisas misturadas: (1) "mês de referência" vs "mês ativo" sem propósito claro, (2) revenda tratada igual a produção própria, (3) entrada manual de quantidades quando você já tem as planilhas. Vou separar tudo em um **ciclo mensal** explícito e adicionar **importação dos .xls**.

## Conceito central: o Ciclo Mensal

Cada mês tem um "fechamento de vendas". A partir dele saem duas decisões diferentes:

```
                   ┌─ Produção própria → Nota de remessa MEI → industrialização
Vendas do mês M ──┤
                   └─ Revenda → base de proporção para distribuir notas de balcão pegas na fábrica
```

Você nunca mais digita "mês de referência" solto. Você abre o **Fechamento do mês 05/2026** e dentro dele tudo já está conectado: vendas importadas → remessa gerada → notas de revenda do mês distribuídas com base nessas vendas.

## 1. Importação das planilhas Excel (.xls)

Nova aba **"Fechamento mensal"**:

- Botão "Importar planilha" por empresa (CR, Rezende, Costa, RC). Aceita o `.xls` que você já exporta — vou usar a lib `xlsx` que lê o formato BIFF antigo do seu sistema.
- O parser lê as 5 colunas (`Código`, `Descrição`, `Quant.`, `Marca`, `Grupo`), soma `Quant.` por `Grupo` por empresa, e detecta o **tamanho** a partir da Descrição (sufixos `P/M`, `G/GG`, `P`, `M`, `G`, `GG`, e também `P/M` que conta meio P meio M — ou conta como "P/M" agrupado, você escolhe; sugiro manter "P/M" e "G/GG" como tamanhos próprios, já que é assim que sua fábrica vende).
- Mapeamento de Grupo → Produto cadastrado, editável (LEGGING→Leggings, SHORT→Shorts, TOP→Tops, MACAQUINHO→Macaquinhos, MACACAO→Macacões, BIQUINI→Biquinis, CALCINHA→Calcinhas, SAMBA CANCAO→Samba canção, CAMISA TERMICA→Camisa térmica). Salvo, vira automático nas próximas importações.
- Mostra preview por empresa: total por grupo + total por grupo×tamanho. Botão "Confirmar" grava no fechamento.
- Validações: arquivo da empresa errada (heurística por marca), linhas com Quant. inválida, grupo não mapeado — tudo destacado antes de gravar.

## 2. Aba "Remessa para industrialização"

Para produção própria, usa os totais agregados (somando as 4 empresas) do fechamento do mês selecionado:

- Quantidade já vem preenchida do import (você ainda pode editar célula a célula se quiser ajustar).
- Cálculo de KG por rendimento, valor por peça, custo do tecido (já existe).
- Seleção manual de MEI por empresa, controle de limite mensal (já existe).
- Geração de mensagem WhatsApp e PDF (já existe).
- Histórico: cada remessa salva fica vinculada ao mês de fechamento que gerou ela.

## 3. Aba "Revenda" reformulada

A confusão de "mês de referência / mês ativo" some. Fica assim:

**3a. Base de proporção** (calculada, não digitada): para cada produto de revenda, mostra a distribuição percentual entre as empresas com base nas vendas do fechamento mensal escolhido. Só aparecem empresas que venderam aquele produto naquele mês.

**3b. Notas de balcão pegas na fábrica**: cada vez que você busca uma nota, registra:
- Data da nota
- Produto + quantidades por tamanho (ex: Samba canção P=0, M=50, G=120, GG=15)
- Sistema distribui automaticamente **por tamanho** entre as empresas, usando a proporção 3a, com algoritmo de maior resto para fechar exato.
- Resultado: tabela "como pedir a NF distribuída" pronta para você passar para o emissor.

**3c. Acompanhamento do mês**: somatório de tudo que já foi pego no mês atual por empresa e por tamanho, comparado com as vendas do mês de referência — você vê quando está sobrando/faltando estoque por empresa antes de pegar a próxima nota.

## 4. Cadastros (ajustes mínimos)

- Produtos próprios: adicionar Macacões, Macaquinhos, Calcinhas, Biquinis (que estão nas suas planilhas mas não no cadastro). Cada um com rendimento (peças/kg) e valor unitário da remessa.
- Mapeamento Grupo→Produto editável.
- Resto permanece (MEIs, tecido, produtos de revenda com tamanhos).

## 5. Persistência

Continua tudo no localStorage por enquanto (você disse que ligaria Supabase depois). Estrutura nova:

```
fechamentos: {
  "05/2026": {
    vendasPorEmpresa: { [empresaId]: { [produtoId]: { total, porTamanho } } },
    importadoEm: { [empresaId]: timestamp }
  },
  ...
}
remessas: [{ id, mes, totais, alocacaoMEI, ... }]
notasRevenda: [{ id, data, mes, produtoId, porTamanho, distribuicao }]
```

## Detalhes técnicos

- Lib `xlsx` (SheetJS) para ler `.xls` BIFF antigo. Já confirmei que suas 4 planilhas abrem com ela.
- Parser de tamanho via regex no fim da Descrição: `/\s(P\/M|G\/GG|PP|GGG|GG|XG|P|M|G)$/i`.
- Algoritmo de distribuição por tamanho: para cada tamanho da nota de balcão, aplica `distribuirRevenda(qtdTamanho, proporcaoDoMes)` que já existe e usa largest-remainder.
- Auto-detecção da empresa do arquivo: heurística pelo nome do arquivo + pelo conteúdo da coluna Marca; se ambíguo, você confirma manualmente.
- UI: o seletor de mês no topo controla qual fechamento está ativo em todas as abas — fim do "mudei o mês e nada acontece".

## Migração dos dados atuais

Seus cadastros (empresas, MEIs, produtos, tecido, produtos de revenda) ficam. O "histórico de revenda" digitado manualmente e os "pedidos de revenda" ficam apagados (eram modelo antigo) — vamos repopular importando as planilhas de maio.

---

Posso seguir e implementar? Se algo aqui estiver fora do que você imagina (especialmente: tratar `P/M` e `G/GG` como tamanhos próprios vs. dividir 50/50, e regra de mapeamento Grupo→Produto), me diga antes que eu começo.
