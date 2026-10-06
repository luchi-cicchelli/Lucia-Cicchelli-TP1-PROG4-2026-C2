import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, UpperCasePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { FuncionesService } from '../../../core/services/funciones.service';
import { PeliculasService } from '../../../core/services/peliculas.service';
import { PeliculaConGeneros } from '../../../core/models/pelicula.model';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { SelectorFechaComponent } from '../../../shared/components/selector-fecha/selector-fecha.component';
import { SelectorHoraComponent } from '../../../shared/components/selector-hora/selector-hora.component';
import {
  FORMATOS,
  Formato,
  FuncionConDetalle,
  FuncionCreada,
  IDIOMAS,
  Idioma
} from '../../../core/models/funcion.model';

const MAX_DIAS_RANGO = 90;
const MAX_FUNCIONES = 150;

const DIAS_SEMANA = [
  { valor: 1, etiqueta: 'Lun' },
  { valor: 2, etiqueta: 'Mar' },
  { valor: 3, etiqueta: 'Mié' },
  { valor: 4, etiqueta: 'Jue' },
  { valor: 5, etiqueta: 'Vie' },
  { valor: 6, etiqueta: 'Sáb' },
  { valor: 0, etiqueta: 'Dom' }
];

function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function aIso(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

const rangoValido: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  const desde = grupo.get('desde')?.value;
  const hasta = grupo.get('hasta')?.value;
  if (!desde || !hasta) return null;
  if (hasta < desde) return { rangoInvertido: true };
  const dias = (fechaLocal(hasta).getTime() - fechaLocal(desde).getTime()) / 86_400_000;
  return dias > MAX_DIAS_RANGO ? { rangoLargo: true } : null;
};

@Component({
  selector: 'app-funciones-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, CurrencyPipe, UpperCasePipe, DuracionPipe, SelectorFechaComponent, SelectorHoraComponent],
  templateUrl: './funciones-admin.component.html',
  styleUrl: './funciones-admin.component.css'
})
export class FuncionesAdminComponent implements OnInit {
  private readonly funcionesService = inject(FuncionesService);
  private readonly peliculasService = inject(PeliculasService);
  private readonly fb = inject(FormBuilder);

  readonly formatos = FORMATOS;
  readonly idiomas = IDIOMAS;
  readonly diasSemana = DIAS_SEMANA;
  readonly hoy = aIso(new Date());
  readonly anioActual = new Date().getFullYear();

  readonly peliculas = signal<PeliculaConGeneros[]>([]);
  readonly funciones = signal<FuncionConDetalle[]>([]);
  readonly filtroPelicula = signal('');
  readonly mostrarFormulario = signal(false);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly creadas = signal<FuncionCreada[]>([]);
  readonly confirmarBorrarId = signal<string | null>(null);
  readonly editandoPrecioId = signal<string | null>(null);

  readonly formPrecio = this.fb.nonNullable.group({
    base: [0, [Validators.required, Validators.min(1)]],
    vip: [0, [Validators.required, Validators.min(1)]]
  });

  readonly form = this.fb.nonNullable.group(
    {
      peliculaId: ['', Validators.required],
      formato: ['2d' as Formato, Validators.required],
      idioma: ['castellano' as Idioma, Validators.required],
      precioBase: [null as number | null, [Validators.required, Validators.min(1)]],
      precioVip: [null as number | null, [Validators.required, Validators.min(1)]],
      dias: [[] as number[], Validators.required],
      horarios: this.fb.nonNullable.array([this.fb.nonNullable.control('18:00', Validators.required)]),
      desde: [this.hoy, Validators.required],
      hasta: [aIso(sumarDias(new Date(), 13)), Validators.required]
    },
    { validators: rangoValido }
  );

