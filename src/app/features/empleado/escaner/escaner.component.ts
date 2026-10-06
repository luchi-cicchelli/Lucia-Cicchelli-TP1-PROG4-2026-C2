import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import jsQR from 'jsqr';
import { EscanerService } from '../../../core/services/escaner.service';
import { ModoEscaner, ResultadoEscaneo } from '../../../core/models/escaner.model';

const PAUSA_MISMO_CODIGO_MS = 4000;
const INTERVALO_LECTURA_MS = 200;

@Component({
  selector: 'app-escaner',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './escaner.component.html',
  styleUrl: './escaner.component.css'
})
export class EscanerComponent implements OnDestroy {
  private readonly escaner = inject(EscanerService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = document.createElement('canvas');

  readonly modo = signal<ModoEscaner>('entrada');
  readonly camaraActiva = signal(false);
  readonly errorCamara = signal('');
  readonly procesando = signal(false);
  readonly resultado = signal<ResultadoEscaneo | null>(null);
  readonly historial = signal<ResultadoEscaneo[]>([]);
  readonly codigoManual = signal('');

  private stream: MediaStream | null = null;
  private frame = 0;
  private ultimaLectura = 0;
  private ultimoCodigo = '';
  private ultimoCodigoEn = 0;

  cambiarModo(modo: ModoEscaner) {
    this.modo.set(modo);
    this.resultado.set(null);
    // Permite leer enseguida el mismo QR en el otro modo (entrada y después candy).
    this.ultimoCodigo = '';
  }

  async activarCamara() {
    this.errorCamara.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.errorCamara.set('Este navegador no permite usar la cámara. Ingresá el código a mano.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      this.camaraActiva.set(true);
      // Espera a que el <video> aparezca en el template.
      setTimeout(async () => {
        const video = this.video()?.nativeElement;
        if (!video || !this.stream) return;
        video.srcObject = this.stream;
        await video.play();
        this.frame = requestAnimationFrame(() => this.leer());
      });
    } catch (e: any) {
      this.errorCamara.set(
        e?.name === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Podés habilitarlo desde el candado de la barra de direcciones.'
          : 'No se pudo abrir la cámara. Ingresá el código a mano.'
      );
    }
  }

  detenerCamara() {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.camaraActiva.set(false);
  }

  ngOnDestroy() {
    this.detenerCamara();
  }

  alEscribirCodigo(evento: Event) {
    this.codigoManual.set((evento.target as HTMLInputElement).value.toUpperCase());
  }

  async validarManual(evento: Event) {
    evento.preventDefault();
    const codigo = this.codigoManual().trim();
    if (!codigo) return;
    await this.validar(codigo);
    this.codigoManual.set('');
  }

  private leer() {
    const video = this.video()?.nativeElement;
    if (!video || !this.stream) return;

    const ahora = performance.now();
    if (ahora - this.ultimaLectura >= INTERVALO_LECTURA_MS && video.readyState === video.HAVE_ENOUGH_DATA) {
      this.ultimaLectura = ahora;
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imagen = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const qr = jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
        if (qr?.data) this.alDetectar(qr.data);
      }
    }
    this.frame = requestAnimationFrame(() => this.leer());
  }

  // Mientras el mismo QR siga frente a la cámara no se vuelve a validar;
  // recién se acepta otra vez si desaparece por unos segundos.
  private alDetectar(codigo: string) {
    const ahora = Date.now();
    if (this.procesando()) return;
    if (codigo === this.ultimoCodigo && ahora - this.ultimoCodigoEn < PAUSA_MISMO_CODIGO_MS) {
      this.ultimoCodigoEn = ahora;
      return;
    }
    this.ultimoCodigo = codigo;
    this.ultimoCodigoEn = ahora;
    this.validar(codigo);
  }

  private async validar(codigo: string) {
    this.procesando.set(true);
    const modo = this.modo();
    let resultado: ResultadoEscaneo;
    try {
      if (modo === 'candy') {
        const candy = await this.escaner.entregarCandy(codigo);
        resultado = { ok: true, modo, candy, momento: new Date() };
      } else {
        const entrada = await this.escaner.validar(codigo);
        resultado = { ok: true, modo, entrada, momento: new Date() };
      }
      navigator.vibrate?.(120);
    } catch (e: any) {
      resultado = { ok: false, modo, mensaje: e.message, momento: new Date() };
      navigator.vibrate?.([80, 60, 80]);
    }
    this.resultado.set(resultado);
    this.historial.update((lista) => [resultado, ...lista].slice(0, 15));
    this.procesando.set(false);
  }

  resumenCandy(r: ResultadoEscaneo): string {
    if (!r.ok || r.modo !== 'candy') return '';
    return r.candy.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ');
  }

  butaca(r: ResultadoEscaneo): string {
    if (!r.ok || r.modo !== 'entrada') return '';
    const e = r.entrada;
    return e.fila === 'ACC' ? `Fila accesible · Butaca ${e.numero}` : `Fila ${e.fila} · Butaca ${e.numero}`;
  }
}
