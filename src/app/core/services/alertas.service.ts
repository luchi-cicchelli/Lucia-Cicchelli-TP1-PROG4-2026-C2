import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface ResultadoEnvio {
  alertas: number;
  mails: number;
  notificaciones: number;
  sinEnviar: number;
}

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly supabase = inject(SupabaseService);
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);

  // Ids de las películas con alerta activa del usuario logueado.
  readonly mias = signal<ReadonlySet<string>>(new Set());
  private cargadasDe: string | null = null;

  async cargar(usuarioId: string) {
    if (this.cargadasDe === usuarioId) return;
    const { data, error } = await this.supabase.client
      .from('alertas_estreno')
      .select('pelicula_id')
      .eq('usuario_id', usuarioId)
      .eq('notificado', false);
    if (error) throw error;
    this.mias.set(new Set(data.map((a) => a.pelicula_id)));
    this.cargadasDe = usuarioId;
  }

  async activar(usuarioId: string, peliculaId: string) {
    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .upsert({ usuario_id: usuarioId, pelicula_id: peliculaId, notificado: false }, { onConflict: 'usuario_id,pelicula_id' });
    if (error) throw error;
    this.mias.update((s) => new Set(s).add(peliculaId));
    // El aviso principal es por mail; la notificación push es un extra si el navegador la permite.
    await this.suscribirAPush();
  }

  async desactivar(usuarioId: string, peliculaId: string) {
    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('pelicula_id', peliculaId);
    if (error) throw error;
    this.mias.update((s) => {
      const nuevo = new Set(s);
      nuevo.delete(peliculaId);
      return nuevo;
    });
  }

  // Pide permiso de notificaciones y guarda la suscripción del navegador.
  // Devuelve false si el navegador no lo permite (o en modo desarrollo, sin service worker).
  private async suscribirAPush(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;
    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey });
      const json = sub.toJSON();
      // Por RPC: si este navegador ya estaba suscripto con otra cuenta, la suscripción pasa a la cuenta actual.
      const { error } = await this.supabase.client.rpc('guardar_suscripcion', {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.['p256dh'],
        p_auth: json.keys?.['auth']
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('No se pudo activar la notificación push', e);
      return false;
    }
  }

  // Admin: llama a la Edge Function que manda los mails (y notificaciones) pendientes.
  // Los headers (apikey y token) los agrega el interceptor.
  enviarPendientes(): Promise<ResultadoEnvio> {
    return firstValueFrom(
      this.http.post<ResultadoEnvio>(`${environment.supabaseUrl}/functions/v1/avisar-estrenos`, {})
    );
  }
}
