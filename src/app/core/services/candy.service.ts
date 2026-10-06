import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Combo, ComboFormValue, ProductoCandy, ProductoFormValue } from '../models/candy.model';

@Injectable({ providedIn: 'root' })
export class CandyService {
  constructor(private supabase: SupabaseService) {}

  async listarProductos(soloActivos = false): Promise<ProductoCandy[]> {
    let consulta = this.supabase.client
      .from('productos_candy')
      .select('*')
      .order('categoria')
      .order('precio');
    if (soloActivos) consulta = consulta.eq('activo', true);
    const { data, error } = await consulta;
    if (error) throw error;
    return (data ?? []).map((p: any) => ({ ...p, precio: Number(p.precio) }));
  }

  async guardarProducto(producto: ProductoFormValue, id?: string): Promise<void> {
    const datos = { ...producto, imagen_url: producto.imagen_url || null };
    const { error } = id
      ? await this.supabase.client.from('productos_candy').update(datos).eq('id', id)
      : await this.supabase.client.from('productos_candy').insert(datos);
    if (error) throw error;
  }

  async cambiarActivoProducto(id: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('productos_candy').update({ activo }).eq('id', id);
    if (error) throw error;
  }

  async listarCombos(soloActivos = false): Promise<Combo[]> {
    let consulta = this.supabase.client
      .from('combos')
      .select('*, items:combo_items(producto_id, cantidad, producto:productos_candy(nombre, imagen_url))')
      .order('precio_fijo');
    if (soloActivos) consulta = consulta.eq('activo', true);
    const { data, error } = await consulta;
    if (error) throw error;
    return (data ?? []).map((c: any) => ({ ...c, precio_fijo: Number(c.precio_fijo) }));
  }

  async guardarCombo(combo: ComboFormValue, id?: string): Promise<void> {
    const { items, ...datos } = combo;
    let comboId = id;

    if (id) {
      const { error } = await this.supabase.client.from('combos').update(datos).eq('id', id);
      if (error) throw error;
      const { error: borrar } = await this.supabase.client.from('combo_items').delete().eq('combo_id', id);
      if (borrar) throw borrar;
    } else {
      const { data, error } = await this.supabase.client.from('combos').insert(datos).select('id').single();
      if (error) throw error;
      comboId = data.id;
    }

    if (items.length) {
      const filas = items.map((i) => ({ combo_id: comboId, producto_id: i.producto_id, cantidad: i.cantidad }));
      const { error } = await this.supabase.client.from('combo_items').insert(filas);
      if (error) throw error;
    }
  }

  async cambiarActivoCombo(id: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('combos').update({ activo }).eq('id', id);
    if (error) throw error;
  }
}
