import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-estrellas',
  standalone: true,
  template: `
    <span class="estrellas" [attr.aria-label]="etiqueta()">
      <span class="estrellas__fondo">★★★★★</span>
      <span class="estrellas__relleno" [style.width.%]="porcentaje()">★★★★★</span>
    </span>
    @if (mostrarNumero() && valor() !== null) {
      <span class="estrellas__numero">{{ valor() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; }
    .estrellas { position: relative; display: inline-block; line-height: 1; letter-spacing: 1px; }
    .estrellas__fondo { color: var(--borde); }
    .estrellas__relleno { position: absolute; inset: 0 auto 0 0; overflow: hidden; white-space: nowrap; color: var(--rosa-acento); }
    .estrellas__numero { font-size: 0.8rem; color: var(--texto-secundario); }
  `
})
export class EstrellasComponent {
  readonly valor = input<number | null>(null);
  readonly mostrarNumero = input(true);

  readonly porcentaje = computed(() => ((this.valor() ?? 0) / 5) * 100);
  readonly etiqueta = computed(() =>
    this.valor() === null ? 'Sin calificaciones' : `${this.valor()} de 5 estrellas`
  );
}
