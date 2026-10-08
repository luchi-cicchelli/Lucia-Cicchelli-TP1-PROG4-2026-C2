import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CarteleraService } from '../../core/services/cartelera.service';
import { PeliculaCartelera } from '../../core/models/cartelera.model';
import { Genero, ventaAbierta } from '../../core/models/pelicula.model';
import { TarjetaPeliculaComponent } from '../../shared/components/tarjeta-pelicula/tarjeta-pelicula.component';
import { BotonAlertaComponent } from '../../shared/components/boton-alerta/boton-alerta.component';
import { RouterLink } from '@angular/router';

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TarjetaPeliculaComponent, BotonAlertaComponent, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  private readonly cartelera = inject(CarteleraService);

  readonly peliculas = signal<PeliculaCartelera[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  readonly ventaAbierta = ventaAbierta;

  readonly busqueda = signal('');
  // Pestaña de abajo: películas en cartel o próximos estrenos.
  readonly pestania = signal<'cartel' | 'proximamente'>('cartel');
  readonly generosElegidos = signal<ReadonlySet<number>>(new Set());

  readonly enCartel = computed(() => this.peliculas().filter((p) => p.fecha_estreno <= hoyIso()));

  readonly proximamente = computed(() =>
    this.peliculas()
      .filter((p) => p.fecha_estreno > hoyIso())
      .sort((a, b) => a.fecha_estreno.localeCompare(b.fecha_estreno))
  );

  readonly hayVentas = computed(() => this.enCartel().some((p) => p.entradasVendidas > 0));

  readonly destacadas = computed(() => {
    const lista = [...this.enCartel()];
    if (this.hayVentas()) {
      lista.sort((a, b) => b.entradasVendidas - a.entradasVendidas);
    }
    return lista.slice(0, 3);
  });

  readonly generosDisponibles = computed<Genero[]>(() => {
    const mapa = new Map<number, Genero>();
    for (const p of this.enCartel()) for (const g of p.generos) mapa.set(g.id, g);
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  readonly filtradas = computed(() => {
    const texto = normalizar(this.busqueda().trim());
    const generos = this.generosElegidos();
    return this.enCartel().filter((p) => {
      const coincideTexto =
        !texto || normalizar(p.nombre).includes(texto) || normalizar(p.sinopsis).includes(texto);
      const coincideGenero = generos.size === 0 || p.generos.some((g) => generos.has(g.id));
      return coincideTexto && coincideGenero;
    });
  });

  readonly hayFiltros = computed(() => this.busqueda().trim() !== '' || this.generosElegidos().size > 0);

  async ngOnInit() {
    try {
      this.peliculas.set(await this.cartelera.listar());
    } catch (e: any) {
      this.error.set('No se pudo cargar la cartelera: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  alBuscar(evento: Event) {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  toggleGenero(id: number) {
    this.generosElegidos.update((actual) => {
      const nuevo = new Set(actual);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      return nuevo;
    });
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.generosElegidos.set(new Set());
  }
}
