import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SalasService } from '../../../core/services/salas.service';
import { Butaca, SalaConTotal } from '../../../core/models/sala.model';
import { MapaButacasComponent } from '../../../shared/components/mapa-butacas/mapa-butacas.component';

@Component({
  selector: 'app-salas-admin',
  standalone: true,
  imports: [RouterLink, MapaButacasComponent],
  templateUrl: './salas-admin.component.html',
  styleUrl: './salas-admin.component.css'
})
export class SalasAdminComponent implements OnInit {
  private readonly salasService = inject(SalasService);

  readonly salas = signal<SalaConTotal[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  readonly nuevoNombre = signal('');
  readonly salaAbierta = signal<number | null>(null);
  readonly butacas = signal<Butaca[]>([]);
  readonly editandoId = signal<number | null>(null);
  readonly confirmarBorrarId = signal<number | null>(null);

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const salas = await this.salasService.listar();
      this.salas.set(salas);
      this.nuevoNombre.set(`Sala ${salas.length + 1}`);
    } catch (e: any) {
      this.error.set('No se pudieron cargar las salas: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async crear() {
    const nombre = this.nuevoNombre().trim();
    if (!nombre) return;
    await this.ejecutar(() => this.salasService.crear(nombre));
  }

  async guardarNombre(sala: SalaConTotal, nombre: string) {
    if (this.editandoId() !== sala.id) return;
    nombre = nombre.trim();
    this.editandoId.set(null);
    if (!nombre || nombre === sala.nombre) return;
    await this.ejecutar(() => this.salasService.renombrar(sala.id, nombre));
  }

  async eliminar(sala: SalaConTotal) {
    if (this.confirmarBorrarId() !== sala.id) {
      this.confirmarBorrarId.set(sala.id);
      return;
    }
    this.confirmarBorrarId.set(null);
    if (this.salaAbierta() === sala.id) this.salaAbierta.set(null);
    await this.ejecutar(() => this.salasService.eliminar(sala.id));
  }

  async verMapa(sala: SalaConTotal) {
    if (this.salaAbierta() === sala.id) {
      this.salaAbierta.set(null);
      return;
    }
    this.salaAbierta.set(sala.id);
    this.butacas.set([]);
    try {
      this.butacas.set(await this.salasService.butacas(sala.id));
    } catch (e: any) {
      this.error.set('No se pudo cargar el mapa: ' + e.message);
    }
  }

  alEscribirNombre(evento: Event) {
    this.nuevoNombre.set((evento.target as HTMLInputElement).value);
  }

  private async ejecutar(accion: () => Promise<void>) {
    this.cargando.set(true);
    this.error.set('');
    try {
      await accion();
      await this.cargar();
    } catch (e: any) {
      this.error.set(e.message);
      this.cargando.set(false);
    }
  }
}
