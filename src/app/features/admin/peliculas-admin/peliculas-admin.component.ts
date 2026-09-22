import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PeliculasService } from '../../../core/services/peliculas.service';
import { Genero, PeliculaConGeneros } from '../../../core/models/pelicula.model';

@Component({
  selector: 'app-peliculas-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './peliculas-admin.component.html',
  styleUrl: './peliculas-admin.component.css'
})
export class PeliculasAdminComponent implements OnInit {
  peliculas: PeliculaConGeneros[] = [];
  generos: Genero[] = [];

  form: FormGroup;
  editandoId: string | null = null;
  mostrarFormulario = false;

  cargando = false;
  error = '';

  constructor(
    private peliculasService: PeliculasService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      sinopsis: ['', Validators.required],
      duracion_minutos: [null, [Validators.required, Validators.min(1)]],
      imagen_url: [''],
      restriccion_edad: [null],
      fecha_estreno: ['', Validators.required],
      activa: [true],
      generoIds: [[] as number[]]
    });
  }

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    this.cargando = true;
    this.error = '';
    try {
      [this.peliculas, this.generos] = await Promise.all([
        this.peliculasService.listarPeliculas(),
        this.peliculasService.listarGeneros()
      ]);
    } catch (e: any) {
      this.error = 'No se pudieron cargar los datos: ' + e.message;
    } finally {
      this.cargando = false;
    }
  }

  abrirNuevaPelicula() {
    this.editandoId = null;
    this.form.reset({ activa: true, generoIds: [] });
    this.mostrarFormulario = true;
  }

  editarPelicula(p: PeliculaConGeneros) {
    this.editandoId = p.id;
    this.form.setValue({
      nombre: p.nombre,
      sinopsis: p.sinopsis,
      duracion_minutos: p.duracion_minutos,
      imagen_url: p.imagen_url ?? '',
      restriccion_edad: p.restriccion_edad,
      fecha_estreno: p.fecha_estreno,
      activa: p.activa,
      generoIds: p.generos.map((g) => g.id)
    });
    this.mostrarFormulario = true;
  }

  cancelar() {
    this.mostrarFormulario = false;
    this.editandoId = null;
  }

  toggleGenero(generoId: number, checked: boolean) {
    const actuales: number[] = this.form.value.generoIds ?? [];
    const nuevos = checked ? [...actuales, generoId] : actuales.filter((id) => id !== generoId);
    this.form.patchValue({ generoIds: nuevos });
  }

  generoSeleccionado(generoId: number): boolean {
    return (this.form.value.generoIds ?? []).includes(generoId);
  }

  generosTexto(p: PeliculaConGeneros): string {
    return p.generos.map((g) => g.nombre).join(', ');
  }

  async guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando = true;
    this.error = '';
    try {
      if (this.editandoId) {
        await this.peliculasService.actualizarPelicula(this.editandoId, this.form.value);
      } else {
        await this.peliculasService.crearPelicula(this.form.value);
      }
      this.mostrarFormulario = false;
      await this.cargarDatos();
    } catch (e: any) {
      this.error = 'No se pudo guardar: ' + e.message;
    } finally {
      this.cargando = false;
    }
  }

  async toggleActiva(p: PeliculaConGeneros) {
    try {
      await this.peliculasService.cambiarActiva(p.id, !p.activa);
      await this.cargarDatos();
    } catch (e: any) {
      this.error = 'No se pudo actualizar: ' + e.message;
    }
  }
}
