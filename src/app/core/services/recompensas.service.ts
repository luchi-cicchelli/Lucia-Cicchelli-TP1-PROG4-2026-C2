import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MovimientoPuntos, Recompensa, RecompensaFormValue } from '../models/beneficios.model';

@Injectable({ providedIn: 'root' })
export class RecompensasService {
  constructor(private supabase: SupabaseService) {}

  async listar(soloActivas = false): Promise<Recompensa[]> {
    let consulta = this.supabase.client.from('recompensas').select('*').order('puntos_requeridos');
    if (soloActivas) consulta = consulta.eq('activo', true);
    const { data, error } = await consulta;
    if (error) throw error;
    return data as Recompensa[];
  }

  async guardar(recompensa: RecompensaFormValue, id?: string): Promise<void> {
    const datos = {
      ...recompensa,
      producto_id: recompensa.tipo === 'producto_candy' ? recompensa.producto_id : null
    };
    const { error } = id
      ? await this.supabase.client.from('recompensas').update(datos).eq('id', id)
      : await this.supabase.client.from('recompensas').insert(datos);
    if (error) throw error;
  }

  async cambiarActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('recompensas').update({ activo }).eq('id', id);
    if (error) throw error;
  }

  async historial(usuarioId: string): Promise<MovimientoPuntos[]> {
    const { data, error } = await this.supabase.client
      .from('puntos_historial')
      .select('id, tipo, cantidad, fecha, recompensa:recompensas(nombre)')
      .eq('usuario_id', usuarioId)
      .order('fecha', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as unknown as MovimientoPuntos[];
  }
}
