import { Injectable } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { CompraDetalle, EstadoButaca, FuncionCheckout, MetodoPago, MiCompra, OpcionesCompra } from '../models/compra.model';

const CLAVE_SESION = 'bijou-sesion-compra';

@Injectable({ providedIn: 'root' })
export class ComprasService {
  readonly sesion: string;

  constructor(private supabase: SupabaseService) {
    let sesion: string | null = null;
    try {
      sesion = sessionStorage.getItem(CLAVE_SESION);
      if (!sesion) {
        sesion = crypto.randomUUID();
        sessionStorage.setItem(CLAVE_SESION, sesion);
      }
    } catch {
      sesion = crypto.randomUUID();
    }
    this.sesion = sesion;
  }

  async funcion(id: string): Promise<FuncionCheckout | null> {
    const { data, error } = await this.supabase.client
      .from('funciones')
      .select('*, pelicula:peliculas(nombre, duracion_minutos, restriccion_edad, imagen_url), sala:salas(nombre)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as FuncionCheckout | null;
  }

  async estadoButacas(funcionId: string): Promise<{ estados: Map<string, EstadoButaca>; expira: Date | null }> {
    const { data, error } = await this.supabase.client.rpc('estado_butacas', {
      p_funcion_id: funcionId,
      p_sesion: this.sesion
    });
    if (error) throw error;
    const filas = (data ?? []) as { butaca_id: string; estado: EstadoButaca; expira_en: string | null }[];
    const mia = filas.find((f) => f.expira_en);
    return {
      estados: new Map(filas.map((f) => [f.butaca_id, f.estado])),
      expira: mia?.expira_en ? new Date(mia.expira_en) : null
    };
  }

  async reservar(funcionId: string, butacaId: string): Promise<Date> {
    const { data, error } = await this.supabase.client.rpc('reservar_butaca', {
      p_funcion_id: funcionId,
      p_butaca_id: butacaId,
      p_sesion: this.sesion
    });
    if (error) throw new Error(error.message);
    return new Date(data);
  }

  async liberar(funcionId: string, butacaId: string | null = null): Promise<void> {
    const { error } = await this.supabase.client.rpc('liberar_butaca', {
      p_funcion_id: funcionId,
      p_butaca_id: butacaId,
      p_sesion: this.sesion
    });
    if (error) throw error;
  }

  async porcentajeBienvenida(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('porcentaje_bienvenida');
    if (error) return 0;
    return Number(data ?? 0);
  }

  async confirmar(funcionId: string, metodoPago: MetodoPago, opciones: OpcionesCompra): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('confirmar_compra', {
      p_funcion_id: funcionId,
      p_sesion: this.sesion,
      p_metodo_pago: metodoPago,
      p_items: opciones.items,
      p_cupon: opciones.cupon,
      p_usar_credito: opciones.usarCredito,
      p_canjes: opciones.canjes
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async misCompras(usuarioId: string): Promise<MiCompra[]> {
    const { data, error } = await this.supabase.client
      .from('compras')
      .select(
        'id, fecha, total, cancelada_en, candy_retirado, ' +
          'entradas(id, estado, funcion:funciones(id, fecha_hora_inicio, pelicula:peliculas(id, nombre, imagen_url), sala:salas(nombre)))'
      )
      .eq('usuario_id', usuarioId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data as unknown as MiCompra[];
  }

  /** Devuelve el crédito que se acreditó. La base valida las 2 horas y que sea del usuario. */
  async cancelar(compraId: string): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('cancelar_compra', { p_compra_id: compraId });
    if (error) throw new Error(error.message);
    return Number(data);
  }

  async detalle(compraId: string): Promise<CompraDetalle | null> {
    const { data, error } = await this.supabase.client.rpc('detalle_compra', { p_compra_id: compraId });
    if (error) throw error;
    return data as CompraDetalle | null;
  }

  escucharCambios(funcionId: string, alCambiar: () => void): RealtimeChannel {
    return this.supabase.client
      .channel(`funcion-${funcionId}`)
      .on('broadcast', { event: 'cambio' }, alCambiar)
      .subscribe();
  }

  avisarCambio(canal: RealtimeChannel): void {
    canal.send({ type: 'broadcast', event: 'cambio', payload: {} });
  }

  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabase.client.removeChannel(canal);
  }
}
