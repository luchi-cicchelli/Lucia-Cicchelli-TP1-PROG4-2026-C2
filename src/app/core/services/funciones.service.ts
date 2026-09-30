import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { FuncionConDetalle, FuncionCreada, NuevasFunciones } from '../models/funcion.model';

@Injectable({ providedIn: 'root' })
export class FuncionesService {
  constructor(private supabase: SupabaseService) {}

  async listarProximas(peliculaId?: string): Promise<FuncionConDetalle[]> {
    let consulta = this.supabase.client
      .from('funciones')
      .select('*, pelicula:peliculas(nombre, duracion_minutos), sala:salas(nombre)')
      .gte('fecha_hora_inicio', new Date().toISOString())
      .order('fecha_hora_inicio');

    if (peliculaId) consulta = consulta.eq('pelicula_id', peliculaId);

    const { data, error } = await consulta;
    if (error) throw error;
    return data as FuncionConDetalle[];
  }
  
  async crear(datos: NuevasFunciones): Promise<FuncionCreada[]> {
    const { data, error } = await this.supabase.client.rpc('crear_funciones', {
      p_pelicula_id: datos.peliculaId,
      p_inicios: datos.inicios.map((d) => d.toISOString()),
      p_formato: datos.formato,
      p_idioma: datos.idioma,
      p_precio_base: datos.precioBase,
      p_precio_vip: datos.precioVip,
      p_es_preventa: datos.esPreventa,
      p_fecha_fin_preventa: datos.fechaFinPreventa?.toISOString() ?? null,
      p_precio_preventa: datos.precioPreventa
    });
    if (error) throw new Error(error.message);
    return data as FuncionCreada[];
  }

  async eliminar(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('funciones').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') throw new Error('No se puede borrar: ya tiene entradas vendidas.');
      throw error;
    }
  }
}
