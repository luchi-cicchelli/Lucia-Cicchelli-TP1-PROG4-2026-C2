import { Formato, Funcion, Idioma } from './funcion.model';
import { TipoButaca } from './sala.model';
import { ItemCandyCompra, ItemCarrito } from './candy.model';
import { Canje } from './beneficios.model';

export type EstadoButaca = 'vendida' | 'reservada' | 'mia';

export type MetodoPago = 'tarjeta_credito' | 'tarjeta_debito' | 'mercado_pago';

export const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'tarjeta_credito', etiqueta: 'Tarjeta de crédito' },
  { valor: 'tarjeta_debito', etiqueta: 'Tarjeta de débito' },
  { valor: 'mercado_pago', etiqueta: 'Mercado Pago' }
];

export interface EntradaDetalle {
  id: string;
  fila: string;
  numero: number;
  tipo: TipoButaca;
  precio_pagado: number;
  qr_codigo: string;
  codigo_manual: string;
  estado: 'activa' | 'validada' | 'cancelada';
}

export interface CompraDetalle {
  id: string;
  fecha: string;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: MetodoPago;
  puntos_ganados: number;
  pelicula: { nombre: string; restriccion_edad: number | null; imagen_url: string | null };
  funcion: { inicio: string; fin: string; formato: Formato; idioma: Idioma; sala: string };
  entradas: EntradaDetalle[];
  candy?: ItemCandyCompra[];
  candy_retirado?: boolean;
  descuento_canjes?: number;
  credito_usado?: number;
  puntos_usados?: number;
  cupon?: string | null;
  cancelada?: boolean;
}

export interface OpcionesCompra {
  items: ItemCarrito[];
  cupon: string | null;
  usarCredito: boolean;
  canjes: Canje[];
}

/** Una compra del usuario, para "Mis entradas" y "Mis películas". */
export interface MiCompra {
  id: string;
  fecha: string;
  total: number;
  cancelada_en: string | null;
  candy_retirado: boolean;
  entradas: {
    id: string;
    estado: 'activa' | 'validada' | 'cancelada';
    funcion: {
      id: string;
      fecha_hora_inicio: string;
      pelicula: { id: string; nombre: string; imagen_url: string | null } | null;
      sala: { nombre: string } | null;
    } | null;
  }[];
}

export interface FuncionCheckout extends Funcion {
  pelicula: { nombre: string; duracion_minutos: number; restriccion_edad: number | null; imagen_url: string | null } | null;
  sala: { nombre: string } | null;
}
