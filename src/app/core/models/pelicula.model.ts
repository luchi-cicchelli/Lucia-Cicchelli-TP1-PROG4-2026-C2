export interface Genero {
  id: number;
  nombre: string;
}

export interface Pelicula {
  id: string;
  nombre: string;
  sinopsis: string;
  duracion_minutos: number;
  imagen_url: string | null;
  restriccion_edad: number | null;
  fecha_estreno: string; 
  activa: boolean;
}

export interface PeliculaConGeneros extends Pelicula {
  generos: Genero[];
}

export interface PeliculaFormValue {
  nombre: string;
  sinopsis: string;
  duracion_minutos: number;
  imagen_url: string;
  restriccion_edad: number | null;
  fecha_estreno: string;
  activa: boolean;
  generoIds: number[];
}
