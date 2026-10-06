import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CandyEntregado, EntradaValidada } from '../models/escaner.model';

@Injectable({ providedIn: 'root' })
export class EscanerService {
  constructor(private supabase: SupabaseService) {}

  // Acepta el QR de la compra o su código manual y valida todas sus entradas juntas.
  // Las reglas (una sola vez, horario, permisos) están en validar_entrada (qr_unico.sql).
  async validar(codigo: string): Promise<EntradaValidada> {
    const { data, error } = await this.supabase.client.rpc('validar_entrada', { p_codigo: codigo });
    if (error) throw new Error(error.message);
    return data as EntradaValidada;
  }

  // Con el mismo QR de la compra se entrega el candy (una sola vez).
  async entregarCandy(codigo: string): Promise<CandyEntregado> {
    const { data, error } = await this.supabase.client.rpc('validar_candy', { p_codigo: codigo });
    if (error) throw new Error(error.message);
    return data as CandyEntregado;
  }
}
