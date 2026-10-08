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
  preventa: boolean;
  precio_preventa: number | null;
  dias_preventa: number;
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
  preventa: boolean;
  precio_preventa: number | null;
  dias_preventa: number;
  generoIds: number[];
}

export function fechaEstreno(p: Pelicula): Date {
  const [a, m, d] = p.fecha_estreno.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function aperturaVenta(p: Pelicula): Date {
  const apertura = fechaEstreno(p);
  if (p.preventa) apertura.setDate(apertura.getDate() - p.dias_preventa);
  return apertura;
}

export function ventaAbierta(p: Pelicula): boolean {
  return aperturaVenta(p) <= new Date();
}

export function enPreventa(p: Pelicula): boolean {
  return p.preventa && ventaAbierta(p) && fechaEstreno(p) > new Date();
}
