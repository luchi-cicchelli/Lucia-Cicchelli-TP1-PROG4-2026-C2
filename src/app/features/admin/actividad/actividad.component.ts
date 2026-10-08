import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReportesService } from '../../../core/services/reportes.service';
import { ACCIONES, LogActividad } from '../../../core/models/reporte.model';
import { HacePipe } from '../../../shared/pipes/hace.pipe';

const POR_PAGINA = 20;

const FILTROS = [
  { etiqueta: 'Todo', acciones: [] },
  { etiqueta: 'Funciones', acciones: ['creo_funciones', 'borro_funcion'] },
  { etiqueta: 'Precios', acciones: ['modifico_precio'] },
  { etiqueta: 'Validaciones', acciones: ['valido_qr', 'entrego_candy'] },
  { etiqueta: 'Cancelaciones', acciones: ['cancelo_compra'] },
  { etiqueta: 'Películas y cupones', acciones: ['creo_pelicula', 'edito_pelicula', 'creo_cupon', 'modifico_cupon'] },
  { etiqueta: 'Roles', acciones: ['cambio_rol'] }
];

@Component({
  selector: 'app-actividad',
  standalone: true,
  imports: [RouterLink, DatePipe, HacePipe],
  templateUrl: './actividad.component.html',
  styleUrl: './actividad.component.css'
})
export class ActividadComponent implements OnInit {
  private readonly reportes = inject(ReportesService);

  readonly filtros = FILTROS;
  readonly filtro = signal(FILTROS[0]);
  readonly logs = signal<LogActividad[]>([]);
  readonly pagina = signal(0);
  readonly hayMas = signal(false);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly busqueda = signal('');

  readonly visibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    if (!texto) return this.logs();
    return this.logs().filter((l) =>
      [this.quien(l), l.detalle ?? '', this.accion(l.accion)].join(' ').toLowerCase().includes(texto)
    );
  });

  async ngOnInit() {
    await this.cargar(true);
  }

  async elegirFiltro(f: (typeof FILTROS)[number]) {
    this.filtro.set(f);
    await this.cargar(true);
  }

  async cargar(desdeCero = false) {
    if (desdeCero) this.pagina.set(0);
    this.cargando.set(true);
    this.error.set('');
    try {
      const nuevos = await this.reportes.logs(this.pagina(), POR_PAGINA, this.filtro().acciones);
      this.logs.update((actual) => (desdeCero ? nuevos : [...actual, ...nuevos]));
      this.hayMas.set(nuevos.length === POR_PAGINA);
    } catch (e: any) {
      this.error.set('No se pudo cargar el log: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarMas() {
    this.pagina.update((p) => p + 1);
    await this.cargar();
  }

  accion(clave: string): string {
    return ACCIONES[clave] ?? clave;
  }

  quien(l: LogActividad): string {
    if (!l.usuario) return 'Sistema';
    return `${l.usuario.nombre} ${l.usuario.apellido}`;
  }

  alBuscar(evento: Event) {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }
}
