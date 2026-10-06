import { Component, inject, input, output, signal } from '@angular/core';
import { CarpetaImagenes, StorageService } from '../../../core/services/storage.service';
import { ImagenRespaldoDirective } from '../../directives/imagen-respaldo.directive';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 2;

@Component({
  selector: 'app-subir-imagen',
  standalone: true,
  imports: [ImagenRespaldoDirective],
  templateUrl: './subir-imagen.component.html',
  styleUrl: './subir-imagen.component.css'
})
export class SubirImagenComponent {
  private readonly storage = inject(StorageService);

  readonly carpeta = input.required<CarpetaImagenes>();
  readonly url = input<string | null>(null);
  readonly subida = output<string>();

  readonly subiendo = signal(false);
  readonly error = signal('');

  async alElegir(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;

    if (!TIPOS.includes(archivo.type)) {
      this.error.set('Tiene que ser JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      this.error.set(`La imagen pesa más de ${MAX_MB} MB.`);
      return;
    }

    this.error.set('');
    this.subiendo.set(true);
    try {
      this.subida.emit(await this.storage.subirImagen(archivo, this.carpeta()));
    } catch (e: any) {
      this.error.set('No se pudo subir: ' + e.message);
    } finally {
      this.subiendo.set(false);
    }
  }
}
