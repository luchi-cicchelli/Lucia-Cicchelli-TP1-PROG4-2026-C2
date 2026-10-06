import { VentaDiaria } from '../../../core/models/reporte.model';

// Exportación del reporte de facturación a PDF (jsPDF) y a Excel (ExcelJS).
// Las librerías se cargan con import() solo cuando se usan, así no pesan en el resto de la app.

export interface DatosReporte {
  desde: string;
  hasta: string;
  ventas: VentaDiaria[];
  totales: { facturacion: number; compras: number; entradas: number };
}

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function nombreArchivo(d: DatosReporte, extension: string): string {
  return `bijou-facturacion-${d.desde}-a-${d.hasta}.${extension}`;
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportarPdf(d: DatosReporte) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const columnas = [20, 75, 115, 190]; // x de cada columna (la última alineada a la derecha)

  doc.setFont('times', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(212, 83, 126);
  doc.text('Bijou', 20, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(46, 42, 44);
  doc.text('Reporte de facturación y entradas vendidas', 20, 31);
  doc.setFontSize(9);
  doc.setTextColor(122, 116, 118);
  doc.text(`Del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)} · generado el ${new Date().toLocaleString('es-AR')}`, 20, 37);

  let y = 50;
  const encabezado = () => {
    doc.setFontSize(9);
    doc.setTextColor(122, 116, 118);
    doc.text('Fecha', columnas[0], y);
    doc.text('Compras', columnas[1], y);
    doc.text('Entradas', columnas[2], y);
    doc.text('Facturación', columnas[3], y, { align: 'right' });
    doc.setDrawColor(234, 226, 224);
    doc.line(20, y + 2, 190, y + 2);
    y += 8;
    doc.setTextColor(46, 42, 44);
  };
  encabezado();

  for (const v of d.ventas) {
    if (y > 280) {
      doc.addPage();
      y = 20;
      encabezado();
    }
    doc.text(fechaCorta(v.dia), columnas[0], y);
    doc.text(String(v.compras), columnas[1], y);
    doc.text(String(v.entradas), columnas[2], y);
    doc.text(pesos.format(v.facturacion), columnas[3], y, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(212, 83, 126);
  doc.line(20, y - 3, 190, y - 3);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('Total', columnas[0], y);
  doc.text(String(d.totales.compras), columnas[1], y);
  doc.text(String(d.totales.entradas), columnas[2], y);
  doc.text(pesos.format(d.totales.facturacion), columnas[3], y, { align: 'right' });

  doc.save(nombreArchivo(d, 'pdf'));
}

export async function exportarExcel(d: DatosReporte) {
  const { Workbook } = await import('exceljs');
  const libro = new Workbook();
  libro.creator = 'Bijou';
  const hoja = libro.addWorksheet('Facturación');

  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Compras', key: 'compras', width: 12 },
    { header: 'Entradas vendidas', key: 'entradas', width: 18 },
    { header: 'Facturación', key: 'facturacion', width: 18, style: { numFmt: '"$"#,##0.00' } }
  ];
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4537E' } };

  for (const v of d.ventas) {
    const [a, m, dia] = v.dia.split('-').map(Number);
    // Excel guarda las fechas sin zona horaria: se pasa en UTC para que no se corra un día.
    hoja.addRow({ fecha: new Date(Date.UTC(a, m - 1, dia)), compras: v.compras, entradas: v.entradas, facturacion: v.facturacion });
  }
  hoja.getColumn('fecha').numFmt = 'dd/mm/yyyy';

  // Fila de totales con fórmulas, así siguen andando si se edita la planilla.
  const ultima = d.ventas.length + 1;
  const total = hoja.addRow({
    fecha: 'Total',
    compras: { formula: `SUM(B2:B${ultima})`, result: d.totales.compras },
    entradas: { formula: `SUM(C2:C${ultima})`, result: d.totales.entradas },
    facturacion: { formula: `SUM(D2:D${ultima})`, result: d.totales.facturacion }
  });
  total.font = { bold: true };

  const buffer = await libro.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nombreArchivo(d, 'xlsx')
  );
}
