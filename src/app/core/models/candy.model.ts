export interface ProductoCandy {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  imagen_url: string | null;
  activo: boolean;
}

export interface ComboItem {
  producto_id: string;
  cantidad: number;
  producto?: { nombre: string } | null;
}

export interface Combo {
  id: string;
  nombre: string;
  precio_fijo: number;
  activo: boolean;
  items: ComboItem[];
}

export type ProductoFormValue = Omit<ProductoCandy, 'id'>;

export interface ComboFormValue {
  nombre: string;
  precio_fijo: number;
  activo: boolean;
  items: { producto_id: string; cantidad: number }[];
}

/** Lo que el cliente agrega a la compra. */
export interface ItemCarrito {
  tipo: 'producto' | 'combo';
  id: string;
  cantidad: number;
}

/** Candy de una compra, como lo devuelve la base. */
export interface ItemCandyCompra {
  tipo: 'producto' | 'combo';
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  detalle: string | null;
}

export function describirCombo(combo: Combo): string {
  const productos = combo.items
    .map((i) => `${i.cantidad > 1 ? i.cantidad + ' ' : ''}${i.producto?.nombre ?? ''}`)
    .join(' + ');
  return productos ? `Entrada + ${productos}` : 'Entrada';
}
