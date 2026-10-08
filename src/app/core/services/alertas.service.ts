import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface ResultadoEnvio {
  alertas: number;
  mails: number;
  sinEnviar: number;
}

// Aviso que se muestra dentro de la app cuando abre la venta de una película con alerta.
export interface AvisoEstreno {
  alerta_id: string;
  pelicula_id: string;
  pelicula: string;
  preventa: boolean;
}

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly supabase = inject(SupabaseService);
  private readonly http = inject(HttpClient);

  // Ids de las películas con alerta activa del usuario logueado.
  readonly mias = signal<ReadonlySet<string>>(new Set());
  private cargadasDe: string | null = null;

  // Avisos "abrió la venta" que todavía no se mostraron en la app.
  readonly avisos = signal<AvisoEstreno[]>([]);
  private avisosDe: string | null = null;

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
      .upsert(
        { usuario_id: usuarioId, pelicula_id: peliculaId, notificado: false, vista_en_app: false },
        { onConflict: 'usuario_id,pelicula_id' }
      );
    if (error) throw error;
    this.mias.update((s) => new Set(s).add(peliculaId));
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

  // Al entrar a la app: trae las alertas cuyas películas ya abrieron la venta (preventa o estreno)
  // y que todavía no se avisaron en la app. Una vez por usuario por cada vez que se abre la app.
  async buscarAvisos(usuarioId: string) {
    if (this.avisosDe === usuarioId) return;
    this.avisosDe = usuarioId;
    const { data, error } = await this.supabase.client.rpc('mis_avisos_estreno');
    if (error) throw error;
    this.avisos.set(data ?? []);
  }

  // Cuando el usuario cierra el aviso (o va a la película), se marca como visto para no volver a mostrarlo.
  async marcarVisto(aviso: AvisoEstreno) {
    this.avisos.update((lista) => lista.filter((a) => a.alerta_id !== aviso.alerta_id));
    const { error } = await this.supabase.client
      .from('alertas_estreno')
      .update({ vista_en_app: true })
      .eq('id', aviso.alerta_id);
    if (error) console.error('No se pudo marcar el aviso como visto', error);
  }

  limpiarAvisos() {
    this.avisos.set([]);
    this.avisosDe = null;
  }

  // Admin: llama a la Edge Function que manda los mails pendientes.
  // Los headers (apikey y token) los agrega el interceptor.
  enviarPendientes(): Promise<ResultadoEnvio> {
    return firstValueFrom(
      this.http.post<ResultadoEnvio>(`${environment.supabaseUrl}/functions/v1/avisar-estrenos`, {})
    );
  }
}
