import { PeliculaConGeneros } from './pelicula.model';

export interface PeliculaCartelera extends PeliculaConGeneros {
  entradasVendidas: number;
  promedio: number | null;
  cantidadResenas: number;
}

export interface Resena {
  id: string;
  estrellas: number;
  comentario: string | null;
  fecha: string;
  autor: string;
}
