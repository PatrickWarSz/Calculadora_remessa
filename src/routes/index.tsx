import { createFileRoute } from "@tanstack/react-router";
import CalculadoraApp from "@/components/CalculadoraApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calculadora de Remessa · Industrialização" },
      { name: "description", content: "Sistema interno para cálculo de notas fiscais de remessa para industrialização — KG de tecido, valores e distribuição entre MEIs." },
      { property: "og:title", content: "Calculadora de Remessa" },
      { property: "og:description", content: "Cálculo de remessa para industrialização por CNPJ e distribuição entre MEIs." },
    ],
  }),
  component: CalculadoraApp,
});
