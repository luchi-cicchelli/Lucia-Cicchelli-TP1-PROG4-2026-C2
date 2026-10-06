import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { CarteleraService } from '../../core/services/cartelera.service';
import { FuncionesService } from '../../core/services/funciones.service';
import { MiResena, ResenasService } from '../../core/services/resenas.service';
import { PeliculaCartelera, Resena } from '../../core/models/cartelera.model';
import { aperturaVenta, enPreventa, fechaEstreno, ventaAbierta } from '../../core/models/pelicula.model';
import { FuncionConDetalle } from '../../core/models/funcion.model';
import { EstrellasComponent } from '../../shared/components/estrellas/estrellas.component';
import { ImagenRespaldoDirective } from '../../shared/directives/imagen-respaldo.directive';
import { DuracionPipe } from '../../shared/pipes/duracion.pipe';
import { BotonAlertaComponent } from '../../shared/components/boton-alerta/boton-alerta.component';

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
  imports: [RouterLink, ReactiveFormsModule, DatePipe, CurrencyPipe, EstrellasComponent, ImagenRespaldoDirective, DuracionPipe, BotonAlertaComponent],
  templateUrl: './pelicula-detalle.component.html',
  styleUrl: './pelicula-detalle.component.css'
})
export class PeliculaDetalleComponent implements OnInit {
  private readonly cartelera = inject(CarteleraService);
  private readonly funcionesService = inject(FuncionesService);
  private readonly resenasService = inject(ResenasService);
  readonly auth = inject(AuthService);

  // Viene del parámetro :id de la ruta (withComponentInputBinding).
  readonly id = input.required<string>();

  readonly pelicula = signal<PeliculaCartelera | null>(null);
  readonly funciones = signal<FuncionConDetalle[]>([]);
  readonly resenas = signal<Resena[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly diaElegido = signal<string | null>(null);

  // Mi reseña
  readonly miResena = signal<MiResena | null>(null);
  readonly puedeResenar = signal(false);
  readonly editandoResena = signal(false);
  readonly guardandoResena = signal(false);
  readonly errorResena = signal('');
  readonly estrellasOpciones = [1, 2, 3, 4, 5];

  readonly formResena = inject(FormBuilder).nonNullable.group({
    estrellas: [0, [Validators.min(1), Validators.max(5)]],
    comentario: ['', Validators.maxLength(280)]
  });

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

  // Preventa y apertura de la venta (misma regla que en la base de datos).
  readonly ventaAbierta = computed(() => {
    const p = this.pelicula();
    return !!p && ventaAbierta(p);
  });
  readonly apertura = computed(() => {
    const p = this.pelicula();
    return p ? aperturaVenta(p) : null;
  });
  readonly preventaAbierta = computed(() => {
    const p = this.pelicula();
    return !!p && enPreventa(p);
  });
  readonly proximamente = computed(() => {
    const p = this.pelicula();
    return !!p && fechaEstreno(p) > new Date();
  });

  readonly generos = computed(() => this.pelicula()?.generos.map((g) => g.nombre).join(' · ') ?? '');

  async ngOnInit() {
    try {
      const [pelicula, funciones, resenas] = await Promise.all([
        this.cartelera.obtener(this.id()),
        this.funcionesService.listarProximas(this.id()),
        this.cartelera.resenas(this.id()).catch(() => [])
      ]);
      this.pelicula.set(pelicula);
      this.funciones.set(funciones);
      this.resenas.set(resenas);
      await this.cargarMiResena();
    } catch (e: any) {
      this.error.set('No se pudo cargar la película: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarMiResena() {
    const usuarioId = this.auth.perfil()?.id;
    if (!usuarioId) return;
    try {
      const [mia, vio] = await Promise.all([
        this.resenasService.mia(usuarioId, this.id()),
        this.resenasService.vioPelicula(this.id())
      ]);
      this.miResena.set(mia);
      this.puedeResenar.set(vio);
    } catch {
      this.puedeResenar.set(false);
    }
  }

  empezarResena() {
    const mia = this.miResena();
    this.formResena.reset({ estrellas: mia?.estrellas ?? 0, comentario: mia?.comentario ?? '' });
    this.errorResena.set('');
    this.editandoResena.set(true);
  }

  async guardarResena() {
    const usuarioId = this.auth.perfil()?.id;
    if (!usuarioId || this.formResena.invalid || this.formResena.value.estrellas === 0) {
      this.formResena.markAllAsTouched();
      this.errorResena.set('Elegí de 1 a 5 estrellas.');
      return;
    }
    this.guardandoResena.set(true);
    this.errorResena.set('');
    try {
      const { estrellas, comentario } = this.formResena.getRawValue();
      await this.resenasService.guardar(usuarioId, this.id(), estrellas, comentario);
      this.editandoResena.set(false);
      await this.recargarResenas();
    } catch (e: any) {
      this.errorResena.set('No se pudo guardar la reseña: ' + e.message);
    } finally {
      this.guardandoResena.set(false);
    }
  }

  async borrarResena() {
    const usuarioId = this.auth.perfil()?.id;
    if (!usuarioId) return;
    try {
      await this.resenasService.borrar(usuarioId, this.id());
      await this.recargarResenas();
    } catch (e: any) {
      this.errorResena.set('No se pudo borrar la reseña: ' + e.message);
    }
  }

  // Recarga la lista y la película (para actualizar el promedio).
  private async recargarResenas() {
    const [pelicula, resenas] = await Promise.all([
      this.cartelera.obtener(this.id()),
      this.cartelera.resenas(this.id())
    ]);
    this.pelicula.set(pelicula);
    this.resenas.set(resenas);
    await this.cargarMiResena();
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
