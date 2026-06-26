import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Eólico — Norte-Centro Perú" },
      { name: "description", content: "Dashboard interactivo de generación eólica con carga de Excel." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/dashboard.html"
      title="Dashboard Eólico"
      style={{ width: "100vw", height: "100vh", border: "none", display: "block" }}
    />
  );
}
