import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Cupon, CuponFormValue, CuponValido } from '../models/beneficios.model';

@Injectable({ providedIn: 'root' })
export class CuponesService {
  constructor(private supabase: SupabaseService) {}

  async listar(): Promise<Cupon[]> {
    const { data, error } = await this.supabase.client
      .from('cupones')
      .select('*')
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((c: any) => ({ ...c, porcentaje_descuento: Number(c.porcentaje_descuento) }));
  }

  async guardar(cupon: CuponFormValue, id?: string): Promise<void> {
    const datos = { ...cupon, codigo: cupon.codigo.trim().toUpperCase() };
    const { error } = id
      ? await this.supabase.client.from('cupones').update(datos).eq('id', id)
      : await this.supabase.client.from('cupones').insert(datos);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un cupón con ese código.');
      throw error;
    }
  }

  async cambiarActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('cupones').update({ activo }).eq('id', id);
    if (error) throw error;
  }

  async validar(codigo: string): Promise<CuponValido> {
    const { data, error } = await this.supabase.client.rpc('validar_cupon', { p_codigo: codigo });
    if (error) throw new Error(error.message);
    return { ...(data as CuponValido), porcentaje: Number((data as CuponValido).porcentaje) };
  }
}
