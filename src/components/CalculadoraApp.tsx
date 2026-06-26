import { useEffect, useMemo, useRef, useState } from "react";
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
  proporcaoRevendaFechamento,
} from "@/lib/calc";
import {
  agregarVendas,
  aplicarImportFechamento,
  detectarEmpresa,
  lerPlanilhaVendas,
} from "@/lib/xlsxImport";
import type {
  Empresa,
  Fechamento,
  MEI,
  NotaRevenda,
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
  FileSpreadsheet,
  MessageSquare,
  Package,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import jsPDF from "jspdf";

export default function CalculadoraApp() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [mes, setMes] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setData(loadData());
    const savedMes = window.localStorage.getItem(MES_KEY);
    if (savedMes) setMes(savedMes);
    else {
      const d = new Date();
      setMes(`${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
    }
    setMounted(true);
  }, []);

  useEffect(() => { if (mounted) saveData(data); }, [data, mounted]);
  useEffect(() => { if (mounted && mes) window.localStorage.setItem(MES_KEY, mes); }, [mes, mounted]);

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
              <Label htmlFor="mes" className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                Mês ativo
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
        {!mounted ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
        <Tabs defaultValue="fech" className="space-y-6">
          <TabsList className="bg-surface-2 border border-border flex-wrap h-auto">
            <TabsTrigger value="fech"><FileSpreadsheet className="size-4 mr-1.5" />Fechamento</TabsTrigger>
            <TabsTrigger value="calc"><Calculator className="size-4 mr-1.5" />Remessa</TabsTrigger>
            <TabsTrigger value="msg"><MessageSquare className="size-4 mr-1.5" />Mensagem</TabsTrigger>
            <TabsTrigger value="revenda"><ShoppingBag className="size-4 mr-1.5" />Revenda</TabsTrigger>
            <TabsTrigger value="cadastros"><Settings2 className="size-4 mr-1.5" />Cadastros</TabsTrigger>
          </TabsList>

          <TabsContent value="fech" className="space-y-6">
            <FechamentoTab data={data} update={update} mes={mes} />
          </TabsContent>

          <TabsContent value="calc" className="space-y-6">
            <Calculadora
              data={data} update={update}
              resumos={resumos} totalKg={totalKg} totalValor={totalValor}
              totalTecido={totalTecido} porProduto={porProduto} dist={dist} mes={mes}
            />
          </TabsContent>

          <TabsContent value="msg">
            <Mensagens
              data={data} resumos={resumos} porProduto={porProduto}
              totalValor={totalValor} totalKg={totalKg} totalTecido={totalTecido}
              dist={dist} mes={mes}
            />
          </TabsContent>

          <TabsContent value="revenda">
            <Revenda data={data} update={update} mes={mes} />
          </TabsContent>

          <TabsContent value="cadastros">
            <Cadastros data={data} update={update} />
          </TabsContent>
        </Tabs>
        )}
      </main>
    </div>
  );
}

/* ============================================================
   FECHAMENTO TAB — Import das planilhas .xls do ERP
============================================================ */
function FechamentoTab({
  data, update, mes,
}: { data: AppData; update: (p: Partial<AppData>) => void; mes: string }) {
  const fechamento: Fechamento | undefined = data.fechamentos[mes];

  const handleImport = async (empresaId: string, file: File) => {
    try {
      const linhas = await lerPlanilhaVendas(file);
      if (linhas.length === 0) {
        toast.error("Planilha vazia ou formato não reconhecido");
        return;
      }
      const result = agregarVendas(linhas, data.mapeamentoGrupo);
      const novoFech = aplicarImportFechamento(fechamento, mes, empresaId, result);
      update({ fechamentos: { ...data.fechamentos, [mes]: novoFech } });
      const empNome = data.empresas.find((e) => e.id === empresaId)?.nome ?? "";
      toast.success(
        `${empNome}: ${linhas.length} linhas importadas` +
          (result.pendentes.length ? ` · ${result.pendentes.length} pendentes` : ""),
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler planilha");
    }
  };

  const handleFile = async (file: File) => {
    const empresa = detectarEmpresa(file.name, data.empresas);
    if (!empresa) {
      toast.error(`Não identifiquei a empresa do arquivo "${file.name}". Use o botão da empresa correta.`);
      return;
    }
    await handleImport(empresa.id, file);
  };

  const limparFechamento = () => {
    if (!confirm(`Apagar fechamento de ${mes}?`)) return;
    const next = { ...data.fechamentos };
    delete next[mes];
    update({ fechamentos: next });
  };

  // agregado: produtoId -> total
  const agregado = useMemo(() => {
    const out: Record<string, number> = {};
    if (!fechamento) return out;
    for (const empVendas of Object.values(fechamento.vendas)) {
      for (const [pid, item] of Object.entries(empVendas)) {
        out[pid] = (out[pid] ?? 0) + item.total;
      }
    }
    return out;
  }, [fechamento]);

  const aplicarNaRemessa = () => {
    if (!fechamento) return;
    const novasQtds: Record<string, Record<string, string>> = { ...data.quantidades };
    for (const empresa of data.empresas) {
      const vendasEmp = fechamento.vendas[empresa.id] ?? {};
      const linhaQtd: Record<string, string> = {};
      for (const produto of data.produtos) {
        const v = vendasEmp[produto.id]?.total ?? 0;
        if (v > 0) linhaQtd[produto.id] = String(v);
      }
      novasQtds[empresa.id] = linhaQtd;
    }
    update({ quantidades: novasQtds });
    toast.success(`Quantidades aplicadas à Remessa de ${mes}`);
  };

  // pendentes acumulados
  const todosPendentes = useMemo(() => {
    if (!fechamento) return [] as { empresaId: string; grupo: string; descricao: string; qtd: number }[];
    const out: { empresaId: string; grupo: string; descricao: string; qtd: number }[] = [];
    for (const [eid, lista] of Object.entries(fechamento.pendentes)) {
      for (const p of lista) out.push({ empresaId: eid, ...p });
    }
    return out;
  }, [fechamento]);

  const mapearGrupo = (grupo: string, produtoId: string) => {
    const novoMapa = { ...data.mapeamentoGrupo, [grupo]: produtoId };
    // reaggregar todas as empresas do fechamento atual com novo mapa
    if (!fechamento) {
      update({ mapeamentoGrupo: novoMapa });
      return;
    }
    const novoFech: Fechamento = { ...fechamento, vendas: { ...fechamento.vendas }, pendentes: { ...fechamento.pendentes } };
    // só conseguimos reaggregar se tivermos as linhas originais — não temos mais.
    // alternativa: mover as pendentes desse grupo para vendas
    const todosProdutos = [...data.produtos.map(p => ({id: p.id, tamanhos: [] as string[]})), ...data.produtosRevenda.map(p => ({id: p.id, tamanhos: p.tamanhos}))];
    const _ = todosProdutos;
    for (const [eid, lista] of Object.entries(novoFech.pendentes)) {
      const ainda: { grupo: string; descricao: string; qtd: number }[] = [];
      const vendasEmp = { ...(novoFech.vendas[eid] ?? {}) };
      for (const p of lista) {
        if (p.grupo === grupo) {
          const cur = vendasEmp[produtoId] ?? { total: 0, porTamanho: {} as Record<string, number> };
          const tam = detectTam(p.descricao);
          const novoPorTam = { ...cur.porTamanho };
          const k = tam ?? "—";
          novoPorTam[k] = (novoPorTam[k] ?? 0) + p.qtd;
          vendasEmp[produtoId] = { total: cur.total + p.qtd, porTamanho: novoPorTam };
        } else ainda.push(p);
      }
      novoFech.vendas[eid] = vendasEmp;
      novoFech.pendentes[eid] = ainda;
    }
    update({
      mapeamentoGrupo: novoMapa,
      fechamentos: { ...data.fechamentos, [mes]: novoFech },
    });
    toast.success(`Grupo "${grupo}" mapeado`);
  };

  const todosProdutosOpts = useMemo(
    () => [
      ...data.produtos.map((p) => ({ id: p.id, nome: p.nome, tipo: "Próprio" })),
      ...data.produtosRevenda.map((p) => ({ id: p.id, nome: p.nome, tipo: "Revenda" })),
    ],
    [data.produtos, data.produtosRevenda],
  );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-sm">Importar planilhas do mês {mes || "—"}</h3>
            <p className="text-[11px] text-muted-foreground">
              Aceita o .xls do ERP com colunas <em>Código, Descrição, Quant., Marca, Grupo</em>.
              Detecta a empresa pelo nome do arquivo e mapeia o Grupo para o produto cadastrado.
            </p>
          </div>
          {fechamento && (
            <Button variant="ghost" size="sm" onClick={limparFechamento} className="text-destructive">
              <Trash2 className="size-3.5 mr-1.5" /> Apagar mês
            </Button>
          )}
        </div>

        <DropZone onFiles={async (files) => { for (const f of files) await handleFile(f); }} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          {data.empresas.map((e) => {
            const importedAt = fechamento?.importadoEm[e.id];
            const vendas = fechamento?.vendas[e.id] ?? {};
            const totalProdutos = Object.keys(vendas).length;
            return (
              <div key={e.id} className="rounded-md border border-border p-3 bg-surface-2">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="size-3.5 text-success" />
                  <span className="text-sm font-medium truncate">{e.nome}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2 num">
                  {importedAt
                    ? `${totalProdutos} produto(s) · ${new Date(importedAt).toLocaleDateString("pt-BR")}`
                    : "Sem import"}
                </p>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden"
                    onChange={async (ev) => {
                      const f = ev.target.files?.[0];
                      if (f) await handleImport(e.id, f);
                      ev.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center text-xs px-2 py-1 rounded border border-border cursor-pointer hover:bg-surface">
                    <Upload className="size-3 mr-1" /> Importar
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </Card>

      {fechamento && (
        <>
          <Card className="p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">Total agregado · {mes}</h3>
              <Button size="sm" onClick={aplicarNaRemessa}>
                <Calculator className="size-3.5 mr-1.5" /> Aplicar à aba Remessa
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="text-left px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">Produto</th>
                    {data.empresas.map((e) => (
                      <th key={e.id} className="text-right px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">{e.nome}</th>
                    ))}
                    <th className="text-right px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.produtos, ...data.produtosRevenda].map((p) => {
                    const total = agregado[p.id] ?? 0;
                    if (total === 0) return null;
                    const isRev = data.produtosRevenda.some((r) => r.id === p.id);
                    return (
                      <tr key={p.id} className={isRev ? "bg-accent/5" : ""}>
                        <td className="px-3 py-1.5 border-b border-border font-medium">
                          {p.nome}
                          {isRev && <span className="ml-2 text-[10px] text-muted-foreground">(revenda)</span>}
                        </td>
                        {data.empresas.map((e) => {
                          const v = fechamento.vendas[e.id]?.[p.id]?.total ?? 0;
                          return <td key={e.id} className="px-3 py-1.5 border-b border-border num text-right">{v > 0 ? fmtInt(v) : "—"}</td>;
                        })}
                        <td className="px-3 py-1.5 border-b border-border num text-right font-semibold">{fmtInt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {todosPendentes.length > 0 && (
            <Card className="p-5 border-destructive/30 bg-destructive/5">
              <h3 className="font-semibold text-sm mb-1">Grupos não mapeados ({todosPendentes.length})</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                Mapeie cada Grupo para um produto cadastrado. O mapeamento fica salvo e vale pros próximos imports.
              </p>
              <div className="space-y-2">
                {Array.from(new Map(todosPendentes.map((p) => [p.grupo, p])).values()).map((p) => {
                  const totalGrupo = todosPendentes.filter((x) => x.grupo === p.grupo).reduce((s, x) => s + x.qtd, 0);
                  return (
                    <div key={p.grupo} className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-mono px-2 py-1 rounded bg-surface-2 border border-border">{p.grupo}</span>
                      <span className="text-[11px] text-muted-foreground flex-1 truncate">{p.descricao}</span>
                      <span className="text-[11px] num text-muted-foreground">{fmtInt(totalGrupo)} pç</span>
                      <Select onValueChange={(v) => mapearGrupo(p.grupo, v)}>
                        <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Mapear para…" /></SelectTrigger>
                        <SelectContent>
                          {todosProdutosOpts.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.nome} <span className="text-muted-foreground">({o.tipo})</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function detectTam(desc: string): string | null {
  const m = /\s(P\/M|G\/GG|XGG|XXG|GGG|PP|GG|XG|P|M|G)$/i.exec(desc.trim());
  return m ? m[1].toUpperCase() : null;
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => /\.xlsx?$/i.test(f.name));
        if (files.length) onFiles(files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition ${
        over ? "border-success bg-success/5" : "border-border bg-surface-2"
      }`}
    >
      <Upload className="size-5 mx-auto text-muted-foreground mb-1" />
      <p className="text-sm">Arraste os .xls aqui ou clique para selecionar</p>
      <p className="text-[11px] text-muted-foreground">Vários arquivos de uma vez — eu detecto a empresa pelo nome</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ============================================================
   REMESSA (antiga Calculadora) — mantém comportamento manual
============================================================ */
type ResumoArr = ReturnType<typeof calcEmpresa>[];
type DistMan = ReturnType<typeof distribuirMEIsManual>;

function Calculadora({
  data, update, resumos, totalKg, totalValor, totalTecido, porProduto, dist, mes,
}: {
  data: AppData; update: (p: Partial<AppData>) => void;
  resumos: ResumoArr; totalKg: number; totalValor: number; totalTecido: number;
  porProduto: ReturnType<typeof calcTotaisProduto>; dist: DistMan; mes: string;
}) {
  const setQtd = (empresaId: string, produtoId: string, val: string) => {
    const v = val.replace(/\D/g, "");
    update({
      quantidades: { ...data.quantidades, [empresaId]: { ...(data.quantidades[empresaId] ?? {}), [produtoId]: v } },
    });
  };
  const setMeiEmpresa = (empresaId: string, meiId: string) => {
    update({ meiPorEmpresa: { ...data.meiPorEmpresa, [empresaId]: meiId === "__none__" ? "" : meiId } });
  };
  const limpar = () => { update({ quantidades: {} }); toast.success("Quantidades zeradas"); };

  const exportarPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const m = 48; let y = m;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Resumo de Remessa para Industrialização", m, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Mês: ${mes}`, m, y); y += 22;
    data.empresas.forEach((e, idx) => {
      const r = resumos[idx]; if (r.totalValor === 0) return;
      const meiNome = data.meis.find((x) => x.id === data.meiPorEmpresa[e.id])?.nome ?? "—";
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(`${e.nome}   [MEI: ${meiNome}]`, m, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      r.itens.forEach((it) => {
        const p = data.produtos.find((x) => x.id === it.produtoId);
        if (!p || it.qtd === 0) return;
        doc.text(`${p.nome.padEnd(14)}  ${fmtInt(it.qtd).padStart(6)} pç   ${fmtKg(it.kg).padStart(8)} kg   R$ ${fmtBRL(it.valor).padStart(10)}`, m, y);
        y += 13;
      });
      doc.setFont("helvetica", "bold");
      doc.text(`Subtotal: ${fmtKg(r.totalKg)} kg  ·  R$ ${fmtBRL(r.totalValor)}`, m, y); y += 22;
    });
    doc.setDrawColor(180); doc.line(m, y, 595 - m, y); y += 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`TOTAL: ${fmtKg(totalKg)} kg  ·  R$ ${fmtBRL(totalValor)}`, m, y); y += 16;
    if (data.precoTecidoKg > 0) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(`Tecido ${data.nomeTecido}: ${fmtKg(totalKg)} kg × R$ ${fmtBRL(data.precoTecidoKg)}/kg = R$ ${fmtBRL(totalTecido)}`, m, y); y += 18;
    }
    doc.save(`remessa-${mes.replace("/", "-")}.pdf`);
  };

  const meiNome = (id: string) => data.meis.find((m) => m.id === id)?.nome ?? "";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Quantidades por CNPJ + MEI que vai faturar. Use a aba <strong>Fechamento</strong> para puxar automaticamente do ERP.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={limpar}><RotateCcw className="size-3.5 mr-1.5" /> Limpar</Button>
          <Button size="sm" onClick={exportarPdf} disabled={totalValor === 0}><FileDown className="size-3.5 mr-1.5" /> PDF</Button>
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
                {empresa.cnpj && <span className="text-[11px] num text-muted-foreground">{empresa.cnpj}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">MEI</Label>
                <Select value={meiId || "__none__"} onValueChange={(v) => setMeiEmpresa(empresa.id, v)}>
                  <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder="Selecionar MEI" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sem MEI —</SelectItem>
                    {data.meis.filter((m) => m.ativo).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome} <span className="text-muted-foreground">(R$ {fmtBRL(m.limiteMensal)})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_120px_110px_130px] gap-2 px-5 py-2 border-b border-border">
              <span />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Qtd. peças</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">KG</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Valor R$</span>
            </div>

            {data.produtos.map((p, pIdx) => {
              const it = r.itens.find((i) => i.produtoId === p.id)!;
              const last = pIdx === data.produtos.length - 1;
              return (
                <div key={p.id} className={`grid grid-cols-[1fr_120px_110px_130px] gap-2 items-center px-5 py-3 ${last ? "" : "border-b border-border"}`}>
                  <div>
                    <span className="font-medium text-sm">{p.nome}</span>
                    <span className="ml-2 text-[11px] num text-muted-foreground">÷{p.rendimento} · ×R$ {fmtBRL(p.valor)}</span>
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
              <span className="text-sm font-medium text-muted-foreground">
                Subtotal {meiId ? `→ ${meiNome(meiId)}` : ""}
              </span>
              <span />
              <span className="num text-right text-sm font-semibold">{fmtKg(r.totalKg)} kg</span>
              <span className="num text-right text-sm font-semibold text-success">R$ {fmtBRL(r.totalValor)}</span>
            </div>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total KG · {data.nomeTecido}</p>
          <p className="num text-3xl font-semibold mt-1.5">{fmtKg(totalKg)} <span className="text-sm text-muted-foreground font-normal">kg</span></p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Custo do tecido</p>
          <p className="num text-3xl font-semibold mt-1.5"><span className="text-base font-normal">R$ </span>{fmtBRL(totalTecido)}</p>
          <p className="text-[11px] num text-muted-foreground mt-2">{fmtKg(totalKg)} kg × R$ {fmtBRL(data.precoTecidoKg)}/kg</p>
        </Card>
        <Card className="p-5 bg-success/5 border-success/20">
          <p className="text-[11px] uppercase tracking-wider text-success">Valor Total · NF</p>
          <p className="num text-3xl font-semibold mt-1.5 text-success"><span className="text-base font-normal">R$ </span>{fmtBRL(totalValor)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Peças</p>
          <p className="num text-3xl font-semibold mt-1.5">{fmtInt(porProduto.reduce((s, p) => s + p.qtd, 0))}</p>
        </Card>
      </div>

      {totalValor > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm">Distribuição entre MEIs</h3>
              <p className="text-[11px] text-muted-foreground">Cada empresa vai inteira para o MEI selecionado acima.</p>
            </div>
            {dist.naoAtribuido.valor > 0.01 && (
              <span className="text-[11px] px-2 py-1 rounded bg-destructive/10 text-destructive font-medium">
                Sem MEI: R$ {fmtBRL(dist.naoAtribuido.valor)}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {dist.alocacoes.map((a) => {
              const mei = data.meis.find((m) => m.id === a.meiId); if (!mei) return null;
              const totalUso = a.jaUsadoMes + a.valor;
              const pct = a.limite > 0 ? Math.min(100, (totalUso / a.limite) * 100) : 0;
              const pctUsado = a.limite > 0 ? (a.jaUsadoMes / a.limite) * 100 : 0;
              const empresasNomes = a.empresaIds.map((id) => data.empresas.find((e) => e.id === id)?.nome).filter(Boolean).join(", ");
              return (
                <div key={a.meiId} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium">{mei.nome}</span>
                      {empresasNomes && <span className="ml-2 text-[11px] text-muted-foreground">← {empresasNomes}</span>}
                    </div>
                    <span className="num">
                      <span className={`font-semibold ${a.estouro > 0 ? "text-destructive" : "text-success"}`}>R$ {fmtBRL(a.valor)}</span>
                      <span className="text-muted-foreground"> / R$ {fmtBRL(a.limite)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-muted-foreground/30" style={{ width: `${pctUsado}%` }} />
                    <div className={`absolute inset-y-0 ${a.estouro > 0 ? "bg-destructive" : "bg-success"}`} style={{ left: `${pctUsado}%`, width: `${pct - pctUsado}%` }} />
                  </div>
                  {a.estouro > 0 && <p className="text-[11px] text-destructive num">Estoura limite em R$ {fmtBRL(a.estouro)}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
   MENSAGENS
============================================================ */
function Mensagens({
  data, resumos, porProduto, totalValor, totalKg, totalTecido, dist, mes,
}: {
  data: AppData; resumos: ResumoArr; porProduto: ReturnType<typeof calcTotaisProduto>;
  totalValor: number; totalKg: number; totalTecido: number; dist: DistMan; mes: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const linhaProduto = (nome: string, qtd: number, preco: number, valor: number) =>
    `${nome} ${fmtInt(qtd)} = R$${fmtBRL(preco)} cada = R$${fmtBRL(valor)} reais`;

  const msgConsolidada = useMemo(() => {
    const linhas = porProduto.filter((p) => p.qtd > 0).map((p) => linhaProduto(p.produto.nome, p.qtd, p.produto.valor, p.valor));
    const tail: string[] = [`Total: ${fmtKg(totalKg)} kg · R$ ${fmtBRL(totalValor)}`];
    if (data.precoTecidoKg > 0) tail.push(`Tecido ${data.nomeTecido}: ${fmtKg(totalKg)} kg × R$ ${fmtBRL(data.precoTecidoKg)}/kg = R$ ${fmtBRL(totalTecido)}`);
    return [`*Remessa ${mes}*`, "", ...linhas, "", ...tail].join("\n");
  }, [porProduto, totalKg, totalValor, totalTecido, data.precoTecidoKg, data.nomeTecido, mes]);

  const msgPorMEI = useMemo(() => dist.alocacoes.filter((a) => a.valor > 0.01).map((a) => {
    const mei = data.meis.find((m) => m.id === a.meiId)!;
    const blocos: string[] = [`*${mei.nome} — Remessa ${mes}*`, ""];
    let kgMei = 0;
    a.empresaIds.forEach((eid) => {
      const e = data.empresas.find((x) => x.id === eid)!;
      const idx = data.empresas.findIndex((x) => x.id === eid);
      const r = resumos[idx];
      blocos.push(`▸ ${e.nome}`);
      r.itens.filter((it) => it.qtd > 0).forEach((it) => {
        const p = data.produtos.find((x) => x.id === it.produtoId)!;
        blocos.push("  " + linhaProduto(p.nome, it.qtd, p.valor, it.valor));
      });
      blocos.push(`  Subtotal: ${fmtKg(r.totalKg)} kg · R$ ${fmtBRL(r.totalValor)}`, "");
      kgMei += r.totalKg;
    });
    blocos.push(`Total a faturar: R$ ${fmtBRL(a.valor)}`);
    if (data.precoTecidoKg > 0) blocos.push(`Tecido ${data.nomeTecido}: ${fmtKg(kgMei)} kg × R$ ${fmtBRL(data.precoTecidoKg)}/kg = R$ ${fmtBRL(kgMei * data.precoTecidoKg)}`);
    return { mei, texto: blocos.join("\n") };
  }), [dist.alocacoes, data, resumos, mes]);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); toast.success("Copiado");
    setTimeout(() => setCopied(null), 1800);
  };

  if (totalValor === 0) return (
    <Card className="p-10 text-center">
      <MessageSquare className="size-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">Preencha a Remessa para gerar mensagens.</p>
    </Card>
  );

  const MsgCard = ({ title, texto, k }: { title: string; texto: string; k: string }) => (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-2">
        <p className="font-medium text-sm">{title}</p>
        <Button size="sm" variant="outline" onClick={() => copy(k, texto)}>
          {copied === k ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
          {copied === k ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm font-mono bg-surface-2 rounded-md p-3 border border-border">{texto}</pre>
    </Card>
  );

  return (
    <div className="space-y-6">
      <MsgCard title="Consolidada" texto={msgConsolidada} k="cons" />
      {msgPorMEI.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Por MEI</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {msgPorMEI.map((m) => <MsgCard key={m.mei.id} title={m.mei.nome} texto={m.texto} k={`m-${m.mei.id}`} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   REVENDA — proporção do fechamento + notas de balcão
============================================================ */
function Revenda({
  data, update, mes,
}: { data: AppData; update: (p: Partial<AppData>) => void; mes: string }) {
  const baseDefault = mesAnterior(mes);
  const [baseMes, setBaseMes] = useState<string>(baseDefault);
  useEffect(() => { setBaseMes(baseDefault); }, [baseDefault]);

  const baseFech = data.fechamentos[baseMes];
  const mesesDisp = useMemo(() => Object.keys(data.fechamentos).sort().reverse(), [data.fechamentos]);

  // proporções por produto de revenda
  const proporcoes = useMemo(() => {
    return data.produtosRevenda.map((p) => {
      const prop = proporcaoRevendaFechamento(baseFech, p.id, data.empresas).filter((x) => x.qtd > 0);
      return { produto: p, prop };
    });
  }, [data.produtosRevenda, baseFech, data.empresas]);

  const proporcoesUsadas = proporcoes.filter((p) => p.prop.length > 0);

  // notas do mês ativo
  const notasDoMes = useMemo(
    () => data.notasRevenda.filter((n) => n.mes === mes).sort((a, b) => b.data.localeCompare(a.data)),
    [data.notasRevenda, mes],
  );

  // acumulado do mês: produtoId -> empresaId -> tamanho -> qtd
  const acumulado = useMemo(() => {
    const out: Record<string, Record<string, Record<string, number>>> = {};
    for (const n of notasDoMes) {
      const p = (out[n.produtoId] ??= {});
      for (const [eid, perTam] of Object.entries(n.distribuicao)) {
        const e = (p[eid] ??= {});
        for (const [t, q] of Object.entries(perTam)) e[t] = (e[t] ?? 0) + q;
      }
    }
    return out;
  }, [notasDoMes]);

  const removerNota = (id: string) => {
    if (!confirm("Remover esta nota?")) return;
    update({ notasRevenda: data.notasRevenda.filter((n) => n.id !== id) });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-end gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <h3 className="font-semibold text-sm">Base de proporção</h3>
            <p className="text-[11px] text-muted-foreground">
              Calculada das vendas do mês escolhido (importadas em <strong>Fechamento</strong>).
              Sugestão: mês anterior ao ativo.
            </p>
          </div>
          <div className="w-40">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mês base</Label>
            <Select value={baseMes} onValueChange={setBaseMes}>
              <SelectTrigger className="h-9 num"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {mesesDisp.length === 0 ? (
                  <SelectItem value="__none__" disabled>Sem fechamentos</SelectItem>
                ) : mesesDisp.map((m) => <SelectItem key={m} value={m} className="num">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!baseFech ? (
          <p className="text-sm text-muted-foreground">
            Sem fechamento para <strong>{baseMes || "—"}</strong>. Importe as planilhas desse mês na aba Fechamento.
          </p>
        ) : proporcoesUsadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto de revenda teve vendas em {baseMes}.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {proporcoesUsadas.map(({ produto, prop }) => (
              <div key={produto.id} className="rounded-md border border-border p-3 bg-surface-2">
                <p className="font-medium text-sm mb-2">{produto.nome}</p>
                <table className="w-full text-xs">
                  <tbody>
                    {prop.map((x) => {
                      const emp = data.empresas.find((e) => e.id === x.empresaId);
                      return (
                        <tr key={x.empresaId}>
                          <td className="py-1">{emp?.nome}</td>
                          <td className="py-1 num text-right text-muted-foreground">{fmtInt(x.qtd)} vendidos</td>
                          <td className="py-1 num text-right font-semibold pl-3">{fmtPct(x.pct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Card>

      {baseFech && proporcoesUsadas.length > 0 && (
        <NovaNotaForm
          data={data}
          update={update}
          mes={mes}
          baseMes={baseMes}
          proporcoes={proporcoesUsadas}
        />
      )}

      {notasDoMes.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">Notas pegas em {mes} ({notasDoMes.length})</h3>
          <div className="space-y-3">
            {notasDoMes.map((n) => (
              <NotaCard key={n.id} nota={n} data={data} onRemove={() => removerNota(n.id)} />
            ))}
          </div>
        </Card>
      )}

      {notasDoMes.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">Acumulado do mês {mes}</h3>
          <div className="space-y-4">
            {Object.entries(acumulado).map(([pid, porEmp]) => {
              const p = data.produtosRevenda.find((x) => x.id === pid);
              if (!p) return null;
              const tams = p.tamanhos;
              return (
                <div key={pid}>
                  <p className="text-sm font-medium mb-1">{p.nome}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-2">
                          <th className="text-left px-2 py-1 border-b border-border">Empresa</th>
                          {tams.map((t) => <th key={t} className="px-2 py-1 border-b border-border text-right">{t}</th>)}
                          <th className="px-2 py-1 border-b border-border text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(porEmp).map(([eid, porTam]) => {
                          const total = Object.values(porTam).reduce((s, v) => s + v, 0);
                          return (
                            <tr key={eid}>
                              <td className="px-2 py-1 border-b border-border">{data.empresas.find((e) => e.id === eid)?.nome}</td>
                              {tams.map((t) => <td key={t} className="px-2 py-1 border-b border-border num text-right">{porTam[t] ? fmtInt(porTam[t]) : "—"}</td>)}
                              <td className="px-2 py-1 border-b border-border num text-right font-semibold">{fmtInt(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function NovaNotaForm({
  data, update, mes, baseMes, proporcoes,
}: {
  data: AppData; update: (p: Partial<AppData>) => void; mes: string; baseMes: string;
  proporcoes: { produto: ProdutoRevenda; prop: { empresaId: string; qtd: number; pct: number }[] }[];
}) {
  const [produtoId, setProdutoId] = useState<string>(proporcoes[0]?.produto.id ?? "");
  const [dataNota, setDataNota] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tamQtds, setTamQtds] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");

  useEffect(() => { setTamQtds({}); }, [produtoId]);

  const produtoSel = proporcoes.find((p) => p.produto.id === produtoId);

  const previa = useMemo(() => {
    if (!produtoSel) return null;
    const dist: Record<string, Record<string, number>> = {};
    for (const t of produtoSel.produto.tamanhos) {
      const totalT = parseInt((tamQtds[t] ?? "").replace(/\D/g, ""), 10) || 0;
      if (totalT === 0) continue;
      const alloc = distribuirRevenda(totalT, produtoSel.prop.map((p) => ({ empresaId: p.empresaId, pct: p.pct })));
      for (const a of alloc) {
        if (a.qtd <= 0) continue;
        (dist[a.empresaId] ??= {})[t] = (dist[a.empresaId][t] ?? 0) + a.qtd;
      }
    }
    return dist;
  }, [tamQtds, produtoSel]);

  const totalPecas = Object.values(tamQtds).reduce((s, v) => s + (parseInt((v ?? "").replace(/\D/g, ""), 10) || 0), 0);

  const salvar = () => {
    if (!produtoSel) return;
    if (totalPecas === 0) { toast.error("Informe ao menos um tamanho"); return; }
    const porTamanho: Record<string, number> = {};
    for (const t of produtoSel.produto.tamanhos) {
      const v = parseInt((tamQtds[t] ?? "").replace(/\D/g, ""), 10) || 0;
      if (v > 0) porTamanho[t] = v;
    }
    const nova: NotaRevenda = {
      id: newId(),
      mes,
      data: dataNota,
      produtoId: produtoSel.produto.id,
      porTamanho,
      baseMes,
      distribuicao: previa ?? {},
      observacao: obs.trim() || undefined,
    };
    update({ notasRevenda: [nova, ...data.notasRevenda] });
    setTamQtds({}); setObs("");
    toast.success("Nota registrada");
  };

  if (!produtoSel) return null;

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-sm mb-3">Nova nota de balcão</h3>
      <div className="grid md:grid-cols-[200px_140px_1fr] gap-3 mb-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Produto</Label>
          <Select value={produtoId} onValueChange={setProdutoId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {proporcoes.map((p) => <SelectItem key={p.produto.id} value={p.produto.id}>{p.produto.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</Label>
          <Input type="date" value={dataNota} onChange={(e) => setDataNota(e.target.value)} className="h-9 num" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Observação</Label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: NF #1234" className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        {produtoSel.produto.tamanhos.map((t) => (
          <div key={t}>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t}</Label>
            <Input
              inputMode="numeric"
              value={tamQtds[t] ?? ""}
              onChange={(e) => setTamQtds((s) => ({ ...s, [t]: e.target.value.replace(/\D/g, "") }))}
              placeholder="0"
              className="h-9 num text-right"
            />
          </div>
        ))}
      </div>

      {totalPecas > 0 && previa && (
        <div className="rounded-md border border-border bg-surface-2 p-3 mb-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Distribuição prévia · base {baseMes} · {fmtInt(totalPecas)} peças
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Empresa</th>
                  {produtoSel.produto.tamanhos.map((t) => <th key={t} className="px-2 py-1 text-right">{t}</th>)}
                  <th className="px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(previa).map(([eid, porTam]) => {
                  const total = Object.values(porTam).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={eid}>
                      <td className="px-2 py-1">{data.empresas.find((e) => e.id === eid)?.nome}</td>
                      {produtoSel.produto.tamanhos.map((t) => (
                        <td key={t} className="px-2 py-1 num text-right">{porTam[t] ? fmtInt(porTam[t]) : "—"}</td>
                      ))}
                      <td className="px-2 py-1 num text-right font-semibold text-success">{fmtInt(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={totalPecas === 0}>
          <Plus className="size-3.5 mr-1.5" /> Registrar nota
        </Button>
      </div>
    </Card>
  );
}

function NotaCard({
  nota, data, onRemove,
}: { nota: NotaRevenda; data: AppData; onRemove: () => void }) {
  const produto = data.produtosRevenda.find((p) => p.id === nota.produtoId);
  if (!produto) return null;

  const totalPecas = Object.values(nota.porTamanho).reduce((s, v) => s + v, 0);
  const tams = produto.tamanhos;

  const mensagem = useMemo(() => {
    const linhas: string[] = [
      `*${produto.nome} — Nota ${new Date(nota.data).toLocaleDateString("pt-BR")}*`,
      `Total pego: ${fmtInt(totalPecas)} peças`,
      "",
      "Distribuir como:",
    ];
    for (const [eid, porTam] of Object.entries(nota.distribuicao)) {
      const e = data.empresas.find((x) => x.id === eid);
      const partes = tams.filter((t) => porTam[t]).map((t) => `${t} ${fmtInt(porTam[t])}`).join(" · ");
      const total = Object.values(porTam).reduce((s, v) => s + v, 0);
      linhas.push(`▸ ${e?.nome}: ${partes}  (${fmtInt(total)})`);
    }
    return linhas.join("\n");
  }, [nota, produto, data.empresas, tams, totalPecas]);

  const copy = async () => {
    await navigator.clipboard.writeText(mensagem);
    toast.success("Copiado");
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-2">
        <div>
          <span className="font-medium text-sm">{produto.nome}</span>
          <span className="ml-2 text-[11px] text-muted-foreground">
            {new Date(nota.data).toLocaleDateString("pt-BR")} · {fmtInt(totalPecas)} pç
            {nota.observacao && ` · ${nota.observacao}`}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={copy}><Copy className="size-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="text-destructive"><Trash2 className="size-3.5" /></Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-2/40">
              <th className="text-left px-3 py-1.5">Empresa</th>
              {tams.map((t) => <th key={t} className="px-3 py-1.5 text-right">{t}</th>)}
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(nota.distribuicao).map(([eid, porTam]) => {
              const total = Object.values(porTam).reduce((s, v) => s + v, 0);
              return (
                <tr key={eid} className="border-t border-border">
                  <td className="px-3 py-1.5">{data.empresas.find((e) => e.id === eid)?.nome}</td>
                  {tams.map((t) => <td key={t} className="px-3 py-1.5 num text-right">{porTam[t] ? fmtInt(porTam[t]) : "—"}</td>)}
                  <td className="px-3 py-1.5 num text-right font-semibold">{fmtInt(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   CADASTROS
============================================================ */
function Cadastros({ data, update }: { data: AppData; update: (p: Partial<AppData>) => void }) {
  return (
    <div className="space-y-4">
      <TecidoCard
        nome={data.nomeTecido} preco={data.precoTecidoKg}
        setNome={(nomeTecido) => update({ nomeTecido })}
        setPreco={(precoTecidoKg) => update({ precoTecidoKg })}
      />
      <div className="grid lg:grid-cols-3 gap-4">
        <ProdutosCard produtos={data.produtos} setProdutos={(produtos) => update({ produtos })} />
        <EmpresasCard
          empresas={data.empresas} setEmpresas={(empresas) => update({ empresas })}
          quantidades={data.quantidades} setQuantidades={(q) => update({ quantidades: q })}
        />
        <MEIsCard meis={data.meis} setMEIs={(meis) => update({ meis })} />
      </div>
      <ProdutosRevendaCard produtos={data.produtosRevenda} setProdutos={(p) => update({ produtosRevenda: p })} />
      <MapeamentoCard data={data} update={update} />
    </div>
  );
}

function TecidoCard({ nome, preco, setNome, setPreco }: { nome: string; preco: number; setNome: (s: string) => void; setPreco: (n: number) => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3"><Package className="size-4" /><h3 className="font-semibold text-sm">Matéria-prima · Tecido</h3></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 text-sm" placeholder="Suplex" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço por KG (R$)</Label>
          <Input type="number" step="0.01" inputMode="decimal" value={preco}
            onChange={(e) => setPreco(Math.max(0, parseFloat(e.target.value) || 0))} className="h-9 num text-sm" />
        </div>
      </div>
    </Card>
  );
}

function ProdutosCard({ produtos, setProdutos }: { produtos: Produto[]; setProdutos: (p: Produto[]) => void }) {
  const add = () => setProdutos([...produtos, { id: newId(), nome: "Novo", rendimento: 1, valor: 0 }]);
  const upd = (id: string, patch: Partial<Produto>) => setProdutos(produtos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => setProdutos(produtos.filter((p) => p.id !== id));
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2"><Package className="size-4" /><h3 className="font-semibold text-sm">Produtos próprios</h3></div>
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Rendimento (peças/kg) · Valor (R$/peça) · Grupo do ERP</p>
      <div className="space-y-3">
        {produtos.map((p) => (
          <div key={p.id} className="space-y-2 p-3 rounded-md border border-border bg-surface-2">
            <div className="flex gap-2">
              <Input value={p.nome} onChange={(e) => upd(p.id, { nome: e.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => del(p.id)} className="h-8 w-8 text-destructive shrink-0"><Trash2 className="size-3.5" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rendim.</Label>
                <Input type="number" value={p.rendimento} onChange={(e) => upd(p.id, { rendimento: Math.max(0, parseFloat(e.target.value) || 0) })} className="h-8 num text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</Label>
                <Input type="number" step="0.01" value={p.valor} onChange={(e) => upd(p.id, { valor: Math.max(0, parseFloat(e.target.value) || 0) })} className="h-8 num text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Grupo</Label>
                <Input value={p.grupoCanonico ?? ""} onChange={(e) => upd(p.id, { grupoCanonico: e.target.value.toUpperCase() })} className="h-8 text-sm uppercase" placeholder="LEGGING" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EmpresasCard({ empresas, setEmpresas, quantidades, setQuantidades }: {
  empresas: Empresa[]; setEmpresas: (e: Empresa[]) => void;
  quantidades: Record<string, Record<string, string>>; setQuantidades: (q: Record<string, Record<string, string>>) => void;
}) {
  const add = () => setEmpresas([...empresas, { id: newId(), nome: "Nova empresa" }]);
  const upd = (id: string, patch: Partial<Empresa>) => setEmpresas(empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const del = (id: string) => {
    setEmpresas(empresas.filter((e) => e.id !== id));
    const q = { ...quantidades }; delete q[id]; setQuantidades(q);
  };
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2"><Building2 className="size-4" /><h3 className="font-semibold text-sm">Empresas</h3></div>
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Apelidos = palavras no nome do arquivo .xls (ex.: "cr" para CR Fitness).</p>
      <div className="space-y-3">
        {empresas.map((e) => (
          <div key={e.id} className="space-y-2 p-3 rounded-md border border-border bg-surface-2">
            <div className="flex gap-2">
              <Input value={e.nome} onChange={(ev) => upd(e.id, { nome: ev.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => del(e.id)} className="h-8 w-8 text-destructive shrink-0"><Trash2 className="size-3.5" /></Button>
            </div>
            <Input placeholder="CNPJ" value={e.cnpj ?? ""} onChange={(ev) => upd(e.id, { cnpj: ev.target.value })} className="h-8 num text-sm" />
            <Input placeholder="apelidos: cr, costa, etc" value={(e.apelidos ?? []).join(", ")}
              onChange={(ev) => upd(e.id, { apelidos: ev.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              className="h-8 text-sm" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function MEIsCard({ meis, setMEIs }: { meis: MEI[]; setMEIs: (m: MEI[]) => void }) {
  const add = () => setMEIs([...meis, { id: newId(), nome: "Novo MEI", limiteMensal: 6750, jaUsadoMes: 0, ativo: true }]);
  const upd = (id: string, patch: Partial<MEI>) => setMEIs(meis.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const del = (id: string) => setMEIs(meis.filter((m) => m.id !== id));
  const zerarMes = () => { setMEIs(meis.map((m) => ({ ...m, jaUsadoMes: 0 }))); toast.success("Zerados"); };
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2"><Users className="size-4" /><h3 className="font-semibold text-sm">MEIs</h3></div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={zerarMes}><RotateCcw className="size-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
        </div>
      </div>
      <div className="space-y-3">
        {meis.map((m) => (
          <div key={m.id} className={`space-y-2 p-3 rounded-md border bg-surface-2 ${m.ativo ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex gap-2 items-center">
              <Input value={m.nome} onChange={(e) => upd(m.id, { nome: e.target.value })} className="h-8 text-sm" />
              <Switch checked={m.ativo} onCheckedChange={(ativo) => upd(m.id, { ativo })} />
              <Button size="icon" variant="ghost" onClick={() => del(m.id)} className="h-8 w-8 text-destructive shrink-0"><Trash2 className="size-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Limite mês</Label>
                <Input type="number" step="0.01" value={m.limiteMensal} onChange={(e) => upd(m.id, { limiteMensal: Math.max(0, parseFloat(e.target.value) || 0) })} className="h-8 num text-sm" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Já usado</Label>
                <Input type="number" step="0.01" value={m.jaUsadoMes} onChange={(e) => upd(m.id, { jaUsadoMes: Math.max(0, parseFloat(e.target.value) || 0) })} className="h-8 num text-sm" />
              </div>
            </div>
            <p className="text-[11px] num text-muted-foreground">
              Disponível: <span className="text-success font-medium">R$ {fmtBRL(Math.max(0, m.limiteMensal - m.jaUsadoMes))}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProdutosRevendaCard({ produtos, setProdutos }: { produtos: ProdutoRevenda[]; setProdutos: (p: ProdutoRevenda[]) => void }) {
  const add = () => setProdutos([...produtos, { id: newId(), nome: "Novo", tamanhos: ["P", "M", "G", "GG"] }]);
  const upd = (id: string, patch: Partial<ProdutoRevenda>) => setProdutos(produtos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => setProdutos(produtos.filter((p) => p.id !== id));
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2"><ShoppingBag className="size-4" /><h3 className="font-semibold text-sm">Produtos de revenda</h3></div>
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3.5" /></Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {produtos.map((p) => (
          <div key={p.id} className="space-y-2 p-3 rounded-md border border-border bg-surface-2">
            <div className="flex gap-2">
              <Input value={p.nome} onChange={(e) => upd(p.id, { nome: e.target.value })} className="h-8 text-sm" />
              <Button size="icon" variant="ghost" onClick={() => del(p.id)} className="h-8 w-8 text-destructive shrink-0"><Trash2 className="size-3.5" /></Button>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tamanhos</Label>
              <Input value={p.tamanhos.join(", ")}
                onChange={(e) => upd(p.id, { tamanhos: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                className="h-8 text-sm" placeholder="P, M, G, GG" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Grupo ERP</Label>
              <Input value={p.grupoCanonico ?? ""} onChange={(e) => upd(p.id, { grupoCanonico: e.target.value.toUpperCase() })}
                className="h-8 text-sm uppercase" placeholder="SAMBA CANCAO" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MapeamentoCard({ data, update }: { data: AppData; update: (p: Partial<AppData>) => void }) {
  const todosProds = [
    ...data.produtos.map((p) => ({ id: p.id, nome: p.nome, tipo: "Próprio" })),
    ...data.produtosRevenda.map((p) => ({ id: p.id, nome: p.nome, tipo: "Revenda" })),
  ];
  const entries = Object.entries(data.mapeamentoGrupo).sort();
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-sm mb-3">Mapeamento Grupo → Produto</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Define como cada GRUPO do ERP vira um produto cadastrado. Atualizado automaticamente ao mapear pendentes na aba Fechamento.
      </p>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-muted-foreground">Vazio.</p>}
        {entries.map(([g, pid]) => {
          const prod = todosProds.find((p) => p.id === pid);
          return (
            <div key={g} className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-1 rounded bg-surface-2 border border-border min-w-[140px]">{g}</span>
              <span className="text-muted-foreground">→</span>
              <Select value={pid} onValueChange={(v) => update({ mapeamentoGrupo: { ...data.mapeamentoGrupo, [g]: v } })}>
                <SelectTrigger className="h-8 w-64 text-xs"><SelectValue>{prod?.nome ?? "—"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {todosProds.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome} <span className="text-muted-foreground">({o.tipo})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                onClick={() => {
                  const m = { ...data.mapeamentoGrupo }; delete m[g]; update({ mapeamentoGrupo: m });
                }}><Trash2 className="size-3.5" /></Button>
            </div>
          );
        })}
      </div>
      <Separator className="my-4" />
      <p className="text-[11px] text-muted-foreground">
        Para também detectar tamanhos no import, mantenha a Descrição original do ERP (ex.: "SAMBA CANCAO P", "LEGGING PRETA P/M").
      </p>
    </Card>
  );
}
