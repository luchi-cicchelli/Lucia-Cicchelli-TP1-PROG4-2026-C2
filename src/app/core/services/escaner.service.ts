import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CandyEntregado, EntradaValidada } from '../models/escaner.model';

@Injectable({ providedIn: 'root' })
export class EscanerService {
  constructor(private supabase: SupabaseService) {}

  // Acepta el contenido del QR o el código manual. La validación (una sola vez,
  // horario de ingreso, permisos) la hace validar_entrada en escaner.sql.
  async validar(codigo: string): Promise<EntradaValidada> {
    const { data, error } = await this.supabase.client.rpc('validar_entrada', { p_codigo: codigo });
    if (error) throw new Error(error.message);
    return data as EntradaValidada;
  }

  // Entrega el candy de la compra a la que pertenece la entrada (una sola vez).
  async entregarCandy(codigo: string): Promise<CandyEntregado> {
    const { data, error } = await this.supabase.client.rpc('validar_candy', { p_codigo: codigo });
    if (error) throw new Error(error.message);
    return data as CandyEntregado;
  }
}
