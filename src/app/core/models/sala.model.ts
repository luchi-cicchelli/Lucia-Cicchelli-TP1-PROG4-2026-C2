export type TipoButaca = 'normal' | 'accesible' | 'vip';

export interface Sala {
  id: number;
  nombre: string;
}

export interface SalaConTotal extends Sala {
  totalButacas: number;
}

export interface Butaca {
  id: string;
  sala_id: number;
  fila: string;
  numero: number;
  tipo: TipoButaca;
}

export const ORDEN_FILAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'ACC', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
