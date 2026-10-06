import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PeliculaCartelera } from '../../../core/models/cartelera.model';
import { enPreventa, fechaEstreno } from '../../../core/models/pelicula.model';
import { EstrellasComponent } from '../estrellas/estrellas.component';
import { ImagenRespaldoDirective } from '../../directives/imagen-respaldo.directive';
import { DuracionPipe } from '../../pipes/duracion.pipe';

@Component({
  selector: 'app-tarjeta-pelicula',
  standalone: true,
  imports: [RouterLink, DatePipe, EstrellasComponent, ImagenRespaldoDirective, DuracionPipe],
  templateUrl: './tarjeta-pelicula.component.html',
  styleUrl: './tarjeta-pelicula.component.css'
})
export class TarjetaPeliculaComponent {
  readonly pelicula = input.required<PeliculaCartelera>();
  readonly posicion = input<number | null>(null);
  readonly proximamente = input(false);

  readonly generos = computed(() => this.pelicula().generos.map((g) => g.nombre).join(' · '));

  readonly estreno = computed(() => fechaEstreno(this.pelicula()));
  readonly preventaAbierta = computed(() => enPreventa(this.pelicula()));
}
