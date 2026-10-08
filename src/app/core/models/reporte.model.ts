export interface VentaDiaria {
  dia: string;
  compras: number;
  entradas: number;
  facturacion: number;
}

export interface Ranking {
  nombre: string;
  cantidad: number;
}

export interface LogActividad {
  id: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: string | null;
  fecha_hora: string;
  usuario: { nombre: string; apellido: string; email: string | null } | null;
}

export const ACCIONES: Record<string, string> = {
  creo_funciones: 'Creó funciones',
  borro_funcion: 'Borró una función',
  modifico_precio: 'Cambió un precio',
  valido_qr: 'Validó una entrada',
  entrego_candy: 'Entregó candy',
  cancelo_compra: 'Canceló una compra',
  cambio_rol: 'Cambió un rol',
  creo_pelicula: 'Creó una película',
  edito_pelicula: 'Editó una película',
  creo_cupon: 'Creó un cupón',
  modifico_cupon: 'Cambió un cupón'
};
