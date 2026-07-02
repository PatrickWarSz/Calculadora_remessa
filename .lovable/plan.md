## O que vou fazer

Dividido em duas partes: **corrigir o bug** que você achou e **completar a aba Revenda** como você pediu.

---

## 1. Bug: produto novo não aparece na "Nova nota de balcão"

**Causa:** o seletor de produto na nota de balcão só lista produtos que já tiveram venda no mês base (fechamento). Como "Cueca Plus" é novo e nunca foi importado em planilha, ele fica invisível — mesmo estando no cadastro.

**Correção:**

- O seletor passa a listar **todos** os produtos de revenda cadastrados.
- Quando o produto escolhido não tem base de proporção (sem vendas no mês base), aparece um aviso: *"Sem histórico de vendas para distribuir automaticamente"* e o formulário abre um modo de **distribuição manual**: você digita quantas peças de cada tamanho vão para cada empresa. Isso resolve o caso de produto novo, produto sazonal que ninguém vendeu ainda, ou fechamento não importado.
- Assim que o produto tiver venda registrada em um fechamento, ele volta a usar distribuição automática por proporção — sem você mexer em nada.

---

## 2. Revenda mais completa (o que você pediu)

### 2a. Painel "Vendido × Pego" do mês

Em cima da aba Revenda, uma tabela por produto mostrando lado a lado, **por empresa e por tamanho**:

- **Vendido** (do fechamento do mês ativo — não do mês base)
- **Pego** (soma das notas de balcão registradas no mês)
- **Saldo** (pego − vendido). Positivo = sobra em estoque, negativo = falta.

Células com falta ficam destacadas em vermelho, sobra em verde suave. Você bate o olho e vê onde precisa pegar mais nota ou onde vai encalhar.

### 2b. Alerta de estoque baixo

Enquanto você preenche uma nota nova, se o produto escolhido tem alguma empresa com saldo negativo no mês ativo, aparece um chip: *"CR está com falta de 15 M e 8 G"*. Serve de lembrete pra ajustar manualmente antes de fechar a nota, ou pra pegar uma nota extra depois.

### 2c. Fechamento mensal da revenda

Um botão "Fechar mês de revenda" que congela o mês: gera um resumo final (total pego por produto/empresa/tamanho, saldo final por empresa, notas emitidas) e trava edição das notas daquele mês. Fica no histórico — você pode reabrir se precisar corrigir.

### 2d. Histórico e busca

Lista de notas de meses passados com filtro por produto, empresa e período. Cada linha expande e mostra a distribuição gerada, com botão "copiar" para reenviar a distribuição para o emissor da NF.

---

## Detalhes técnicos

- `NovaNotaForm` passa a receber `proporcoes` completo em vez de `proporcoesUsadas`. Detecta `prop.length === 0` e alterna para modo manual (matriz empresa × tamanho editável, com validação de soma = total do tamanho).
- Novo componente `VendidoVsPego` calcula `vendas[emp][tam]` do fechamento do mês ativo × `acumulado[produtoId][emp][tam]` já existente.
- Fechamento de revenda: novo tipo `FechamentoRevenda { mes, fechadoEm, resumo }` em `types.ts` e persistido no `AppData`. `NotaRevenda` ganha campo opcional `travada: boolean` que o UI respeita.
- Histórico: já temos `data.notasRevenda` global — só falta um componente com filtros.

Toda a persistência continua no `localStorage` — quando você ligar o Supabase, migra tudo de uma vez.
