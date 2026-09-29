import { Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PeliculaCartelera } from '../../../core/models/cartelera.model';
import { EstrellasComponent } from '../estrellas/estrellas.component';

@Component({
  selector: 'app-tarjeta-pelicula',
  standalone: true,
  imports: [RouterLink, DatePipe, EstrellasComponent],
  templateUrl: './tarjeta-pelicula.component.html',
  styleUrl: './tarjeta-pelicula.component.css'
})
export class TarjetaPeliculaComponent {
  readonly pelicula = input.required<PeliculaCartelera>();
  readonly posicion = input<number | null>(null);
  readonly proximamente = input(false);

  readonly imagenRota = signal(false);
  readonly generos = computed(() => this.pelicula().generos.map((g) => g.nombre).join(' · '));

  fechaEstreno(): Date {
    const [a, m, d] = this.pelicula().fecha_estreno.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
}
