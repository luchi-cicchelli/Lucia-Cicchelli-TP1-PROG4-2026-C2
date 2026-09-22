import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Genero, PeliculaConGeneros, PeliculaFormValue } from '../models/pelicula.model';

@Injectable({ providedIn: 'root' })
export class PeliculasService {
  constructor(private supabase: SupabaseService) {}

  async listarGeneros(): Promise<Genero[]> {
    const { data, error } = await this.supabase.client
      .from('generos')
      .select('*')
      .order('nombre');
    if (error) throw error;
    return data as Genero[];
  }

  // Trae todas las películas (activas e inactivas) con sus géneros, para el panel de admin.
  async listarPeliculas(): Promise<PeliculaConGeneros[]> {
    const { data, error } = await this.supabase.client
      .from('peliculas')
      .select('*, pelicula_generos(generos(id, nombre))')
      .order('fecha_estreno', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((p: any) => ({
      ...p,
      generos: (p.pelicula_generos ?? []).map((pg: any) => pg.generos)
    }));
  }

  async crearPelicula(form: PeliculaFormValue): Promise<string> {
    const { generoIds, ...pelicula } = form;

    const { data, error } = await this.supabase.client
      .from('peliculas')
      .insert(pelicula)
      .select('id')
      .single();

    if (error) throw error;

    await this.sincronizarGeneros(data.id, generoIds);
    return data.id;
  }

  async actualizarPelicula(id: string, form: PeliculaFormValue): Promise<void> {
    const { generoIds, ...pelicula } = form;

    const { error } = await this.supabase.client
      .from('peliculas')
      .update(pelicula)
      .eq('id', id);

    if (error) throw error;

    await this.sincronizarGeneros(id, generoIds);
  }

  // Soft delete: nunca borramos una película de verdad (puede tener funciones/entradas
  // asociadas), solo la desactivamos para que deje de aparecer en el catálogo público.
  async cambiarActiva(id: string, activa: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('peliculas')
      .update({ activa })
      .eq('id', id);
    if (error) throw error;
  }

  private async sincronizarGeneros(peliculaId: string, generoIds: number[]): Promise<void> {
    const { error: deleteError } = await this.supabase.client
      .from('pelicula_generos')
      .delete()
      .eq('pelicula_id', peliculaId);
    if (deleteError) throw deleteError;

    if (generoIds.length === 0) return;

    const filas = generoIds.map((generoId) => ({ pelicula_id: peliculaId, genero_id: generoId }));
    const { error: insertError } = await this.supabase.client
      .from('pelicula_generos')
      .insert(filas);
    if (insertError) throw insertError;
  }
}
