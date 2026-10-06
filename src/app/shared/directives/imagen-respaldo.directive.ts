import { Directive, ElementRef, inject, input } from '@angular/core';

export const POSTER_RESPALDO = 'img/sin-poster.svg';

// Si la imagen no carga (URL rota o borrada), muestra una imagen de respaldo.
// Uso: <img [src]="url" appImagenRespaldo />
@Directive({
  selector: 'img[appImagenRespaldo]',
  standalone: true,
  host: {
    '(error)': 'usarRespaldo()'
  }
})
export class ImagenRespaldoDirective {
  private readonly el: ElementRef<HTMLImageElement> = inject(ElementRef);
  readonly respaldo = input('', { alias: 'appImagenRespaldo' });

  usarRespaldo() {
    const img = this.el.nativeElement;
    const respaldo = this.respaldo() || POSTER_RESPALDO;
    // Evita un loop si también falla la de respaldo.
    if (!img.src.endsWith(respaldo)) {
      img.src = respaldo;
    }
  }
}
