import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AlertasService } from '../../../core/services/alertas.service';

// Botón "Avisarme cuando salgan las entradas" de las películas de Próximamente.
@Component({
  selector: 'app-boton-alerta',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './boton-alerta.component.html',
  styleUrl: './boton-alerta.component.css'
})
export class BotonAlertaComponent {
  readonly auth = inject(AuthService);
  private readonly alertas = inject(AlertasService);

  readonly peliculaId = input.required<string>();

  readonly activa = computed(() => this.alertas.mias().has(this.peliculaId()));
  readonly ocupado = signal(false);
  readonly aviso = signal('');

  constructor() {
    // Cuando se conoce el usuario, trae sus alertas (una sola vez, el servicio las guarda).
    effect(() => {
      const id = this.auth.perfil()?.id;
      if (id) this.alertas.cargar(id).catch(() => null);
    });
  }

  async alternar() {
    const usuarioId = this.auth.perfil()?.id;
    if (!usuarioId) return;
    this.ocupado.set(true);
    this.aviso.set('');
    try {
      if (this.activa()) {
        await this.alertas.desactivar(usuarioId, this.peliculaId());
      } else {
        const conPush = await this.alertas.activar(usuarioId, this.peliculaId());
        if (!conPush) {
          this.aviso.set('Alerta guardada. Para recibir la notificación, permití las notificaciones o instalá la app.');
        }
      }
    } catch (e: any) {
      this.aviso.set('No se pudo guardar la alerta: ' + e.message);
    } finally {
      this.ocupado.set(false);
    }
  }
}
