import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CargandoService {
  private readonly pendientes = signal(0);
  readonly cargando = computed(() => this.pendientes() > 0);

  empezar() {
    this.pendientes.update((n) => n + 1);
  }

  terminar() {
    this.pendientes.update((n) => Math.max(0, n - 1));
  }
}
