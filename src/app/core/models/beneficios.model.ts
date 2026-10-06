export type TipoCupon = 'general' | 'mayores_50';

export interface Cupon {
  id: string;
  codigo: string;
  tipo: TipoCupon;
  porcentaje_descuento: number;
  edad_minima: number | null;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export type CuponFormValue = Omit<Cupon, 'id'>;

/** Lo que devuelve la base al validar un código. */
export interface CuponValido {
  codigo: string;
  porcentaje: number;
  tipo: TipoCupon;
}

export type TipoRecompensa = 'entrada_gratis' | 'producto_candy';

export interface Recompensa {
  id: string;
  nombre: string;
  puntos_requeridos: number;
  tipo: TipoRecompensa;
  producto_id: string | null;
  activo: boolean;
}

export type RecompensaFormValue = Omit<Recompensa, 'id'>;

export interface Canje {
  recompensa_id: string;
  cantidad: number;
}

export interface MovimientoPuntos {
  id: string;
  tipo: 'ganado' | 'canjeado' | 'devuelto' | 'descontado';
  cantidad: number;
  fecha: string;
  recompensa: { nombre: string } | null;
}
