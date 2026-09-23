import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { DatosPersonales, Perfil, RegistroDatos, Rol, calcularEdad } from '../models/perfil.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<Session | null>(null);
  private readonly _perfil = signal<Perfil | null>(null);

  readonly session = this._session.asReadonly();
  readonly perfil = this._perfil.asReadonly();

  readonly estaLogueado = computed(() => this._session() !== null);
  readonly rol = computed<Rol | null>(() => this._perfil()?.rol ?? null);
  readonly esAdmin = computed(() => this.rol() === 'admin');
  readonly esEmpleado = computed(() => this.rol() === 'empleado' || this.rol() === 'admin');
  readonly edad = computed(() => {
    const p = this._perfil();
    return p ? calcularEdad(p.fecha_nacimiento) : null;
  });

  /**
   * Se resuelve cuando Supabase ya recuperó la sesión guardada (y el perfil).
   * Los guards esperan esto para no redirigir antes de tiempo al recargar la página.
   */
  readonly listo: Promise<void>;

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.listo = new Promise((resolve) => {
      this.supabase.client.auth.onAuthStateChange((evento, session) => {
        this._session.set(session);

        // Supabase recomienda no hacer otras consultas dentro de este callback
        // (puede trabar el lock de la sesión), por eso se difiere con setTimeout.
        setTimeout(async () => {
          if (!session) {
            this._perfil.set(null);
          } else if (this._perfil()?.id !== session.user.id || evento === 'USER_UPDATED') {
            await this.cargarPerfil(session.user.id);
          }
          if (evento === 'INITIAL_SESSION') resolve();
        });
      });
    });
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(this.traducirError(error));
    await this.cargarPerfil(data.user.id);
  }

  /** Devuelve true si Supabase pide confirmar el mail antes de poder ingresar. */
  async registrar(datos: RegistroDatos): Promise<{ requiereConfirmacion: boolean }> {
    const { email, password, ...perfil } = datos;

    // Los datos del perfil viajan como metadata; el trigger `crear_perfil_nuevo_usuario`
    // (supabase/auth.sql) los copia a la tabla perfiles. El rol NO se manda: siempre es 'cliente'.
    const { data, error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: perfil }
    });
    if (error) throw new Error(this.traducirError(error));

    // Si el mail ya existía y la confirmación está activa, Supabase no devuelve error
    // pero el usuario viene sin identidades.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error('Ya existe una cuenta con ese mail.');
    }

    if (data.session && data.user) {
      await this.cargarPerfil(data.user.id);
      return { requiereConfirmacion: false };
    }
    return { requiereConfirmacion: true };
  }

  async cerrarSesion(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this._perfil.set(null);
    await this.router.navigate(['/']);
  }

  async actualizarDatos(cambios: DatosPersonales): Promise<void> {
    const id = this._session()?.user.id;
    if (!id) throw new Error('No hay sesión iniciada.');

    const { data, error } = await this.supabase.client
      .from('perfiles')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    this._perfil.set(data as Perfil);
  }

  /** A dónde mandar al usuario después de loguearse, según su rol. */
  rutaInicio(): string {
    switch (this.rol()) {
      case 'admin':
        return '/admin';
      case 'empleado':
        return '/empleado/escaner';
      default:
        return '/';
    }
  }

  private async cargarPerfil(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('No se pudo cargar el perfil', error);
      this._perfil.set(null);
      return;
    }
    this._perfil.set(data as Perfil | null);
  }

  private traducirError(error: AuthError): string {
    const mensaje = error.message.toLowerCase();
    if (mensaje.includes('invalid login credentials')) return 'Mail o contraseña incorrectos.';
    if (mensaje.includes('email not confirmed')) return 'Tenés que confirmar tu mail antes de ingresar.';
    if (mensaje.includes('already registered')) return 'Ya existe una cuenta con ese mail.';
    if (mensaje.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (mensaje.includes('rate limit')) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
    if (mensaje.includes('invalid') && mensaje.includes('email')) return 'El mail no es válido.';
    return error.message;
  }
}
