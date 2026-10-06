import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { AuthService } from '../../core/services/auth.service';
import { ComprasService } from '../../core/services/compras.service';
import { CompraDetalle, EntradaDetalle, METODOS_PAGO } from '../../core/models/compra.model';

@Component({
  selector: 'app-compra-exitosa',
  standalone: true,
  imports: [RouterLink, DatePipe, CurrencyPipe],
  templateUrl: './compra-exitosa.component.html',
  styleUrl: './compra-exitosa.component.css'
})
export class CompraExitosaComponent implements OnInit {
  private readonly compras = inject(ComprasService);
  readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  readonly compra = signal<CompraDetalle | null>(null);
  readonly qrs = signal<Record<string, string>>({});
  readonly cargando = signal(true);
  readonly generandoPdf = signal(false);
  readonly error = signal('');
  readonly linkCopiado = signal(false);

  async ngOnInit() {
    try {
      const compra = await this.compras.detalle(this.id());
      this.compra.set(compra);
      if (compra) {
        const qrs: Record<string, string> = {};
        for (const e of compra.entradas) {
          qrs[e.id] = await QRCode.toDataURL(e.qr_codigo, { width: 360, margin: 1 });
        }
        this.qrs.set(qrs);
      }
    } catch (e: any) {
      this.error.set('No se pudo cargar la compra: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  etiquetaButaca(e: EntradaDetalle): string {
    return e.fila === 'ACC' ? `Fila accesible, butaca ${e.numero}` : `Fila ${e.fila}, butaca ${e.numero}`;
  }

  metodoPago(valor: string): string {
    return METODOS_PAGO.find((m) => m.valor === valor)?.etiqueta ?? valor;
  }

  async copiarLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      this.linkCopiado.set(true);
      setTimeout(() => this.linkCopiado.set(false), 2500);
    } catch {
      this.linkCopiado.set(false);
    }
  }

  async descargarPdf() {
    const compra = this.compra();
    if (!compra) return;
    this.generandoPdf.set(true);
    try {
      // jsPDF se carga recién cuando se necesita, para no agrandar la carga inicial.
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a5', compress: true });
      const ancho = pdf.internal.pageSize.getWidth();
      const inicio = new Date(compra.funcion.inicio);
      const fecha = inicio.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const hora = inicio.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

      compra.entradas.forEach((e, i) => {
        if (i > 0) pdf.addPage();

        pdf.setFillColor(212, 83, 126);
        pdf.rect(0, 0, ancho, 22, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('times', 'normal');
        pdf.setFontSize(22);
        pdf.text('Bijou', 12, 14.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(`Entrada ${i + 1} de ${compra.entradas.length}`, ancho - 12, 14, { align: 'right' });

        pdf.setTextColor(46, 42, 44);
        pdf.setFont('times', 'normal');
        pdf.setFontSize(20);
        pdf.text(pdf.splitTextToSize(compra.pelicula.nombre, ancho - 24), 12, 36);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        const datos = [
          ['Fecha', fecha.charAt(0).toUpperCase() + fecha.slice(1)],
          ['Hora', `${hora} hs`],
          ['Sala', compra.funcion.sala],
          ['Butaca', this.etiquetaButaca(e) + (e.tipo === 'vip' ? ' (VIP)' : e.tipo === 'accesible' ? ' (accesible)' : '')],
          ['Formato', `${compra.funcion.formato.toUpperCase()} - ${compra.funcion.idioma === 'castellano' ? 'Castellano' : 'Subtitulada'}`],
          ['Precio', `$ ${Number(e.precio_pagado).toLocaleString('es-AR')}`]
        ];
        let y = 50;
        for (const [etiqueta, valor] of datos) {
          pdf.setTextColor(122, 116, 118);
          pdf.text(etiqueta, 12, y);
          pdf.setTextColor(46, 42, 44);
          pdf.text(valor, 40, y);
          y += 7;
        }

        const candy = compra.candy ?? [];
        const lado = candy.length ? 48 : 62;
        pdf.addImage(this.qrs()[e.id], 'PNG', (ancho - lado) / 2, y + 2, lado, lado);
        y += lado + 9;

        pdf.setFontSize(9);
        pdf.setTextColor(122, 116, 118);
        pdf.text('Código manual', ancho / 2, y, { align: 'center' });
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(18);
        pdf.setTextColor(46, 42, 44);
        pdf.text(e.codigo_manual, ancho / 2, y + 8, { align: 'center' });
        y += 16;

        pdf.setFont('helvetica', 'normal');
        if (candy.length) {
          const texto =
            'Incluye candy: ' +
            candy.map((c) => `${c.cantidad} x ${c.nombre}`).join(', ') +
            '. Se retira una sola vez, con el QR de cualquiera de tus entradas.';
          pdf.setFillColor(247, 241, 238);
          pdf.roundedRect(12, y, ancho - 24, 14, 2, 2, 'F');
          pdf.setFontSize(8.5);
          pdf.setTextColor(46, 42, 44);
          pdf.text(texto, ancho / 2, y + 5.5, { align: 'center', maxWidth: ancho - 30 });
          y += 18;
        }

        if (compra.pelicula.restriccion_edad) {
          pdf.setFillColor(251, 234, 240);
          pdf.roundedRect(12, y, ancho - 24, 12, 2, 2, 'F');
          pdf.setFontSize(9);
          pdf.setTextColor(114, 36, 62);
          pdf.text(
            `Película +${compra.pelicula.restriccion_edad}: los menores deben ingresar acompañados por un adulto.`,
            ancho / 2, y + 7.5, { align: 'center', maxWidth: ancho - 30 }
          );
          y += 16;
        }

        pdf.setFontSize(8);
        pdf.setTextColor(167, 159, 161);
        pdf.text('Válida para un solo ingreso. Presentá el QR o el código en la entrada de la sala.', ancho / 2, 202, { align: 'center' });
        pdf.text(`Compra ${compra.id.slice(0, 8).toUpperCase()}`, ancho / 2, 206, { align: 'center' });
      });

      pdf.save(`entradas-${compra.pelicula.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
    } catch (e: any) {
      this.error.set('No se pudo generar el PDF: ' + e.message);
    } finally {
      this.generandoPdf.set(false);
    }
  }
}
