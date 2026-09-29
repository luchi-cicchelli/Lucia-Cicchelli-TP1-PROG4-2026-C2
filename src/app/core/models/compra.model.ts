import { Formato, Funcion, Idioma } from './funcion.model';
import { TipoButaca } from './sala.model';

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
}

export interface FuncionCheckout extends Funcion {
  pelicula: { nombre: string; duracion_minutos: number; restriccion_edad: number | null; imagen_url: string | null } | null;
  sala: { nombre: string } | null;
}
