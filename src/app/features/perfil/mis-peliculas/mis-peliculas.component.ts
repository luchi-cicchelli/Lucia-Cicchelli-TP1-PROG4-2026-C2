import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ComprasService } from '../../../core/services/compras.service';
import { ResenasService } from '../../../core/services/resenas.service';
import { EstrellasComponent } from '../../../shared/components/estrellas/estrellas.component';

interface PeliculaVista {
  id: string;
  nombre: string;
  imagen_url: string | null;
  fechas: Date[];
  miPuntaje: number | null;
}

@Component({
  selector: 'app-mis-peliculas',
  standalone: true,
  imports: [RouterLink, DatePipe, EstrellasComponent],
  templateUrl: './mis-peliculas.component.html',
  styleUrl: './mis-peliculas.component.css'
})
export class MisPeliculasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly compras = inject(ComprasService);
  private readonly resenas = inject(ResenasService);

  readonly peliculas = signal<PeliculaVista[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  // Una película "vista" = una compra no cancelada cuya función ya empezó.
  async ngOnInit() {
    const id = this.auth.perfil()?.id;
    if (!id) return;
    try {
      const [compras, resenas] = await Promise.all([this.compras.misCompras(id), this.resenas.mias(id)]);
      const porPelicula = new Map<string, PeliculaVista>();

      for (const compra of compras) {
        if (compra.cancelada_en) continue;
        const funcion = compra.entradas[0]?.funcion;
        if (!funcion?.pelicula) continue;
        const fecha = new Date(funcion.fecha_hora_inicio);
        if (fecha > new Date()) continue;

        const p = funcion.pelicula;
        if (!porPelicula.has(p.id)) {
          const resena = resenas.find((r) => r.pelicula_id === p.id);
          porPelicula.set(p.id, { ...p, fechas: [], miPuntaje: resena?.estrellas ?? null });
        }
        porPelicula.get(p.id)!.fechas.push(fecha);
      }

      this.peliculas.set(
        [...porPelicula.values()].sort((a, b) => Math.max(...b.fechas.map(Number)) - Math.max(...a.fechas.map(Number)))
      );
    } catch (e: any) {
      this.error.set('No se pudo cargar tu historial: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
