import { Formato, Idioma } from './funcion.model';
import { TipoButaca } from './sala.model';
import { ItemCandyCompra } from './candy.model';

// Resultado de escanear el QR de una compra en la entrada a la sala:
// se validan juntas todas sus entradas.
export interface EntradaValidada {
  compra_id: string;
  codigo_manual: string;
  nombre: string | null;
  pelicula: string;
  restriccion_edad: number | null;
  inicio: string;
  formato: Formato;
  idioma: Idioma;
  sala: string;
  butacas: { fila: string; numero: number; tipo: TipoButaca }[];
  tiene_candy: boolean;
}

export interface CandyEntregado {
  compra_id: string;
  nombre: string | null;
  pelicula: string;
  sala: string;
  inicio: string;
  items: ItemCandyCompra[];
}

export type ModoEscaner = 'entrada' | 'candy';

export type ResultadoEscaneo =
  | { ok: true; modo: 'entrada'; entrada: EntradaValidada; momento: Date }
  | { ok: true; modo: 'candy'; candy: CandyEntregado; momento: Date }
  | { ok: false; modo: ModoEscaner; mensaje: string; momento: Date };