  private readonly valores = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );

  // Todos los horarios de inicio que salen de combinar días, horas y rango de fechas.
  readonly inicios = computed<Date[]>(() => {
    const v = this.valores();
    if (!v.desde || !v.hasta || v.hasta < v.desde || v.dias.length === 0) return [];

    const ahora = new Date();
    const resultado: Date[] = [];
    let dia = fechaLocal(v.desde);
    const fin = fechaLocal(v.hasta);

    for (let i = 0; dia <= fin && i <= MAX_DIAS_RANGO; i++, dia = sumarDias(dia, 1)) {
      if (!v.dias.includes(dia.getDay())) continue;
      for (const horario of v.horarios) {
        if (!horario) continue;
        const [h, m] = horario.split(':').map(Number);
        const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m);
        if (inicio > ahora) resultado.push(inicio);
      }
    }
    return resultado.sort((a, b) => a.getTime() - b.getTime());
  });

  readonly peliculaElegida = computed(() =>
    this.peliculas().find((p) => p.id === this.valores().peliculaId) ?? null
  );

  readonly funcionesPorDia = computed(() => {
    const grupos: { dia: string; funciones: FuncionConDetalle[] }[] = [];
    for (const f of this.funciones()) {
      const dia = aIso(new Date(f.fecha_hora_inicio));
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === dia) ultimo.funciones.push(f);
      else grupos.push({ dia, funciones: [f] });
    }
    return grupos;
  });

  get horarios() {
    return this.form.controls.horarios;
  }

  async ngOnInit() {
    try {
      const peliculas = await this.peliculasService.listarPeliculas();
      this.peliculas.set(peliculas.filter((p) => p.activa));
    } catch (e: any) {
      this.error.set('No se pudieron cargar las películas: ' + e.message);
    }
    await this.cargarFunciones();
  }

  async cargarFunciones() {
    this.cargando.set(true);
    try {
      this.funciones.set(await this.funcionesService.listarProximas(this.filtroPelicula() || undefined));
    } catch (e: any) {
      this.error.set('No se pudieron cargar las funciones: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async filtrar(evento: Event) {
    this.filtroPelicula.set((evento.target as HTMLSelectElement).value);
    await this.cargarFunciones();
  }

  abrirFormulario() {
    this.creadas.set([]);
    this.error.set('');
    this.mostrarFormulario.set(true);
  }

  alElegirPelicula() {
    const p = this.peliculaElegida();
    if (!p) return;
    const estreno = fechaLocal(p.fecha_estreno);
    if (estreno > new Date()) {
      this.form.patchValue({ desde: aIso(estreno) });
    }
  }

  diaElegido(dia: number): boolean {
    return this.valores().dias.includes(dia);
  }

  toggleDia(dia: number) {
    const dias = this.form.controls.dias.value;
    this.form.controls.dias.setValue(dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia]);
    this.form.controls.dias.markAsTouched();
  }

  agregarHorario() {
    this.horarios.push(this.fb.nonNullable.control('21:00', Validators.required));
  }

  quitarHorario(i: number) {
    if (this.horarios.length > 1) this.horarios.removeAt(i);
  }

  async crear() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const inicios = this.inicios();
    if (inicios.length === 0) {
      this.error.set('Con esos días y fechas no queda ningún horario futuro.');
      return;
    }
    if (inicios.length > MAX_FUNCIONES) {
      this.error.set(`Son ${inicios.length} funciones; el máximo por vez es ${MAX_FUNCIONES}. Achicá el rango.`);
      return;
    }

    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.error.set('');
    try {
      const creadas = await this.funcionesService.crear({
        peliculaId: v.peliculaId,
        inicios,
        formato: v.formato,
        idioma: v.idioma,
        precioBase: Number(v.precioBase),
        precioVip: Number(v.precioVip)
      });
      this.creadas.set(creadas);
      this.mostrarFormulario.set(false);
      await this.cargarFunciones();
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  editarPrecio(f: FuncionConDetalle) {
    this.formPrecio.reset({ base: f.precio_base, vip: f.precio_vip });
    this.editandoPrecioId.set(f.id);
  }

  async guardarPrecio(f: FuncionConDetalle) {
    if (this.formPrecio.invalid) return;
    const { base, vip } = this.formPrecio.getRawValue();
    this.error.set('');
    try {
      await this.funcionesService.cambiarPrecio(f.id, Number(base), Number(vip));
      this.funciones.update((lista) =>
        lista.map((x) => (x.id === f.id ? { ...x, precio_base: Number(base), precio_vip: Number(vip) } : x))
      );
      this.editandoPrecioId.set(null);
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  async eliminar(f: FuncionConDetalle) {
    if (this.confirmarBorrarId() !== f.id) {
      this.confirmarBorrarId.set(f.id);
      return;
    }
    this.confirmarBorrarId.set(null);
    this.error.set('');
    try {
      await this.funcionesService.eliminar(f.id);
      this.funciones.update((lista) => lista.filter((x) => x.id !== f.id));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  fechaDesdeIso(iso: string): Date {
    return fechaLocal(iso);
  }
}
