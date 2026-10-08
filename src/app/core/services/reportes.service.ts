import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LogActividad, Ranking, VentaDiaria } from '../models/reporte.model';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private supabase: SupabaseService) {}

  async ventas(desde: string, hasta: string): Promise<VentaDiaria[]> {
    const { data, error } = await this.supabase.client.rpc('reporte_ventas', { p_desde: desde, p_hasta: hasta });
    if (error) throw error;
    return (data ?? []).map((d: any) => ({ ...d, facturacion: Number(d.facturacion) }));
  }

  async peliculasMasVistas(desde: string, hasta: string): Promise<Ranking[]> {
    const { data, error } = await this.supabase.client.rpc('peliculas_mas_vistas', { p_desde: desde, p_hasta: hasta });
    if (error) throw error;
    return (data ?? []).map((d: any) => ({ nombre: d.pelicula, cantidad: d.entradas }));
  }

  async candyMasVendido(desde: string, hasta: string): Promise<Ranking[]> {
    const { data, error } = await this.supabase.client.rpc('candy_mas_vendido', { p_desde: desde, p_hasta: hasta });
    if (error) throw error;
    return (data ?? []).map((d: any) => ({ nombre: d.producto, cantidad: d.unidades }));
  }

  async logs(pagina: number, porPagina: number, acciones: string[] = []): Promise<LogActividad[]> {
    let consulta = this.supabase.client
      .from('logs_actividad')
      .select('*, usuario:perfiles(nombre, apellido, email)')
      .order('fecha_hora', { ascending: false })
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

    if (acciones.length) consulta = consulta.in('accion', acciones);

    const { data, error } = await consulta;
    if (error) throw error;
    return data as LogActividad[];
  }
}
