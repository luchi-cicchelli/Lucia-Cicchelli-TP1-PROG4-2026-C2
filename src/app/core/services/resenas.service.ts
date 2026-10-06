import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface MiResena {
  pelicula_id: string;
  estrellas: number;
  comentario: string | null;
}

@Injectable({ providedIn: 'root' })
export class ResenasService {
  constructor(private supabase: SupabaseService) {}

  async mias(usuarioId: string): Promise<MiResena[]> {
    const { data, error } = await this.supabase.client
      .from('resenas')
      .select('pelicula_id, estrellas, comentario')
      .eq('usuario_id', usuarioId);
    if (error) throw error;
    return data as MiResena[];
  }

  async mia(usuarioId: string, peliculaId: string): Promise<MiResena | null> {
    const { data, error } = await this.supabase.client
      .from('resenas')
      .select('pelicula_id, estrellas, comentario')
      .eq('usuario_id', usuarioId)
      .eq('pelicula_id', peliculaId)
      .maybeSingle();
    if (error) throw error;
    return data as MiResena | null;
  }

  // Solo puede reseñar quien vio la película (misma regla que la policy de RLS).
  async vioPelicula(peliculaId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('vio_pelicula', { p_pelicula_id: peliculaId });
    if (error) throw error;
    return data as boolean;
  }

  // upsert: si ya existe una reseña de este usuario para esta película, la edita.
  // RLS solo deja escribir reseñas propias (usuario_id = auth.uid()).
  async guardar(usuarioId: string, peliculaId: string, estrellas: number, comentario: string): Promise<void> {
    const { error } = await this.supabase.client.from('resenas').upsert(
      {
        usuario_id: usuarioId,
        pelicula_id: peliculaId,
        estrellas,
        comentario: comentario.trim() || null,
        fecha: new Date().toISOString()
      },
      { onConflict: 'pelicula_id,usuario_id' }
    );
    if (error) throw error;
  }

  async borrar(usuarioId: string, peliculaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('resenas')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('pelicula_id', peliculaId);
    if (error) throw error;
  }
}
