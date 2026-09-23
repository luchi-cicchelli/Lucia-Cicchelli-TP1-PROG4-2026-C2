import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Perfil, Rol } from '../models/perfil.model';

export type UsuarioResumen = Pick<Perfil, 'id' | 'email' | 'nombre' | 'apellido' | 'rol' | 'created_at'>;

/** Gestión de usuarios para el panel de admin (RLS solo deja listar a un admin). */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  constructor(private supabase: SupabaseService) {}

  async listar(): Promise<UsuarioResumen[]> {
    const { data, error } = await this.supabase.client
      .from('perfiles')
      .select('id, email, nombre, apellido, rol, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as UsuarioResumen[];
  }

  /** Usa la función `asignar_rol` de Postgres, que valida que quien llama sea admin. */
  async cambiarRol(usuarioId: string, rol: Rol): Promise<void> {
    const { error } = await this.supabase.client.rpc('asignar_rol', {
      p_usuario_id: usuarioId,
      p_rol: rol
    });
    if (error) throw error;
  }
}
