import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { PeliculaCartelera, Resena } from '../models/cartelera.model';

@Injectable({ providedIn: 'root' })
export class CarteleraService {
  constructor(private supabase: SupabaseService) {}

  async listar(): Promise<PeliculaCartelera[]> {
    const [peliculas, resumen] = await Promise.all([
      this.supabase.client
        .from('peliculas')
        .select('*, pelicula_generos(generos(id, nombre))')
        .eq('activa', true)
        .order('fecha_estreno', { ascending: false }),
      this.supabase.client.rpc('resumen_peliculas')
    ]);
    if (peliculas.error) throw peliculas.error;
    if (resumen.error) console.error('No se pudo cargar el resumen de películas', resumen.error);

    const porId = new Map<string, any>((resumen.data ?? []).map((r: any) => [r.pelicula_id, r]));

    return (peliculas.data ?? []).map((p: any) => {
      const r = porId.get(p.id);
      return {
        ...p,
        generos: (p.pelicula_generos ?? []).map((pg: any) => pg.generos),
        entradasVendidas: Number(r?.entradas_vendidas ?? 0),
        promedio: r?.promedio != null ? Number(r.promedio) : null,
        cantidadResenas: Number(r?.cantidad_resenas ?? 0)
      };
    });
  }

  async obtener(id: string): Promise<PeliculaCartelera | null> {
    const lista = await this.listar();
    return lista.find((p) => p.id === id) ?? null;
  }

  async resenas(peliculaId: string): Promise<Resena[]> {
    const { data, error } = await this.supabase.client.rpc('resenas_de_pelicula', {
      p_pelicula_id: peliculaId
    });
    if (error) throw error;
    return data as Resena[];
  }
}
