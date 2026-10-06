import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ComprasService } from '../../../core/services/compras.service';
import { MiCompra } from '../../../core/models/compra.model';

const DOS_HORAS = 2 * 60 * 60 * 1000;

@Component({
  selector: 'app-mis-compras',
  standalone: true,
  imports: [RouterLink, DatePipe, CurrencyPipe],
  templateUrl: './mis-compras.component.html',
  styleUrl: './mis-compras.component.css'
})
export class MisComprasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly compras = inject(ComprasService);

  readonly lista = signal<MiCompra[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly confirmarId = signal<string | null>(null);
  readonly cancelandoId = signal<string | null>(null);

  readonly grupos = computed(() => [
    { titulo: 'Próximas', compras: this.lista().filter((c) => !c.cancelada_en && !this.yaPaso(c)) },
    { titulo: 'Anteriores y canceladas', compras: this.lista().filter((c) => c.cancelada_en || this.yaPaso(c)) }
  ]);

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    const id = this.auth.perfil()?.id;
    if (!id) return;
    this.cargando.set(true);
    try {
      this.lista.set(await this.compras.misCompras(id));
    } catch (e: any) {
      this.error.set('No se pudieron cargar tus compras: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // Todas las entradas de una compra son de la misma función.
  funcion(c: MiCompra) {
    return c.entradas[0]?.funcion ?? null;
  }

  inicio(c: MiCompra): Date | null {
    const iso = this.funcion(c)?.fecha_hora_inicio;
    return iso ? new Date(iso) : null;
  }

  yaPaso(c: MiCompra): boolean {
    const inicio = this.inicio(c);
    return !!inicio && inicio < new Date();
  }

  /** Misma regla que cancelar_compra en la base: hasta 2 horas antes y sin nada usado. */
  puedeCancelar(c: MiCompra): boolean {
    const inicio = this.inicio(c);
    return (
      !c.cancelada_en &&
      !!inicio &&
      inicio.getTime() - Date.now() >= DOS_HORAS &&
      !c.candy_retirado &&
      c.entradas.every((e) => e.estado === 'activa')
    );
  }

  async cancelar(c: MiCompra) {
    if (this.confirmarId() !== c.id) {
      this.confirmarId.set(c.id);
      return;
    }
    this.confirmarId.set(null);
    this.cancelandoId.set(c.id);
    this.error.set('');
    this.mensaje.set('');
    try {
      const credito = await this.compras.cancelar(c.id);
      this.mensaje.set(`Compra cancelada. Se acreditaron $${credito.toLocaleString('es-AR')} para tu próxima compra.`);
      await this.auth.recargarPerfil();
      await this.cargar();
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cancelandoId.set(null);
    }
  }
}
