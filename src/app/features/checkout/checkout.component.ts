import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { ComprasService } from '../../core/services/compras.service';
import { SalasService } from '../../core/services/salas.service';
import { CandyService } from '../../core/services/candy.service';
import { Combo, ItemCarrito, ProductoCandy, describirCombo } from '../../core/models/candy.model';
import { EstadoButaca, FuncionCheckout, METODOS_PAGO, MetodoPago } from '../../core/models/compra.model';
import { Butaca } from '../../core/models/sala.model';
import { MapaButacasComponent } from '../../shared/components/mapa-butacas/mapa-butacas.component';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [RouterLink, DatePipe, CurrencyPipe, MapaButacasComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private readonly compras = inject(ComprasService);
  private readonly salas = inject(SalasService);
  private readonly candy = inject(CandyService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly funcionId = input.required<string>();

  readonly metodosPago = METODOS_PAGO;
  readonly describirCombo = describirCombo;

  readonly funcion = signal<FuncionCheckout | null>(null);
  readonly butacas = signal<Butaca[]>([]);
  readonly estados = signal<Map<string, EstadoButaca>>(new Map());
  readonly expira = signal<Date | null>(null);
  readonly ahora = signal(Date.now());
  readonly porcentajeBienvenida = signal(0);
  readonly metodoPago = signal<MetodoPago>('tarjeta_credito');
  readonly productos = signal<ProductoCandy[]>([]);
  readonly combos = signal<Combo[]>([]);
  readonly cantidades = signal<Map<string, number>>(new Map());

  readonly cargando = signal(true);
  readonly procesando = signal<string | null>(null);
  readonly pagando = signal(false);
  readonly error = signal('');
  readonly aviso = signal('');

  private canal: RealtimeChannel | null = null;
  private intervalos: ReturnType<typeof setInterval>[] = [];
  private compraConfirmada = false;

  readonly ocupadas = computed(() => {
    const set = new Set<string>();
    for (const [id, estado] of this.estados()) if (estado !== 'mia') set.add(id);
    return set;
  });

  readonly seleccionadas = computed(() => {
    const set = new Set<string>();
    for (const [id, estado] of this.estados()) if (estado === 'mia') set.add(id);
    return set;
  });

  readonly misButacas = computed(() =>
    this.butacas()
      .filter((b) => this.seleccionadas().has(b.id))
      .map((b) => ({ butaca: b, precio: this.precio(b) }))
  );

  readonly hayVip = computed(() => this.misButacas().some((m) => m.butaca.tipo === 'vip'));
  readonly subtotalEntradas = computed(() => this.misButacas().reduce((suma, m) => suma + m.precio, 0));

  // Precio de una entrada general (lo que cubre cada combo).
  readonly precioGeneral = computed(() => {
    const f = this.funcion();
    if (!f) return 0;
    return this.enPreventa() ? Number(f.precio_preventa) : Number(f.precio_base);
  });

  readonly productosPorCategoria = computed(() => {
    const grupos = new Map<string, ProductoCandy[]>();
    for (const p of this.productos()) {
      if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
      grupos.get(p.categoria)!.push(p);
    }
    return [...grupos.entries()].map(([categoria, productos]) => ({ categoria, productos }));
  });

  readonly carrito = computed(() => {
    const lista: { item: ItemCarrito; nombre: string; precioUnitario: number }[] = [];
    for (const [clave, cantidad] of this.cantidades()) {
      if (cantidad <= 0) continue;
      const [tipo, id] = clave.split(':') as ['producto' | 'combo', string];
      if (tipo === 'combo') {
        const c = this.combos().find((x) => x.id === id);
        if (c) lista.push({ item: { tipo, id, cantidad }, nombre: c.nombre, precioUnitario: c.precio_fijo });
      } else {
        const p = this.productos().find((x) => x.id === id);
        if (p) lista.push({ item: { tipo, id, cantidad }, nombre: p.nombre, precioUnitario: p.precio });
      }
    }
    return lista.sort((a, b) => (a.item.tipo === b.item.tipo ? 0 : a.item.tipo === 'combo' ? -1 : 1));
  });

  readonly totalCombos = computed(() =>
    this.carrito().filter((c) => c.item.tipo === 'combo').reduce((suma, c) => suma + c.item.cantidad, 0)
  );

  // Cada combo incluye una entrada general: se descuenta del precio de las entradas.
  readonly entradasEnCombos = computed(() => this.totalCombos() * this.precioGeneral());

  readonly subtotalCandy = computed(() =>
    this.carrito().reduce((suma, c) => suma + c.precioUnitario * c.item.cantidad, 0)
  );

  readonly subtotal = computed(
    () => this.subtotalEntradas() + this.subtotalCandy() - this.entradasEnCombos()
  );

  readonly aplicaBienvenida = computed(() => {
    const perfil = this.auth.perfil();
    return !!perfil && !perfil.cupon_bienvenida_usado && this.porcentajeBienvenida() > 0;
  });

  readonly descuento = computed(() =>
    this.aplicaBienvenida() ? Math.round(this.subtotal() * this.porcentajeBienvenida()) / 100 : 0
  );
  readonly total = computed(() => this.subtotal() - this.descuento());
  readonly puntos = computed(() => (this.auth.estaLogueado() ? Math.floor(this.total()) : 0));

  readonly segundosRestantes = computed(() => {
    const expira = this.expira();
    if (!expira) return null;
    return Math.max(0, Math.floor((expira.getTime() - this.ahora()) / 1000));
  });

  readonly tiempoRestante = computed(() => {
    const s = this.segundosRestantes();
    if (s === null) return '';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  readonly enPreventa = computed(() => {
    const f = this.funcion();
    return !!f?.es_preventa && !!f.fecha_fin_preventa && new Date(f.fecha_fin_preventa) > new Date();
  });

  readonly bloqueadaPorEdad = computed(() => {
    const restriccion = this.funcion()?.pelicula?.restriccion_edad;
    const edad = this.auth.edad();
    return !!restriccion && edad !== null && edad < restriccion;
  });

  async ngOnInit() {
    try {
      const funcion = await this.compras.funcion(this.funcionId());
      if (!funcion) {
        this.error.set('Esta función no existe.');
        return;
      }
      if (new Date(funcion.fecha_hora_inicio) <= new Date()) {
        this.error.set('Esta función ya empezó.');
        return;
      }
      this.funcion.set(funcion);

      const [butacas, porcentaje, productos, combos] = await Promise.all([
        this.salas.butacas(funcion.sala_id),
        this.compras.porcentajeBienvenida(),
        this.candy.listarProductos(true).catch(() => []),
        this.candy.listarCombos(true).catch(() => []),
        this.refrescar()
      ]);
      this.butacas.set(butacas);
      this.porcentajeBienvenida.set(porcentaje);
      this.productos.set(productos);
      this.combos.set(combos);

      this.canal = this.compras.escucharCambios(funcion.id, () => this.refrescar());
      this.intervalos.push(setInterval(() => this.refrescar(), 15000));
      this.intervalos.push(setInterval(() => this.controlarVencimiento(), 1000));
    } catch (e: any) {
      this.error.set('No se pudo cargar la función: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
    this.intervalos.forEach(clearInterval);
    if (this.canal) {
      if (!this.compraConfirmada && this.seleccionadas().size) {
        this.compras.liberar(this.funcionId()).then(() => this.compras.avisarCambio(this.canal!));
      }
      setTimeout(() => this.compras.dejarDeEscuchar(this.canal!), 500);
    }
  }

  precio(b: Butaca): number {
    const f = this.funcion();
    if (!f) return 0;
    if (b.tipo === 'vip') return Number(f.precio_vip);
    if (this.enPreventa()) return Number(f.precio_preventa);
    return Number(f.precio_base);
  }

  etiquetaButaca(b: Butaca): string {
    return b.fila === 'ACC' ? `Accesible, butaca ${b.numero}` : `Fila ${b.fila}, butaca ${b.numero}`;
  }

  async elegir(b: Butaca) {
    if (this.procesando() || this.bloqueadaPorEdad()) return;
    const id = this.funcionId();
    const esMia = this.seleccionadas().has(b.id);

    this.procesando.set(b.id);
    this.error.set('');
    this.aviso.set('');
    try {
      if (esMia) {
        this.cambiarEstado(b.id, null);
        await this.compras.liberar(id, b.id);
        if (this.seleccionadas().size === 0) this.expira.set(null);
        this.ajustarCombos();
      } else {
        this.cambiarEstado(b.id, 'mia');
        this.expira.set(await this.compras.reservar(id, b.id));
      }
      if (this.canal) this.compras.avisarCambio(this.canal);
    } catch (e: any) {
      this.error.set(e.message);
      await this.refrescar();
    } finally {
      this.procesando.set(null);
    }
  }

  async pagar() {
    if (!this.misButacas().length || this.pagando()) return;
    this.pagando.set(true);
    this.error.set('');
    try {
      const items = this.carrito().map((c) => c.item);
      const compraId = await this.compras.confirmar(this.funcionId(), this.metodoPago(), items);
      this.compraConfirmada = true;
      await this.auth.recargarPerfil();
      if (this.canal) this.compras.avisarCambio(this.canal);
      await this.router.navigate(['/compra', compraId]);
    } catch (e: any) {
      this.error.set(e.message);
      await this.refrescar();
    } finally {
      this.pagando.set(false);
    }
  }

  cantidad(tipo: 'producto' | 'combo', id: string): number {
    return this.cantidades().get(`${tipo}:${id}`) ?? 0;
  }

  cambiarCantidad(tipo: 'producto' | 'combo', id: string, delta: number) {
    const actual = this.cantidad(tipo, id);
    const nueva = Math.max(0, Math.min(20, actual + delta));
    if (tipo === 'combo' && delta > 0 && this.totalCombos() >= this.misButacas().length) {
      this.aviso.set('Cada combo incluye una entrada: elegí otra butaca para sumar otro combo.');
      return;
    }
    this.aviso.set('');
    this.cantidades.update((mapa) => {
      const nuevo = new Map(mapa);
      if (nueva === 0) nuevo.delete(`${tipo}:${id}`);
      else nuevo.set(`${tipo}:${id}`, nueva);
      return nuevo;
    });
  }

  // Si se liberan butacas, no puede haber más combos que entradas.
  private ajustarCombos() {
    let sobrantes = this.totalCombos() - this.misButacas().length;
    if (sobrantes <= 0) return;
    this.cantidades.update((mapa) => {
      const nuevo = new Map(mapa);
      for (const [clave, cant] of [...nuevo.entries()].reverse()) {
        if (!clave.startsWith('combo:') || sobrantes <= 0) continue;
        const quitar = Math.min(cant, sobrantes);
        sobrantes -= quitar;
        if (cant - quitar === 0) nuevo.delete(clave);
        else nuevo.set(clave, cant - quitar);
      }
      return nuevo;
    });
  }

  private async refrescar() {
    try {
      const { estados, expira } = await this.compras.estadoButacas(this.funcionId());
      this.estados.set(estados);
      this.expira.set(expira);
      this.ajustarCombos();
    } catch (e: any) {
      this.error.set('No se pudo actualizar el mapa: ' + e.message);
    }
  }

  private controlarVencimiento() {
    this.ahora.set(Date.now());
    if (this.segundosRestantes() === 0 && this.seleccionadas().size) {
      this.expira.set(null);
      this.aviso.set('Pasaron 10 minutos y se liberaron tus butacas. Podés volver a elegirlas.');
      this.refrescar();
    }
  }

  private cambiarEstado(butacaId: string, estado: EstadoButaca | null) {
    this.estados.update((actual) => {
      const nuevo = new Map(actual);
      if (estado) nuevo.set(butacaId, estado);
      else nuevo.delete(butacaId);
      return nuevo;
    });
  }
}
