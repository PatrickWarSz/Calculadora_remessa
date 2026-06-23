import { useEffect, useMemo, useState } from "react";
import type { AppData } from "@/lib/storage";
import { loadData, saveData } from "@/lib/storage";
import { calcEmpresa, calcTotaisProduto, distribuirMEIs, fmtBRL, fmtKg, fmtInt, parseQtd } from "@/lib/calc";
import type { Produto, Empresa, MEI } from "@/lib/types";
import { newId } from "@/lib/storage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calculator, Settings2, MessageSquare, FileDown, Trash2, Plus, RotateCcw, Building2, Users, Package, Copy, Check } from "lucide-react";
import { toast, Toaster } from "sonner";
import jsPDF from "jspdf";

export default function CalculadoraApp() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  });

  useEffect(() => {
    saveData(data);
  }, [data]);

  const update = (patch: Partial<AppData>) => setData((d) => ({ ...d, ...patch }));

  const resumos = useMemo(
    () => data.empresas.map((e) => calcEmpresa(e, data.produtos, data.quantidades)),
    [data.empresas, data.produtos, data.quantidades],
  );

  const totalKg = resumos.reduce((s, r) => s + r.totalKg, 0);
  const totalValor = resumos.reduce((s, r) => s + r.totalValor, 0);
  const porProduto = calcTotaisProduto(data.produtos, resumos);
  const dist = useMemo(() => distribuirMEIs(totalValor, data.meis), [totalValor, data.meis]);

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
              <Label htmlFor="mes" className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
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
            <TabsTrigger value="calc"><Calculator className="size-4 mr-1.5" />Calculadora</TabsTrigger>
            <TabsTrigger value="msg"><MessageSquare className="size-4 mr-1.5" />Mensagem</TabsTrigger>
            <TabsTrigger value="cadastros"><Settings2 className="size-4 mr-1.5" />Cadastros</TabsTrigger>
          </TabsList>

          <TabsContent value="calc" className="space-y-6">
            <Calculadora
              data={data}
              update={update}
              resumos={resumos}
              totalKg={totalKg}
              totalValor={totalValor}
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
              dist={dist}
              mes={mes}
            />
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
function Calculadora({
  data, update, resumos, totalKg, totalValor, porProduto, dist, mes,
}: {
  data: AppData;
  update: (p: Partial<AppData>) => void;
  resumos: ReturnType<typeof calcEmpresa>[] extends infer T ? T : never;
  totalKg: number; totalValor: number;
  porProduto: ReturnType<typeof calcTotaisProduto>;
  dist: ReturnType<typeof distribuirMEIs>;
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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(e.nome, m, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      r.itens.forEach((it) => {
        const p = data.produtos.find((x) => x.id === it.produtoId);
        if (!p || it.qtd === 0) return;
        doc.text(
          `${p.nome.padEnd(14)}  ${fmtInt(it.qtd).padStart(6)} pç   ${fmtKg(it.kg).padStart(8)} kg   R$ ${fmtBRL(it.valor).padStart(10)}`,
          m, y,
        );
        y += 13;
      });
      doc.setFont("helvetica", "bold");
      doc.text(`Subtotal: ${fmtKg(r.totalKg)} kg  ·  R$ ${fmtBRL(r.totalValor)}`, m, y);
      y += 22;
    });

    doc.setDrawColor(180);
    doc.line(m, y, 595 - m, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`TOTAL: ${fmtKg(totalKg)} kg  ·  R$ ${fmtBRL(totalValor)}`, m, y);
    y += 22;

    if (dist.alocacoes.length) {
      doc.setFontSize(11);
      doc.text("Distribuição entre MEIs", m, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      dist.alocacoes.forEach((a) => {
        const mei = data.meis.find((x) => x.id === a.meiId);
        if (!mei) return;
        doc.text(`${mei.nome.padEnd(14)} R$ ${fmtBRL(a.valor).padStart(10)}   (limite R$ ${fmtBRL(a.limite)})`, m, y);
        y += 13;
      });
      if (dist.excedente > 0.01) {
        doc.setTextColor(180, 40, 40);
        doc.text(`Excedente não alocado: R$ ${fmtBRL(dist.excedente)}`, m, y); y += 13;
        doc.setTextColor(0);
      }
    }

    doc.save(`remessa-${mes.replace("/", "-")}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Informe a quantidade de peças vendidas no mês anterior por CNPJ.
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
        return (
          <Card key={empresa.id} className="overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_120px_110px_130px] gap-2 px-5 py-3 bg-surface-2 border-b border-border items-center">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-success" />
                <span className="font-medium text-sm">{empresa.nome}</span>
                {empresa.cnpj && (
                  <span className="text-[11px] num text-muted-foreground">{empresa.cnpj}</span>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Qtd. peças</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">KG</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Valor R$</span>
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
                  <span className={`num text-right text-sm ${it.qtd > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {it.qtd > 0 ? fmtKg(it.kg) : "—"}
                  </span>
                  <span className={`num text-right text-sm font-medium ${it.qtd > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {it.qtd > 0 ? `R$ ${fmtBRL(it.valor)}` : "—"}
                  </span>
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_120px_110px_130px] gap-2 px-5 py-3 bg-surface-2 border-t border-border items-center">
              <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
              <span />
              <span className="num text-right text-sm font-semibold">{fmtKg(r.totalKg)} kg</span>
              <span className="num text-right text-sm font-semibold text-success">R$ {fmtBRL(r.totalValor)}</span>
            </div>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total KG · Suplex</p>
          <p className="num text-3xl font-semibold mt-1.5">
            {fmtKg(totalKg)} <span className="text-sm text-muted-foreground font-normal">kg</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">Saída de estoque na nota</p>
        </Card>
        <Card className="p-5 bg-success/5 border-success/20">
          <p className="text-[11px] uppercase tracking-wider text-success">Valor Total · NF</p>
          <p className="num text-3xl font-semibold mt-1.5 text-success">
            <span className="text-base font-normal">R$ </span>{fmtBRL(totalValor)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">Soma das 3 empresas</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Peças</p>
          <p className="num text-3xl font-semibold mt-1.5">
            {fmtInt(porProduto.reduce((s, p) => s + p.qtd, 0))}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            {porProduto.filter(p => p.qtd > 0).map(p => `${p.produto.nome}: ${fmtInt(p.qtd)}`).join(" · ")}
          </p>
        </Card>
      </div>

      {totalValor > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm">Distribuição entre MEIs</h3>
              <p className="text-[11px] text-muted-foreground">
                Automática proporcional, respeitando o limite mensal de cada MEI.
              </p>
            </div>
            {dist.excedente > 0.01 && (
              <span className="text-[11px] px-2 py-1 rounded bg-destructive/10 text-destructive font-medium">
                Excedente: R$ {fmtBRL(dist.excedente)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {dist.alocacoes.map((a) => {
              const mei = data.meis.find((m) => m.id === a.meiId);
              if (!mei) return null;
              const pct = a.limite > 0 ? Math.min(100, ((mei.jaUsadoMes + a.valor) / a.limite) * 100) : 0;
              const pctUsado = a.limite > 0 ? (mei.jaUsadoMes / a.limite) * 100 : 0;
              return (
                <div key={a.meiId} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{mei.nome}</span>
                    <span className="num">
                      <span className="text-success font-semibold">R$ {fmtBRL(a.valor)}</span>
                      <span className="text-muted-foreground"> / R$ {fmtBRL(a.limite)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-muted-foreground/30" style={{ width: `${pctUsado}%` }} />
                    <div className="absolute inset-y-0 bg-success" style={{ left: `${pctUsado}%`, width: `${pct - pctUsado}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {data.meis.filter(m => m.ativo).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum MEI ativo. Cadastre em Cadastros → MEIs.</p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ---------------- Mensagem tab ---------------- */
function Mensagens({
  data, resumos, porProduto, totalValor, totalKg, dist, mes,
}: {
  data: AppData;
  resumos: ReturnType<typeof calcEmpresa>[];
  porProduto: ReturnType<typeof calcTotaisProduto>;
  totalValor: number;
  totalKg: number;
  dist: ReturnType<typeof distribuirMEIs>;
  mes: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const linhaProduto = (nome: string, qtd: number, preco: number, valor: number) =>
    `${nome} ${fmtInt(qtd)} = R$${fmtBRL(preco)} cada = R$${fmtBRL(valor)} reais`;

  const msgConsolidada = useMemo(() => {
    const linhas = porProduto
      .filter((p) => p.qtd > 0)
      .map((p) => linhaProduto(p.produto.nome, p.qtd, p.produto.valor, p.valor));
    return [
      `*Remessa ${mes}*`,
      "",
      ...linhas,
      "",
      `Total: ${fmtKg(totalKg)} kg · R$ ${fmtBRL(totalValor)}`,
    ].join("\n");
  }, [porProduto, totalKg, totalValor, mes]);

  const msgPorEmpresa = useMemo(() => {
    return data.empresas.map((e, i) => {
      const r = resumos[i];
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
                "",
                ...linhas,
                "",
                `Total: ${fmtKg(r.totalKg)} kg · R$ ${fmtBRL(r.totalValor)}`,
              ].join("\n"),
      };
    });
  }, [data.empresas, data.produtos, resumos, mes]);

  const msgPorMEI = useMemo(() => {
    return dist.alocacoes
      .filter((a) => a.valor > 0.01)
      .map((a) => {
        const mei = data.meis.find((m) => m.id === a.meiId)!;
        return {
          mei,
          texto: [
            `*${mei.nome} — Remessa ${mes}*`,
            "",
            `Valor a faturar: R$ ${fmtBRL(a.valor)}`,
            `Limite mensal: R$ ${fmtBRL(a.limite)}`,
          ].join("\n"),
        };
      });
  }, [dist.alocacoes, data.meis, mes]);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copiado para a área de transferência");
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

  const MsgCard = ({ title, subtitle, texto, k }: { title: string; subtitle?: string; texto: string; k: string }) => (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-sm">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => copy(k, texto)}>
          {copied === k ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
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
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Consolidada</h2>
        <MsgCard title="Mensagem consolidada" subtitle="Soma de todas as empresas" texto={msgConsolidada} k="cons" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Por empresa (CNPJ)</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {msgPorEmpresa.map((m) =>
            m.texto ? (
              <MsgCard key={m.empresa.id} title={m.empresa.nome} texto={m.texto} k={`e-${m.empresa.id}`} />
            ) : null,
          )}
        </div>
      </section>

      {msgPorMEI.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Por MEI (distribuição)</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {msgPorMEI.map((m) => (
              <MsgCard key={m.mei.id} title={m.mei.nome} texto={m.texto} k={`m-${m.mei.id}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Cadastros tab ---------------- */
function Cadastros({ data, update }: { data: AppData; update: (p: Partial<AppData>) => void }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <ProdutosCard produtos={data.produtos} setProdutos={(produtos) => update({ produtos })} />
      <EmpresasCard
        empresas={data.empresas}
        setEmpresas={(empresas) => update({ empresas })}
        quantidades={data.quantidades}
        setQuantidades={(quantidades) => update({ quantidades })}
      />
      <MEIsCard meis={data.meis} setMEIs={(meis) => update({ meis })} />
    </div>
  );
}

function ProdutosCard({ produtos, setProdutos }: { produtos: Produto[]; setProdutos: (p: Produto[]) => void }) {
  const add = () => setProdutos([...produtos, { id: newId(), nome: "Novo produto", rendimento: 1, valor: 0 }]);
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
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Rendimento = peças por kg de tecido · Valor = R$ por peça
      </p>
      <div className="space-y-3">
        {produtos.map((p) => (
          <div key={p.id} className="space-y-2 p-3 rounded-md border border-border bg-surface-2">
            <div className="flex gap-2">
              <Input value={p.nome} onChange={(e) => upd(p.id, { nome: e.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => del(p.id)} className="h-8 w-8 text-destructive shrink-0">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rendimento</Label>
                <Input
                  type="number" inputMode="numeric" value={p.rendimento}
                  onChange={(e) => upd(p.id, { rendimento: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="h-8 num text-sm"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor (R$)</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" value={p.valor}
                  onChange={(e) => upd(p.id, { valor: Math.max(0, parseFloat(e.target.value) || 0) })}
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
  empresas, setEmpresas, quantidades, setQuantidades,
}: {
  empresas: Empresa[]; setEmpresas: (e: Empresa[]) => void;
  quantidades: any; setQuantidades: (q: any) => void;
}) {
  const add = () => setEmpresas([...empresas, { id: newId(), nome: "Nova empresa" }]);
  const upd = (id: string, patch: Partial<Empresa>) =>
    setEmpresas(empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const del = (id: string) => {
    setEmpresas(empresas.filter((e) => e.id !== id));
    const q = { ...quantidades }; delete q[id]; setQuantidades(q);
  };

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4" />
          <h3 className="font-semibold text-sm">Empresas (CNPJ)</h3>
        </div>
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        CNPJs que originam as remessas para industrialização.
      </p>
      <div className="space-y-3">
        {empresas.map((e) => (
          <div key={e.id} className="space-y-2 p-3 rounded-md border border-border bg-surface-2">
            <div className="flex gap-2">
              <Input value={e.nome} onChange={(ev) => upd(e.id, { nome: ev.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => del(e.id)} className="h-8 w-8 text-destructive shrink-0">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Input
              placeholder="CNPJ (opcional)" value={e.cnpj ?? ""}
              onChange={(ev) => upd(e.id, { cnpj: ev.target.value })}
              className="h-8 num text-sm"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function MEIsCard({ meis, setMEIs }: { meis: MEI[]; setMEIs: (m: MEI[]) => void }) {
  const add = () => setMEIs([...meis, { id: newId(), nome: "Novo MEI", limiteMensal: 6750, jaUsadoMes: 0, ativo: true }]);
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
          <Button size="sm" variant="ghost" onClick={zerarMes} title="Zerar valores já usados">
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Limite mensal varia conforme o teto MEI / acordo. Ajuste a qualquer momento.
      </p>
      <div className="space-y-3">
        {meis.map((m) => (
          <div key={m.id} className={`space-y-2 p-3 rounded-md border bg-surface-2 ${m.ativo ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex gap-2 items-center">
              <Input value={m.nome} onChange={(e) => upd(m.id, { nome: e.target.value })} className="h-8 text-sm" />
              <Switch checked={m.ativo} onCheckedChange={(ativo) => upd(m.id, { ativo })} />
              <Button size="icon" variant="ghost" onClick={() => del(m.id)} className="h-8 w-8 text-destructive shrink-0">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Limite mês (R$)</Label>
                <Input
                  type="number" step="0.01" value={m.limiteMensal}
                  onChange={(e) => upd(m.id, { limiteMensal: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="h-8 num text-sm"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Já usado (R$)</Label>
                <Input
                  type="number" step="0.01" value={m.jaUsadoMes}
                  onChange={(e) => upd(m.id, { jaUsadoMes: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="h-8 num text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] num text-muted-foreground">
              Disponível: <span className="text-success font-medium">R$ {fmtBRL(Math.max(0, m.limiteMensal - m.jaUsadoMes))}</span>
            </p>
          </div>
        ))}
      </div>
      <Separator className="my-4" />
      <p className="text-[11px] text-muted-foreground">
        Todos os dados ficam salvos neste navegador (localStorage). Histórico mensal e login virão quando o Supabase for ativado.
      </p>
    </Card>
  );
}
