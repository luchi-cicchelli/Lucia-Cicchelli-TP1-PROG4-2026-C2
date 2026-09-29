export type Formato = '2d' | '3d' | '4d' | '5d';
export type Idioma = 'castellano' | 'subtitulada';

export const FORMATOS: Formato[] = ['2d', '3d', '4d', '5d'];
export const IDIOMAS: { valor: Idioma; etiqueta: string }[] = [
  { valor: 'castellano', etiqueta: 'Castellano' },
  { valor: 'subtitulada', etiqueta: 'Subtitulada' }
];

export interface Funcion {
  id: string;
  pelicula_id: string;
  sala_id: number;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  formato: Formato;
  idioma: Idioma;
  precio_base: number;
  precio_vip: number;
  es_preventa: boolean;
  fecha_fin_preventa: string | null;
  precio_preventa: number | null;
}

export interface FuncionConDetalle extends Funcion {
  pelicula: { nombre: string; duracion_minutos: number } | null;
  sala: { nombre: string } | null;
}

export interface NuevasFunciones {
  peliculaId: string;
  inicios: Date[];
  formato: Formato;
  idioma: Idioma;
  precioBase: number;
  precioVip: number;
  esPreventa: boolean;
  fechaFinPreventa: Date | null;
  precioPreventa: number | null;
}

export interface FuncionCreada {
  funcion_id: string;
  inicio: string;
  sala_id: number;
  sala_nombre: string;
}
