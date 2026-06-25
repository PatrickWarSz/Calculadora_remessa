import { useEffect, useMemo, useState } from "react";
import type { AppData } from "@/lib/storage";
import { loadData, saveData, newId, MES_KEY, mesAnterior } from "@/lib/storage";
import {
  calcEmpresa,
  calcTotaisProduto,
  distribuirMEIsManual,
  distribuirRevenda,
  fmtBRL,
  fmtInt,
  fmtKg,
  fmtPct,
  proporcaoRevenda,
} from "@/lib/calc";
import type {
  Empresa,
  HistoricoRevendaMes,
  MEI,
  PedidosRevendaMes,
  Produto,
  ProdutoRevenda,
} from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Calculator,
  Check,
  Copy,
  FileDown,
  MessageSquare,
  Package,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import jsPDF from "jspdf";

export default function CalculadoraApp() {
  // Inicializa com defaults estáveis (SSR) e carrega localStorage só no client
  const [data, setData] = useState<AppData>(() => loadData());
  const [mes, setMes] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setData(loadData());
    const savedMes = window.localStorage.getItem(MES_KEY);
    if (savedMes) {
      setMes(savedMes);
    } else {
      const d = new Date();
      setMes(`${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveData(data);
  }, [data, mounted]);

  useEffect(() => {
    if (mounted && mes) window.localStorage.setItem(MES_KEY, mes);
  }, [mes, mounted]);

  const update = (patch: Partial<AppData>) => setData((d) => ({ ...d, ...patch }));

  const resumos = useMemo(
    () => data.empresas.map((e) => calcEmpresa(e, data.produtos, data.quantidades)),
    [data.empresas, data.produtos, data.quantidades],
  );

  const totalKg = resumos.reduce((s, r) => s + r.totalKg, 0);
  const totalValor = resumos.reduce((s, r) => s + r.totalValor, 0);
  const totalTecido = totalKg * data.precoTecidoKg;
  const porProduto = calcTotaisProduto(data.produtos, resumos);
  const dist = useMemo(
    () => distribuirMEIsManual(data.empresas, resumos, data.meiPorEmpresa, data.meis),
    [data.empresas, resumos, data.meiPorEmpresa, data.meis],
  );

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" richColors />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Sistema Interno · Industrialização
            </p>
            <h1 className="text-2xl font-semibold text-foreground mt-1">
              Calculadora de Remessa
            </h1>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <Label
                htmlFor="mes"
                className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
              >
                Mês de referência
              </Label>
              <Input
                id="mes"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                placeholder="MM/AAAA"
                className="w-32 num text-center"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="calc" className="space-y-6">
          <TabsList className="bg-surface-2 border border-border">
            <TabsTrigger value="calc">
              <Calculator className="size-4 mr-1.5" />
              Calculadora
            </TabsTrigger>
            <TabsTrigger value="msg">
              <MessageSquare className="size-4 mr-1.5" />
              Mensagem
            </TabsTrigger>
            <TabsTrigger value="revenda">
              <ShoppingBag className="size-4 mr-1.5" />
              Revenda
            </TabsTrigger>
            <TabsTrigger value="cadastros">
              <Settings2 className="size-4 mr-1.5" />
              Cadastros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calc" className="space-y-6">
            <Calculadora
              data={data}
              update={update}
              resumos={resumos}
              totalKg={totalKg}
              totalValor={totalValor}
              totalTecido={totalTecido}
              porProduto={porProduto}
              dist={dist}
              mes={mes}
            />
          </TabsContent>

          <TabsContent value="msg">
            <Mensagens
              data={data}
              resumos={resumos}
              porProduto={porProduto}
              totalValor={totalValor}
              totalKg={totalKg}
              totalTecido={totalTecido}
              dist={dist}
              mes={mes}
            />
          </TabsContent>

          <TabsContent value="revenda">
            <Revenda data={data} update={update} mes={mes} />
          </TabsContent>

          <TabsContent value="cadastros">
            <Cadastros data={data} update={update} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ---------------- Calculadora tab ---------------- */
type ResumoArr = ReturnType<typeof calcEmpresa>[];
type DistMan = ReturnType<typeof distribuirMEIsManual>;

function Calculadora({
  data,
  update,
  resumos,
  totalKg,
  totalValor,
  totalTecido,
  porProduto,
  dist,
  mes,
}: {
  data: AppData;
  update: (p: Partial<AppData>) => void;
  resumos: ResumoArr;
  totalKg: number;
  totalValor: number;
  totalTecido: number;
  porProduto: ReturnType<typeof calcTotaisProduto>;
  dist: DistMan;
  mes: string;
}) {
  const setQtd = (empresaId: string, produtoId: string, val: string) => {
    const v = val.replace(/\D/g, "");
    update({
      quantidades: {
        ...data.quantidades,
        [empresaId]: { ...(data.quantidades[empresaId] ?? {}), [produtoId]: v },
      },
    });
  };

  const setMeiEmpresa = (empresaId: string, meiId: string) => {
    update({
      meiPorEmpresa: {
        ...data.meiPorEmpresa,
        [empresaId]: meiId === "__none__" ? "" : meiId,
      },
    });
  };

  const limpar = () => {
    update({ quantidades: {} });
    toast.success("Quantidades zeradas");
  };

  const exportarPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const m = 48;
    let y = m;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Resumo de Remessa para Industrialização", m, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Mês de referência: ${mes}`, m, y);
    y += 22;

    data.empresas.forEach((e, idx) => {
      const r = resumos[idx];
      if (r.totalValor === 0) return;
      const meiId = data.meiPorEmpresa[e.id];
      const meiNome = data.meis.find((x) => x.id === meiId)?.nome ?? "—";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${e.nome}   [MEI: ${meiNome}]`, m, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      r.itens.forEach((it) => {
        const p = data.produtos.find((x) => x.id === it.produtoId);
        if (!p || it.qtd === 0) return;
        doc.text(
          `${p.nome.padEnd(14)}  ${fmtInt(it.qtd).padStart(6)} pç   ${fmtKg(it.kg).padStart(8)} kg   R$ ${fmtBRL(it.valor).padStart(10)}`,
          m,
          y,
        );
        y += 13;
      });
      doc.setFont("helvetica", "bold");
      doc.text(
        `Subtotal: ${fmtKg(r.totalKg)} kg  ·  R$ ${fmtBRL(r.totalValor)}`,
        m,
        y,
      );
      y += 22;
    });

    doc.setDrawColor(180);
    doc.line(m, y, 595 - m, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`TOTAL: ${fmtKg(totalKg)} kg  ·  R$ ${fmtBRL(totalValor)}`, m, y);
    y += 16;
    if (data.precoTecidoKg > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(
        `Tecido ${data.nomeTecido}: ${fmtKg(totalKg)} kg × R$ ${fmtBRL(data.precoTecidoKg)}/kg = R$ ${fmtBRL(totalTecido)}`,
        m,
        y,
      );
      y += 18;
    }

    if (dist.alocacoes.length) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Distribuição entre MEIs (manual)", m, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      dist.alocacoes.forEach((a) => {
        const mei = data.meis.find((x) => x.id === a.meiId);
        if (!mei) return;
        doc.text(
          `${mei.nome.padEnd(14)} R$ ${fmtBRL(a.valor).padStart(10)}   (limite R$ ${fmtBRL(a.limite)})`,
          m,
          y,
        );
        y += 13;
      });
      if (dist.naoAtribuido.valor > 0.01) {
        doc.setTextColor(180, 40, 40);
        doc.text(
          `Sem MEI atribuído: R$ ${fmtBRL(dist.naoAtribuido.valor)}`,
          m,
          y,
        );
        y += 13;
        doc.setTextColor(0);
      }
    }

    doc.save(`remessa-${mes.replace("/", "-")}.pdf`);
  };

  const meiNome = (id: string) =>
    data.meis.find((m) => m.id === id)?.nome ?? "";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Informe as peças vendidas por CNPJ e selecione o MEI que vai faturar.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={limpar}>
            <RotateCcw className="size-3.5 mr-1.5" /> Limpar
          </Button>
          <Button size="sm" onClick={exportarPdf} disabled={totalValor === 0}>
            <FileDown className="size-3.5 mr-1.5" /> Exportar PDF
          </Button>
        </div>
      </div>

      {data.empresas.map((empresa, idx) => {
        const r = resumos[idx];
        const meiId = data.meiPorEmpresa[empresa.id] ?? "";
        return (
          <Card key={empresa.id} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-surface-2 border-b border-border">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Building2 className="size-4 text-success" />
                <span className="font-medium text-sm">{empresa.nome}</span>
                {empresa.cnpj && (
                  <span className="text-[11px] num text-muted-foreground">
                    {empresa.cnpj}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  MEI
                </Label>
                <Select
                  value={meiId || "__none__"}
                  onValueChange={(v) => setMeiEmpresa(empresa.id, v)}
                >
                  <SelectTrigger className="h-8 w-48 text-sm">
                    <SelectValue placeholder="Selecionar MEI" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem MEI —</SelectItem>
                    {data.meis
                      .filter((m) => m.ativo)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}{" "}
                          <span className="text-muted-foreground">
                            (R$ {fmtBRL(m.limiteMensal)})
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_120px_110px_130px] gap-2 px-5 py-2 border-b border-border">
              <span />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                Qtd. peças
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                KG
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                Valor R$
              </span>
            </div>

            {data.produtos.map((p, pIdx) => {
              const it = r.itens.find((i) => i.produtoId === p.id)!;
              const last = pIdx === data.produtos.length - 1;
              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-[1fr_120px_110px_130px] gap-2 items-center px-5 py-3 ${last ? "" : "border-b border-border"}`}
                >
                  <div>
                    <span className="font-medium text-sm">{p.nome}</span>
                    <span className="ml-2 text-[11px] num text-muted-foreground">
                      ÷{p.rendimento} · ×R$ {fmtBRL(p.valor)}
                    </span>
                  </div>
                  <Input
                    inputMode="numeric"
                    value={data.quantidades[empresa.id]?.[p.id] ?? ""}
                    onChange={(e) => setQtd(empresa.id, p.id, e.target.value)}
                    placeholder="0"
                    className="num text-right h-9"
                  />
                  <span
                    className={`num text-right text-sm ${it.qtd > 0 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {it.qtd > 0 ? fmtKg(it.kg) : "—"}
                  </span>
                  <span
                    className={`num text-right text-sm font-medium ${it.qtd > 0 ? "text-success" : "text-muted-foreground"}`}
                  >
                    {it.qtd > 0 ? `R$ ${fmtBRL(it.valor)}` : "—"}
                  </span>
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_120px_110px_130px] gap-2 px-5 py-3 bg-surface-2 border-t border-border items-center">
              <span className="text-sm font-medium text-muted-foreground">
                Subtotal {meiId ? `→ ${meiNome(meiId)}` : ""}
              </span>
              <span />
              <span className="num text-right text-sm font-semibold">
                {fmtKg(r.totalKg)} kg
              </span>
              <span className="num text-right text-sm font-semibold text-success">
                R$ {fmtBRL(r.totalValor)}
              </span>
            </div>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total KG · {data.nomeTecido}
          </p>
          <p className="num text-3xl font-semibold mt-1.5">
            {fmtKg(totalKg)}{" "}
            <span className="text-sm text-muted-foreground font-normal">kg</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Saída de estoque na nota
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Custo do tecido
          </p>
          <p className="num text-3xl font-semibold mt-1.5">
            <span className="text-base font-normal">R$ </span>
            {fmtBRL(totalTecido)}
          </p>
          <p className="text-[11px] num text-muted-foreground mt-2">
            {fmtKg(totalKg)} kg × R$ {fmtBRL(data.precoTecidoKg)}/kg
          </p>
        </Card>
        <Card className="p-5 bg-success/5 border-success/20">
          <p className="text-[11px] uppercase tracking-wider text-success">
            Valor Total · NF
          </p>
          <p className="num text-3xl font-semibold mt-1.5 text-success">
            <span className="text-base font-normal">R$ </span>
            {fmtBRL(totalValor)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Soma das empresas
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total Peças
          </p>
          <p className="num text-3xl font-semibold mt-1.5">
            {fmtInt(porProduto.reduce((s, p) => s + p.qtd, 0))}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
            {porProduto
              .filter((p) => p.qtd > 0)
              .map((p) => `${p.produto.nome}: ${fmtInt(p.qtd)}`)
              .join(" · ")}
          </p>
        </Card>
      </div>

      {totalValor > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm">Distribuição entre MEIs</h3>
              <p className="text-[11px] text-muted-foreground">
                Manual — cada empresa vai inteira para o MEI selecionado acima.
              </p>
            </div>
            {dist.naoAtribuido.valor > 0.01 && (
              <span className="text-[11px] px-2 py-1 rounded bg-destructive/10 text-destructive font-medium">
                Sem MEI: R$ {fmtBRL(dist.naoAtribuido.valor)}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {dist.alocacoes.map((a) => {
              const mei = data.meis.find((m) => m.id === a.meiId);
              if (!mei) return null;
              const totalUso = a.jaUsadoMes + a.valor;
              const pct =
                a.limite > 0 ? Math.min(100, (totalUso / a.limite) * 100) : 0;
              const pctUsado =
                a.limite > 0 ? (a.jaUsadoMes / a.limite) * 100 : 0;
              const empresasNomes = a.empresaIds
                .map((id) => data.empresas.find((e) => e.id === id)?.nome)
                .filter(Boolean)
                .join(", ");
              return (
                <div key={a.meiId} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium">{mei.nome}</span>
                      {empresasNomes && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          ← {empresasNomes}
                        </span>
                      )}
                    </div>
                    <span className="num">
                      <span
                        className={`font-semibold ${a.estouro > 0 ? "text-destructive" : "text-success"}`}
                      >
                        R$ {fmtBRL(a.valor)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / R$ {fmtBRL(a.limite)}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-muted-foreground/30"
                      style={{ width: `${pctUsado}%` }}
                    />
                    <div
                      className={`absolute inset-y-0 ${a.estouro > 0 ? "bg-destructive" : "bg-success"}`}
                      style={{
                        left: `${pctUsado}%`,
                        width: `${pct - pctUsado}%`,
                      }}
                    />
                  </div>
                  {a.estouro > 0 && (
                    <p className="text-[11px] text-destructive num">
                      Estoura limite em R$ {fmtBRL(a.estouro)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {data.meis.filter((m) => m.ativo).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum MEI ativo. Cadastre em Cadastros → MEIs.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ---------------- Mensagem tab ---------------- */
function Mensagens({
  data,
  resumos,
  porProduto,
  totalValor,
  totalKg,
  totalTecido,
  dist,
  mes,
}: {
  data: AppData;
  resumos: ResumoArr;
  porProduto: ReturnType<typeof calcTotaisProduto>;
  totalValor: number;
  totalKg: number;
  totalTecido: number;
  dist: DistMan;
  mes: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const linhaProduto = (nome: string, qtd: number, preco: number, valor: number) =>
    `${nome} ${fmtInt(qtd)} = R$${fmtBRL(preco)} cada = R$${fmtBRL(valor)} reais`;

  const msgConsolidada = useMemo(() => {
    const linhas = porProduto
      .filter((p) => p.qtd > 0)
      .map((p) => linhaProduto(p.produto.nome, p.qtd, p.produto.valor, p.valor));
    const tail: string[] = [
      `Total: ${fmtKg(totalKg)} kg · R$ ${fmtBRL(totalValor)}`,
    ];
    if (data.precoTecidoKg > 0) {
      tail.push(
        `Tecido ${data.nomeTecido}: ${fmtKg(totalKg)} kg × R$ ${fmtBRL(
          data.precoTecidoKg,
        )}/kg = R$ ${fmtBRL(totalTecido)}`,
      );
    }
    return [`*Remessa ${mes}*`, "", ...linhas, "", ...tail].join("\n");
  }, [porProduto, totalKg, totalValor, totalTecido, data.precoTecidoKg, data.nomeTecido, mes]);

  /* mensagem agrupada por MEI: lista todas as empresas atribuídas + itens */
  const msgPorMEI = useMemo(() => {
    return dist.alocacoes
      .filter((a) => a.valor > 0.01)
      .map((a) => {
        const mei = data.meis.find((m) => m.id === a.meiId)!;
        const blocos: string[] = [`*${mei.nome} — Remessa ${mes}*`, ""];
        let kgMei = 0;
        a.empresaIds.forEach((eid) => {
          const e = data.empresas.find((x) => x.id === eid)!;
          const idx = data.empresas.findIndex((x) => x.id === eid);
          const r = resumos[idx];
          blocos.push(`▸ ${e.nome}`);
          r.itens
            .filter((it) => it.qtd > 0)
            .forEach((it) => {
              const p = data.produtos.find((x) => x.id === it.produtoId)!;
              blocos.push(
                "  " + linhaProduto(p.nome, it.qtd, p.valor, it.valor),
              );
            });
          blocos.push(
            `  Subtotal: ${fmtKg(r.totalKg)} kg · R$ ${fmtBRL(r.totalValor)}`,
            "",
          );
          kgMei += r.totalKg;
        });
        blocos.push(
          `Total a faturar: R$ ${fmtBRL(a.valor)}`,
          `Limite mensal: R$ ${fmtBRL(a.limite)} · Já usado: R$ ${fmtBRL(a.jaUsadoMes)}`,
        );
        if (data.precoTecidoKg > 0) {
          blocos.push(
            `Tecido ${data.nomeTecido}: ${fmtKg(kgMei)} kg × R$ ${fmtBRL(
              data.precoTecidoKg,
            )}/kg = R$ ${fmtBRL(kgMei * data.precoTecidoKg)}`,
          );
        }
        return { mei, texto: blocos.join("\n") };
      });
  }, [dist.alocacoes, data, resumos, mes]);

  const msgPorEmpresa = useMemo(() => {
    return data.empresas.map((e, i) => {
      const r = resumos[i];
      const meiId = data.meiPorEmpresa[e.id];
      const meiNome = data.meis.find((m) => m.id === meiId)?.nome ?? "—";
      const linhas = r.itens
        .filter((it) => it.qtd > 0)
        .map((it) => {
          const p = data.produtos.find((x) => x.id === it.produtoId)!;
          return linhaProduto(p.nome, it.qtd, p.valor, it.valor);
        });
      return {
        empresa: e,
        texto:
          linhas.length === 0
            ? null
            : [
                `*${e.nome} — Remessa ${mes}*`,
                `MEI: ${meiNome}`,
                "",
                ...linhas,
                "",
                `Total: ${fmtKg(r.totalKg)} kg · R$ ${fmtBRL(r.totalValor)}`,
              ].join("\n"),
      };
    });
  }, [data.empresas, data.produtos, data.meiPorEmpresa, data.meis, resumos, mes]);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copiado");
    setTimeout(() => setCopied(null), 1800);
  };

  if (totalValor === 0) {
    return (
      <Card className="p-10 text-center">
        <MessageSquare className="size-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Preencha as quantidades na aba Calculadora para gerar as mensagens.
        </p>
      </Card>
    );
  }

  const MsgCard = ({
    title,
    subtitle,
    texto,
    k,
  }: {
    title: string;
    subtitle?: string;
    texto: string;
    k: string;
  }) => (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-sm">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => copy(k, texto)}>
          {copied === k ? (
            <Check className="size-3.5 mr-1.5" />
          ) : (
            <Copy className="size-3.5 mr-1.5" />
          )}
          {copied === k ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm font-mono bg-surface-2 rounded-md p-3 border border-border">
        {texto}
      </pre>
    </Card>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Consolidada
        </h2>
        <MsgCard
          title="Mensagem consolidada"
          subtitle="Soma de todas as empresas"
          texto={msgConsolidada}
          k="cons"
        />
      </section>

      {msgPorMEI.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Por MEI (atribuição manual)
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {msgPorMEI.map((m) => (
              <MsgCard
                key={m.mei.id}
                title={m.mei.nome}
                texto={m.texto}
                k={`m-${m.mei.id}`}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Por empresa (CNPJ)
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {msgPorEmpresa.map((m) =>
            m.texto ? (
              <MsgCard
                key={m.empresa.id}
                title={m.empresa.nome}
                texto={m.texto}
                k={`e-${m.empresa.id}`}
              />
            ) : null,
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Revenda tab ---------------- */
function Revenda({
  data,
  update,
  mes,
}: {
  data: AppData;
  update: (p: Partial<AppData>) => void;
  mes: string;
}) {
  const [mesRef, setMesRef] = useState<string>(
    () => data.historicoRevenda[0]?.mes ?? "",
  );
  // pedido[produtoId] = quantidade que vou comprar (string)
  const [pedido, setPedido] = useState<Record<string, string>>({});

  const historicoMes = data.historicoRevenda.find((h) => h.mes === mesRef);
  const produtosUsados = listarProdutosRevendaUsados(
    historicoMes,
    data.produtosRevenda,
  );

  const distribuicoes = useMemo(() => {
    return produtosUsados.map((p) => {
      const prop = proporcaoRevenda(historicoMes, p.id, data.empresas);
      const totalQtd = parseInt((pedido[p.id] ?? "").replace(/\D/g, ""), 10) || 0;
      const dist = distribuirRevenda(totalQtd, prop);
      return { produto: p, prop, totalQtd, dist };
    });
  }, [produtosUsados, historicoMes, data.empresas, pedido]);

  const mensagem = useMemo(() => {
    const linhas: string[] = [
      `*Distribuição de revenda — pedidos ${mes}*`,
      `Base: proporção do mês ${mesRef || "—"}`,
      "",
    ];
    distribuicoes
      .filter((d) => d.totalQtd > 0)
      .forEach((d) => {
        linhas.push(`▸ ${d.produto.nome} — total ${fmtInt(d.totalQtd)}`);
        d.dist.forEach((alloc, i) => {
          const e = data.empresas.find((x) => x.id === alloc.empresaId)!;
          const pct = d.prop[i].pct;
          linhas.push(
            `  ${e.nome}: ${fmtInt(alloc.qtd)} (${fmtPct(pct)})`,
          );
        });
        linhas.push("");
      });
    return linhas.join("\n");
  }, [distribuicoes, mes, mesRef, data.empresas]);

  const copyMsg = async () => {
    await navigator.clipboard.writeText(mensagem);
    toast.success("Mensagem copiada");
  };

  return (
    <div className="space-y-6">
      {/* Histórico mensal */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-sm">Histórico de vendas de revenda</h3>
            <p className="text-[11px] text-muted-foreground">
              Registre as vendas do mês anterior por empresa. Essas quantidades
              definem a proporção usada para distribuir os pedidos de nota
              fiscal de revenda.
            </p>
          </div>
        </div>

        <HistoricoRevendaEditor
          historico={data.historicoRevenda}
          setHistorico={(h) => update({ historicoRevenda: h })}
          empresas={data.empresas}
          produtosRevenda={data.produtosRevenda}
          mesSelecionado={mesRef}
          setMesSelecionado={setMesRef}
        />
      </Card>

      {/* Distribuição */}
      <Card className="p-5">
        <div className="flex items-end gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <h3 className="font-semibold text-sm">
              Distribuir pedidos de nota fiscal
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Informe quantas peças de cada produto você vai pedir agora. A
              quantidade é dividida pelas empresas conforme a proporção do mês{" "}
              <strong>{mesRef || "—"}</strong>.
            </p>
          </div>
          <div className="w-40">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Mês de referência
            </Label>
            <Select value={mesRef} onValueChange={setMesRef}>
              <SelectTrigger className="h-9 num">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {data.historicoRevenda.map((h) => (
                  <SelectItem key={h.mes} value={h.mes} className="num">
                    {h.mes}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!historicoMes && (
          <p className="text-sm text-muted-foreground">
            Cadastre um histórico mensal acima para liberar a distribuição.
          </p>
        )}

        {historicoMes && produtosUsados.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum produto com vendas registradas no mês {mesRef}.
          </p>
        )}

        {historicoMes && produtosUsados.length > 0 && (
          <div className="space-y-4">
            {distribuicoes.map((d) => (
              <div
                key={d.produto.id}
                className="border border-border rounded-md overflow-hidden"
              >
                <div className="grid grid-cols-[1fr_160px] gap-3 px-4 py-3 bg-surface-2 items-center">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-4" />
                    <span className="font-medium text-sm">{d.produto.nome}</span>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Vou pedir
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={pedido[d.produto.id] ?? ""}
                      onChange={(e) =>
                        setPedido((p) => ({
                          ...p,
                          [d.produto.id]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      placeholder="0"
                      className="h-8 num text-right"
                    />
                  </div>
                </div>

                <div className="px-4 py-3 space-y-1.5">
                  {d.prop.map((p, i) => {
                    const e = data.empresas.find((x) => x.id === p.empresaId)!;
                    const alloc = d.dist[i];
                    return (
                      <div
                        key={p.empresaId}
                        className="grid grid-cols-[1fr_70px_80px_90px] gap-2 items-center text-sm"
                      >
                        <span>{e.nome}</span>
                        <span className="num text-right text-muted-foreground text-xs">
                          {fmtInt(p.qtd)} vend.
                        </span>
                        <span className="num text-right text-xs text-muted-foreground">
                          {fmtPct(p.pct)}
                        </span>
                        <span
                          className={`num text-right font-semibold ${alloc.qtd > 0 ? "text-success" : "text-muted-foreground"}`}
                        >
                          {fmtInt(alloc.qtd)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <Separator />
            <div className="flex justify-between items-start gap-3">
              <pre className="flex-1 whitespace-pre-wrap text-sm font-mono bg-surface-2 rounded-md p-3 border border-border">
                {mensagem}
              </pre>
              <Button variant="outline" size="sm" onClick={copyMsg}>
                <Copy className="size-3.5 mr-1.5" /> Copiar
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function HistoricoRevendaEditor({
  historico,
  setHistorico,
  empresas,
  produtosRevenda,
  mesSelecionado,
  setMesSelecionado,
}: {
  historico: HistoricoRevendaMes[];
  setHistorico: (h: HistoricoRevendaMes[]) => void;
  empresas: Empresa[];
  produtosRevenda: ProdutoRevenda[];
  mesSelecionado: string;
  setMesSelecionado: (m: string) => void;
}) {
  const [novoMes, setNovoMes] = useState("");

  const addMes = () => {
    const m = novoMes.trim();
    if (!/^\d{2}\/\d{4}$/.test(m)) {
      toast.error("Use o formato MM/AAAA");
      return;
    }
    if (historico.some((h) => h.mes === m)) {
      setMesSelecionado(m);
      setNovoMes("");
      return;
    }
    setHistorico([{ mes: m, vendas: {} }, ...historico]);
    setMesSelecionado(m);
    setNovoMes("");
  };

  const delMes = (m: string) => {
    if (!confirm(`Excluir histórico de ${m}?`)) return;
    const next = historico.filter((h) => h.mes !== m);
    setHistorico(next);
    if (mesSelecionado === m) setMesSelecionado(next[0]?.mes ?? "");
  };

  const setVenda = (
    mes: string,
    empresaId: string,
    produtoId: string,
    val: string,
  ) => {
    const v = parseInt(val.replace(/\D/g, ""), 10) || 0;
    const next = historico.map((h) => {
      if (h.mes !== mes) return h;
      const vendas = { ...h.vendas };
      vendas[empresaId] = { ...(vendas[empresaId] ?? {}), [produtoId]: v };
      return { ...h, vendas };
    });
    setHistorico(next);
  };

  const atual = historico.find((h) => h.mes === mesSelecionado);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Mês ativo
          </Label>
          <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
            <SelectTrigger className="h-9 num">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              {historico.map((h) => (
                <SelectItem key={h.mes} value={h.mes} className="num">
                  {h.mes}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Adicionar mês
            </Label>
            <Input
              value={novoMes}
              onChange={(e) => setNovoMes(e.target.value)}
              placeholder="MM/AAAA"
              className="h-9 w-32 num text-center"
            />
          </div>
          <Button size="sm" variant="outline" onClick={addMes}>
            <Plus className="size-3.5 mr-1" /> Mês
          </Button>
          {mesSelecionado && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => delMes(mesSelecionado)}
              className="text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!atual ? (
        <p className="text-sm text-muted-foreground">
          Adicione um mês para começar a registrar vendas de revenda.
        </p>
      ) : produtosRevenda.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre produtos de revenda em Cadastros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-3 py-2 border border-border font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
                  Produto
                </th>
                {empresas.map((e) => (
                  <th
                    key={e.id}
                    className="text-right px-3 py-2 border border-border font-medium text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    {e.nome}
                  </th>
                ))}
                <th className="text-right px-3 py-2 border border-border font-medium text-[11px] uppercase tracking-wider text-muted-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {produtosRevenda.map((p) => {
                const total = empresas.reduce(
                  (s, e) => s + (atual.vendas[e.id]?.[p.id] ?? 0),
                  0,
                );
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-1.5 border border-border font-medium">
                      {p.nome}
                    </td>
                    {empresas.map((e) => (
                      <td key={e.id} className="px-1.5 py-1 border border-border">
                        <Input
                          inputMode="numeric"
                          value={String(atual.vendas[e.id]?.[p.id] ?? "")}
                          onChange={(ev) =>
                            setVenda(atual.mes, e.id, p.id, ev.target.value)
                          }
                          placeholder="0"
                          className="h-7 num text-right text-sm border-0 bg-transparent focus-visible:bg-surface-2"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 border border-border num text-right font-semibold">
                      {fmtInt(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Cadastros tab ---------------- */
function Cadastros({
  data,
  update,
}: {
  data: AppData;
  update: (p: Partial<AppData>) => void;
}) {
  return (
    <div className="space-y-4">
      <TecidoCard
        nome={data.nomeTecido}
        preco={data.precoTecidoKg}
        setNome={(nomeTecido) => update({ nomeTecido })}
        setPreco={(precoTecidoKg) => update({ precoTecidoKg })}
      />
      <div className="grid lg:grid-cols-3 gap-4">
        <ProdutosCard
          produtos={data.produtos}
          setProdutos={(produtos) => update({ produtos })}
        />
        <EmpresasCard
          empresas={data.empresas}
          setEmpresas={(empresas) => update({ empresas })}
          quantidades={data.quantidades}
          setQuantidades={(quantidades) => update({ quantidades })}
        />
        <MEIsCard meis={data.meis} setMEIs={(meis) => update({ meis })} />
      </div>
      <ProdutosRevendaCard
        produtos={data.produtosRevenda}
        setProdutos={(p) => update({ produtosRevenda: p })}
      />
    </div>
  );
}

function TecidoCard({
  nome,
  preco,
  setNome,
  setPreco,
}: {
  nome: string;
  preco: number;
  setNome: (s: string) => void;
  setPreco: (n: number) => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Package className="size-4" />
        <h3 className="font-semibold text-sm">Matéria-prima · Tecido</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Insumo único usado em todos os produtos. O custo aparece na calculadora
        e nas mensagens.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Nome do tecido
          </Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-9 text-sm"
            placeholder="Suplex"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Preço por KG (R$)
          </Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(Math.max(0, parseFloat(e.target.value) || 0))}
            className="h-9 num text-sm"
          />
        </div>
      </div>
    </Card>
  );
}

function ProdutosCard({
  produtos,
  setProdutos,
}: {
  produtos: Produto[];
  setProdutos: (p: Produto[]) => void;
}) {
  const add = () =>
    setProdutos([
      ...produtos,
      { id: newId(), nome: "Novo produto", rendimento: 1, valor: 0 },
    ]);
  const upd = (id: string, patch: Partial<Produto>) =>
    setProdutos(produtos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => setProdutos(produtos.filter((p) => p.id !== id));

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Package className="size-4" />
          <h3 className="font-semibold text-sm">Produtos</h3>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Rendimento = peças por kg · Valor = R$ por peça
      </p>
      <div className="space-y-3">
        {produtos.map((p) => (
          <div
            key={p.id}
            className="space-y-2 p-3 rounded-md border border-border bg-surface-2"
          >
            <div className="flex gap-2">
              <Input
                value={p.nome}
                onChange={(e) => upd(p.id, { nome: e.target.value })}
                className="h-8 text-sm"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del(p.id)}
                className="h-8 w-8 text-destructive shrink-0"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rendimento
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={p.rendimento}
                  onChange={(e) =>
                    upd(p.id, {
                      rendimento: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="h-8 num text-sm"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Valor (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={p.valor}
                  onChange={(e) =>
                    upd(p.id, {
                      valor: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="h-8 num text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EmpresasCard({
  empresas,
  setEmpresas,
  quantidades,
  setQuantidades,
}: {
  empresas: Empresa[];
  setEmpresas: (e: Empresa[]) => void;
  quantidades: any;
  setQuantidades: (q: any) => void;
}) {
  const add = () =>
    setEmpresas([...empresas, { id: newId(), nome: "Nova empresa" }]);
  const upd = (id: string, patch: Partial<Empresa>) =>
    setEmpresas(empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const del = (id: string) => {
    setEmpresas(empresas.filter((e) => e.id !== id));
    const q = { ...quantidades };
    delete q[id];
    setQuantidades(q);
  };

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4" />
          <h3 className="font-semibold text-sm">Empresas (CNPJ)</h3>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        CNPJs que originam as remessas para industrialização.
      </p>
      <div className="space-y-3">
        {empresas.map((e) => (
          <div
            key={e.id}
            className="space-y-2 p-3 rounded-md border border-border bg-surface-2"
          >
            <div className="flex gap-2">
              <Input
                value={e.nome}
                onChange={(ev) => upd(e.id, { nome: ev.target.value })}
                className="h-8 text-sm"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del(e.id)}
                className="h-8 w-8 text-destructive shrink-0"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Input
              placeholder="CNPJ (opcional)"
              value={e.cnpj ?? ""}
              onChange={(ev) => upd(e.id, { cnpj: ev.target.value })}
              className="h-8 num text-sm"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function MEIsCard({
  meis,
  setMEIs,
}: {
  meis: MEI[];
  setMEIs: (m: MEI[]) => void;
}) {
  const add = () =>
    setMEIs([
      ...meis,
      {
        id: newId(),
        nome: "Novo MEI",
        limiteMensal: 6750,
        jaUsadoMes: 0,
        ativo: true,
      },
    ]);
  const upd = (id: string, patch: Partial<MEI>) =>
    setMEIs(meis.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const del = (id: string) => setMEIs(meis.filter((m) => m.id !== id));
  const zerarMes = () => {
    setMEIs(meis.map((m) => ({ ...m, jaUsadoMes: 0 })));
    toast.success("Valores do mês zerados");
  };

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Users className="size-4" />
          <h3 className="font-semibold text-sm">MEIs</h3>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={zerarMes}
            title="Zerar valores já usados"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={add}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Limite mensal definido por você. Ajuste a qualquer momento.
      </p>
      <div className="space-y-3">
        {meis.map((m) => (
          <div
            key={m.id}
            className={`space-y-2 p-3 rounded-md border bg-surface-2 ${m.ativo ? "border-border" : "border-border opacity-60"}`}
          >
            <div className="flex gap-2 items-center">
              <Input
                value={m.nome}
                onChange={(e) => upd(m.id, { nome: e.target.value })}
                className="h-8 text-sm"
              />
              <Switch
                checked={m.ativo}
                onCheckedChange={(ativo) => upd(m.id, { ativo })}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del(m.id)}
                className="h-8 w-8 text-destructive shrink-0"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Limite mês (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={m.limiteMensal}
                  onChange={(e) =>
                    upd(m.id, {
                      limiteMensal: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="h-8 num text-sm"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Já usado (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={m.jaUsadoMes}
                  onChange={(e) =>
                    upd(m.id, {
                      jaUsadoMes: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="h-8 num text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] num text-muted-foreground">
              Disponível:{" "}
              <span className="text-success font-medium">
                R$ {fmtBRL(Math.max(0, m.limiteMensal - m.jaUsadoMes))}
              </span>
            </p>
          </div>
        ))}
      </div>
      <Separator className="my-4" />
      <p className="text-[11px] text-muted-foreground">
        Dados salvos neste navegador. Histórico e login virão com Supabase.
      </p>
    </Card>
  );
}

function ProdutosRevendaCard({
  produtos,
  setProdutos,
}: {
  produtos: ProdutoRevenda[];
  setProdutos: (p: ProdutoRevenda[]) => void;
}) {
  const add = () =>
    setProdutos([...produtos, { id: newId(), nome: "Novo produto" }]);
  const upd = (id: string, nome: string) =>
    setProdutos(produtos.map((p) => (p.id === id ? { ...p, nome } : p)));
  const del = (id: string) => setProdutos(produtos.filter((p) => p.id !== id));

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-4" />
          <h3 className="font-semibold text-sm">Produtos de revenda</h3>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Itens que você compra de terceiros (samba canção, camisa térmica, etc.)
        e precisa pedir nota fiscal de revenda.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {produtos.map((p) => (
          <div key={p.id} className="flex gap-2">
            <Input
              value={p.nome}
              onChange={(e) => upd(p.id, e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => del(p.id)}
              className="h-8 w-8 text-destructive shrink-0"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
