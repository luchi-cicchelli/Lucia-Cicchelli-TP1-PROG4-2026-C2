import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CarteleraService } from '../../core/services/cartelera.service';
import { FuncionesService } from '../../core/services/funciones.service';
import { PeliculaCartelera, Resena } from '../../core/models/cartelera.model';
import { FuncionConDetalle } from '../../core/models/funcion.model';
import { EstrellasComponent } from '../../shared/components/estrellas/estrellas.component';

interface DiaFunciones {
  clave: string;
  fecha: Date;
  grupos: { etiqueta: string; funciones: FuncionConDetalle[] }[];
}

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

@Component({
  selector: 'app-pelicula-detalle',
  standalone: true,
  imports: [RouterLink, DatePipe, CurrencyPipe, EstrellasComponent],
  templateUrl: './pelicula-detalle.component.html',
  styleUrl: './pelicula-detalle.component.css'
})
export class PeliculaDetalleComponent implements OnInit {
  private readonly cartelera = inject(CarteleraService);
  private readonly funcionesService = inject(FuncionesService);
  readonly auth = inject(AuthService);

  // Viene del parámetro :id de la ruta (withComponentInputBinding).
  readonly id = input.required<string>();

  readonly pelicula = signal<PeliculaCartelera | null>(null);
  readonly funciones = signal<FuncionConDetalle[]>([]);
  readonly resenas = signal<Resena[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly imagenRota = signal(false);
  readonly diaElegido = signal<string | null>(null);

  readonly dias = computed<DiaFunciones[]>(() => {
    const porDia = new Map<string, DiaFunciones>();
    for (const f of this.funciones()) {
      const inicio = new Date(f.fecha_hora_inicio);
      const clave = claveDia(inicio);
      if (!porDia.has(clave)) porDia.set(clave, { clave, fecha: inicio, grupos: [] });
      const dia = porDia.get(clave)!;
      const etiqueta = `${f.formato.toUpperCase()} · ${f.idioma === 'castellano' ? 'Castellano' : 'Subtitulada'}`;
      let grupo = dia.grupos.find((g) => g.etiqueta === etiqueta);
      if (!grupo) dia.grupos.push((grupo = { etiqueta, funciones: [] }));
      grupo.funciones.push(f);
    }
    return [...porDia.values()];
  });

  readonly diaActual = computed<DiaFunciones | null>(() => {
    const dias = this.dias();
    return dias.find((d) => d.clave === this.diaElegido()) ?? dias[0] ?? null;
  });

  readonly bloqueadaPorEdad = computed(() => {
    const restriccion = this.pelicula()?.restriccion_edad;
    const edad = this.auth.edad();
    return !!restriccion && edad !== null && edad < restriccion;
  });

  readonly generos = computed(() => this.pelicula()?.generos.map((g) => g.nombre).join(' · ') ?? '');

  async ngOnInit() {
    try {
      const [pelicula, funciones, resenas] = await Promise.all([
        this.cartelera.obtener(this.id()),
        this.funcionesService.listarProximas(this.id()),
        this.cartelera.resenas(this.id())
      ]);
      this.pelicula.set(pelicula);
      this.funciones.set(funciones);
      this.resenas.set(resenas);
    } catch (e: any) {
      this.error.set('No se pudo cargar la película: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  enPreventa(f: FuncionConDetalle): boolean {
    return f.es_preventa && !!f.fecha_fin_preventa && new Date(f.fecha_fin_preventa) > new Date();
  }

  fechaEstreno(): Date | null {
    const p = this.pelicula();
    if (!p) return null;
    const [a, m, d] = p.fecha_estreno.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
}
