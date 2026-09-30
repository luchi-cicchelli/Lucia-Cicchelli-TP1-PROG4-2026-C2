import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Butaca, SalaConTotal } from '../models/sala.model';

@Injectable({ providedIn: 'root' })
export class SalasService {
  constructor(private supabase: SupabaseService) {}

  async listar(): Promise<SalaConTotal[]> {
    const { data, error } = await this.supabase.client
      .from('salas')
      .select('id, nombre, butacas(count)')
      .order('id');
    if (error) throw error;

    return (data ?? []).map((s: any) => ({
      id: s.id,
      nombre: s.nombre,
      totalButacas: s.butacas?.[0]?.count ?? 0
    }));
  }

  async crear(nombre: string): Promise<void> {
    const { error } = await this.supabase.client.from('salas').insert({ nombre });
    if (error) throw error;
  }

  async renombrar(id: number, nombre: string): Promise<void> {
    const { error } = await this.supabase.client.from('salas').update({ nombre }).eq('id', id);
    if (error) throw error;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase.client.from('salas').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') throw new Error('La sala tiene funciones cargadas. Borralas primero.');
      throw error;
    }
  }

  async butacas(salaId: number): Promise<Butaca[]> {
    const { data, error } = await this.supabase.client
      .from('butacas')
      .select('*')
      .eq('sala_id', salaId)
      .order('numero');
    if (error) throw error;
    return data as Butaca[];
  }
}
