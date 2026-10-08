import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PeliculasService } from '../../../core/services/peliculas.service';
import { AlertasService } from '../../../core/services/alertas.service';
import { Genero, PeliculaConGeneros } from '../../../core/models/pelicula.model';
import { SelectorFechaComponent } from '../../../shared/components/selector-fecha/selector-fecha.component';
import { SubirImagenComponent } from '../../../shared/components/subir-imagen/subir-imagen.component';
import { ImagenRespaldoDirective, POSTER_RESPALDO } from '../../../shared/directives/imagen-respaldo.directive';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { TextoCortoPipe } from '../../../shared/pipes/texto-corto.pipe';

// Si la película tiene preventa, el precio y los días son obligatorios.
const preventaValida: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  if (!grupo.get('preventa')?.value) return null;
  const precio = Number(grupo.get('precio_preventa')?.value);
  const dias = Number(grupo.get('dias_preventa')?.value);
  return !precio || precio <= 0 || !dias || dias < 1 || dias > 30 ? { preventaIncompleta: true } : null;
};

function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

@Component({
  selector: 'app-peliculas-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    SubirImagenComponent,
    SelectorFechaComponent,
    ImagenRespaldoDirective,
    DuracionPipe,
    TextoCortoPipe
  ],
  templateUrl: './peliculas-admin.component.html',
  styleUrl: './peliculas-admin.component.css'
})
export class PeliculasAdminComponent implements OnInit {
  private readonly peliculasService = inject(PeliculasService);
  private readonly alertas = inject(AlertasService);

  readonly posterRespaldo = POSTER_RESPALDO;
  readonly anioActual = new Date().getFullYear();

  readonly peliculas = signal<PeliculaConGeneros[]>([]);
  readonly generos = signal<Genero[]>([]);
  readonly editandoId = signal<string | null>(null);
  readonly formAbierto = signal(false);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly enviandoAlertas = signal(false);
  readonly mensaje = signal('');

  readonly form = inject(FormBuilder).nonNullable.group(
    {
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    sinopsis: ['', [Validators.required, Validators.maxLength(1000)]],
    duracion_minutos: [null as number | null, [Validators.required, Validators.min(1), Validators.max(600)]],
    imagen_url: [''],
    restriccion_edad: [null as number | null],
    fecha_estreno: ['', Validators.required],
    activa: [true],
    preventa: [false],
    precio_preventa: [null as number | null],
    dias_preventa: [7],
    generoIds: [[] as number[]]
    },
    { validators: preventaValida }
  );

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [peliculas, generos] = await Promise.all([
        this.peliculasService.listarPeliculas(),
        this.peliculasService.listarGeneros()
      ]);
      this.peliculas.set(peliculas);
      this.generos.set(generos);
    } catch (e: any) {
      this.error.set('No se pudieron cargar los datos: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  nueva() {
    this.editandoId.set(null);
    this.form.reset({
      activa: true,
      generoIds: [],
      restriccion_edad: null,
      duracion_minutos: null,
      preventa: false,
      precio_preventa: null,
      dias_preventa: 7
    });
    this.formAbierto.set(true);
  }

  editar(p: PeliculaConGeneros) {
    this.editandoId.set(p.id);
    this.form.reset({
      nombre: p.nombre,
      sinopsis: p.sinopsis,
      duracion_minutos: p.duracion_minutos,
      imagen_url: p.imagen_url ?? '',
      restriccion_edad: p.restriccion_edad,
      fecha_estreno: p.fecha_estreno,
      activa: p.activa,
      preventa: p.preventa,
      precio_preventa: p.precio_preventa,
      dias_preventa: p.dias_preventa,
      generoIds: p.generos.map((g) => g.id)
    });
    this.formAbierto.set(true);
  }

  alSubirImagen(url: string) {
    this.form.controls.imagen_url.setValue(url);
  }

  generoElegido(id: number): boolean {
    return this.form.controls.generoIds.value.includes(id);
  }

  toggleGenero(id: number) {
    const actuales = this.form.controls.generoIds.value;
    this.form.controls.generoIds.setValue(
      actuales.includes(id) ? actuales.filter((g) => g !== id) : [...actuales, id]
    );
  }

  generosTexto(p: PeliculaConGeneros): string {
    return p.generos.map((g) => g.nombre).join(', ');
  }

  estreno(p: PeliculaConGeneros): Date {
    return fechaLocal(p.fecha_estreno);
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const datos = {
      ...v,
      nombre: v.nombre.trim(),
      sinopsis: v.sinopsis.trim(),
      duracion_minutos: Number(v.duracion_minutos),
      imagen_url: v.imagen_url.trim(),
      precio_preventa: v.preventa ? Number(v.precio_preventa) : null,
      dias_preventa: Number(v.dias_preventa) || 7
    };

    this.guardando.set(true);
    this.error.set('');
    try {
      const id = this.editandoId();
      if (id) await this.peliculasService.actualizarPelicula(id, datos);
      else await this.peliculasService.crearPelicula(datos);
      this.formAbierto.set(false);
      await this.cargar();
    } catch (e: any) {
      this.error.set('No se pudo guardar: ' + e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  // Llama a la Edge Function que manda los mails de "ya salieron las entradas".
  async enviarAlertas() {
    this.enviandoAlertas.set(true);
    this.error.set('');
    this.mensaje.set('');
    try {
      const r = await this.alertas.enviarPendientes();
      const sinEnviar = r.sinEnviar ? ` ${r.sinEnviar} no se pudieron enviar: quedan pendientes.` : '';
      this.mensaje.set(
        r.alertas === 0
          ? 'No hay alertas pendientes: ninguna película con alertas abrió su venta todavía.'
          : `Alertas: ${r.alertas}. Mails enviados: ${r.mails}.${sinEnviar}`
      );
    } catch (e: any) {
      this.error.set('No se pudieron enviar las alertas: ' + (e.error?.error ?? e.message));
    } finally {
      this.enviandoAlertas.set(false);
    }
  }

  async toggleActiva(p: PeliculaConGeneros) {
    try {
      await this.peliculasService.cambiarActiva(p.id, !p.activa);
      await this.cargar();
    } catch (e: any) {
      this.error.set('No se pudo actualizar: ' + e.message);
    }
  }
}
