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
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7); pdf.setTextColor(100);
    pdf.text(`Osinergmin — Reporte generado ${new Date().toLocaleString("es-PE")} · Pág ${i}/${pageCount}`, MARGIN, 293);
  }
  pdf.save(args.filename ?? "informe_sein_bi.pdf");
}
