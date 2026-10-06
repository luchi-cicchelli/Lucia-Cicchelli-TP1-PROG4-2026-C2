import { Formato, Idioma } from './funcion.model';
import { TipoButaca } from './sala.model';

export interface EntradaValidada {
  entrada_id: string;
  codigo_manual: string;
  pelicula: string;
  restriccion_edad: number | null;
  inicio: string;
  formato: Formato;
  idioma: Idioma;
  sala: string;
  fila: string;
  numero: number;
  tipo: TipoButaca;
}

export type ResultadoEscaneo =
  | { ok: true; entrada: EntradaValidada; momento: Date }
  | { ok: false; mensaje: string; momento: Date };
