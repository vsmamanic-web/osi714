// Utilidades de exportación: PNG (dashboards), Excel (datos), PDF (informe).
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportNodeAsPNG(node: HTMLElement, filename = "dashboard.png") {
  const canvas = await html2canvas(node, {
    backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
  });
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}


export function exportRowsAsExcel(sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>, filename = "datos.xlsx") {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export interface ReportSection { title: string; text?: string; node?: HTMLElement; }

export async function exportReportPDF(args: {
  title: string; subtitle?: string; sections: ReportSection[]; filename?: string;
}) {
  const pdf = new jsPDF("p", "mm", "a4");
  const W = 210, MARGIN = 12;
  const INSTITUTIONAL = "#00559E";

  // Portada
  pdf.setFillColor(INSTITUTIONAL);
  pdf.rect(0, 0, W, 40, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold").setFontSize(22);
  pdf.text("Osinergmin — SEIN BI", MARGIN, 20);
  pdf.setFont("helvetica", "normal").setFontSize(11);
  pdf.text(args.title, MARGIN, 30);
  if (args.subtitle) {
    pdf.setFontSize(9);
    pdf.text(args.subtitle, MARGIN, 36);
  }
  pdf.setTextColor(15, 23, 42);

  let y = 50;
  for (const s of args.sections) {
    if (y > 260) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").setFontSize(12);
    pdf.setTextColor(0, 85, 158);
    pdf.text(s.title, MARGIN, y); y += 5;
    pdf.setTextColor(30, 41, 59);
    pdf.setFont("helvetica", "normal").setFontSize(9);
    if (s.text) {
      const lines = pdf.splitTextToSize(s.text, W - 2 * MARGIN);
      pdf.text(lines, MARGIN, y);
      y += lines.length * 4 + 3;
    }
    if (s.node) {
      try {
        const canvas = await html2canvas(s.node, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
        const img = canvas.toDataURL("image/png");
        const imgW = W - 2 * MARGIN;
        const imgH = (canvas.height / canvas.width) * imgW;
        if (y + imgH > 285) { pdf.addPage(); y = 20; }
        pdf.addImage(img, "PNG", MARGIN, y, imgW, Math.min(imgH, 240));
        y += Math.min(imgH, 240) + 6;
      } catch { /* nada */ }
    }
}

/**
 * Exporta el nodo del dashboard completo en PDF, paginado, replicando exactamente
 * lo que ve el usuario (KPIs, tablas, gráficos, filtros, mapas). Incluye chips
 * con los filtros aplicados en la cabecera.
 */
export async function exportDashboardPDF(args: {
  node: HTMLElement;
  title: string;
  filters?: Array<{ label: string; value: string }>;
  filename?: string;
}) {
  const { node, title, filters = [], filename = "dashboard.pdf" } = args;
  // Aseguramos redibujo de Chart.js antes de rasterizar.
  node.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 250));

  const canvas = await html2canvas(node, {
    backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const W = 210, H = 297, MARGIN = 10;
  const INSTITUTIONAL = "#00559E";

  // Cabecera institucional en la primera página.
  pdf.setFillColor(INSTITUTIONAL);
  pdf.rect(0, 0, W, 24, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold").setFontSize(14);
  pdf.text("Osinergmin — SEIN BI", MARGIN, 10);
  pdf.setFont("helvetica", "normal").setFontSize(10);
  pdf.text(title, MARGIN, 18);
  pdf.setTextColor(15, 23, 42);

  // Chips de filtros aplicados.
  let filterY = 30;
  if (filters.length) {
    pdf.setFont("helvetica", "normal").setFontSize(8);
    const chipText = filters.map((f) => `${f.label}: ${f.value}`).join("   ·   ");
    const lines = pdf.splitTextToSize(chipText, W - 2 * MARGIN);
    pdf.setTextColor(71, 85, 105);
    pdf.text(lines, MARGIN, filterY);
    filterY += lines.length * 4 + 2;
    pdf.setTextColor(15, 23, 42);
  }

  const availW = W - 2 * MARGIN;
  const imgW = availW;
  const imgH = (canvas.height / canvas.width) * imgW;

  // Paginado vertical: recortamos el canvas por franjas del alto disponible.
  const firstPageAvail = H - filterY - MARGIN;
  const nextPageAvail = H - 2 * MARGIN;
  const scale = imgW / canvas.width;
  let renderedPx = 0;
  let firstPage = true;

  while (renderedPx < canvas.height) {
    const availMm = firstPage ? firstPageAvail : nextPageAvail;
    const availPx = availMm / scale;
    const slicePx = Math.min(availPx, canvas.height - renderedPx);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = slicePx;
    const ctx = sliceCanvas.getContext("2d")!;
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    const img = sliceCanvas.toDataURL("image/png");
    if (!firstPage) pdf.addPage();
    const y = firstPage ? filterY : MARGIN;
    pdf.addImage(img, "PNG", MARGIN, y, imgW, slicePx * scale);
    renderedPx += slicePx;
    firstPage = false;
  }

  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7); pdf.setTextColor(100);
    pdf.text(
      `Osinergmin — ${title} · Generado ${new Date().toLocaleString("es-PE")} · Pág ${i}/${pageCount}`,
      MARGIN, H - 4,
    );
  }
  pdf.save(filename);
  // Ignorar imgH: se usa implícitamente arriba, evitamos warning.
  void imgH;
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7); pdf.setTextColor(100);
    pdf.text(`Osinergmin — Reporte generado ${new Date().toLocaleString("es-PE")} · Pág ${i}/${pageCount}`, MARGIN, 293);
  }
  pdf.save(args.filename ?? "informe_sein_bi.pdf");
}
