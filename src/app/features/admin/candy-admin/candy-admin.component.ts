import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CandyService } from '../../../core/services/candy.service';
import { Combo, ProductoCandy, describirCombo } from '../../../core/models/candy.model';
import { SubirImagenComponent } from '../../../shared/components/subir-imagen/subir-imagen.component';

type Pestania = 'productos' | 'combos';

@Component({
  selector: 'app-candy-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, SubirImagenComponent],
  templateUrl: './candy-admin.component.html',
  styleUrl: './candy-admin.component.css'
})
export class CandyAdminComponent implements OnInit {
  private readonly candy = inject(CandyService);
  private readonly fb = inject(FormBuilder);

  readonly pestania = signal<Pestania>('productos');
  readonly productos = signal<ProductoCandy[]>([]);
  readonly combos = signal<Combo[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  readonly editandoProductoId = signal<string | null>(null);
  readonly formProductoAbierto = signal(false);
  readonly editandoComboId = signal<string | null>(null);
  readonly formComboAbierto = signal(false);

  readonly describirCombo = describirCombo;

  readonly categorias = computed(() => [...new Set(this.productos().map((p) => p.categoria))].sort());

  readonly productosPorCategoria = computed(() =>
    this.categorias().map((categoria) => ({
      categoria,
      productos: this.productos().filter((p) => p.categoria === categoria)
    }))
  );

  readonly formProducto = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]],
    categoria: ['', [Validators.required, Validators.maxLength(40)]],
    precio: [null as number | null, [Validators.required, Validators.min(1)]],
    imagen_url: [''],
    activo: [true]
  });

  readonly formCombo = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(60)]],
    precio_fijo: [null as number | null, [Validators.required, Validators.min(1)]],
    activo: [true],
    items: this.fb.array<ReturnType<CandyAdminComponent['nuevoItem']>>([], Validators.required)
  });

  get itemsCombo(): FormArray {
    return this.formCombo.controls.items;
  }

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [productos, combos] = await Promise.all([this.candy.listarProductos(), this.candy.listarCombos()]);
      this.productos.set(productos);
      this.combos.set(combos);
    } catch (e: any) {
      this.error.set('No se pudo cargar el candy: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ---------- Productos ----------
  nuevoProducto() {
    this.editandoProductoId.set(null);
    this.formProducto.reset({ nombre: '', categoria: '', precio: null, imagen_url: '', activo: true });
    this.formProductoAbierto.set(true);
  }

  editarProducto(p: ProductoCandy) {
    this.editandoProductoId.set(p.id);
    this.formProducto.reset({
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      imagen_url: p.imagen_url ?? '',
      activo: p.activo
    });
    this.formProductoAbierto.set(true);
  }

  async guardarProducto() {
    if (this.formProducto.invalid) {
      this.formProducto.markAllAsTouched();
      return;
    }
    const v = this.formProducto.getRawValue();
    await this.ejecutar(async () => {
      await this.candy.guardarProducto(
        { ...v, nombre: v.nombre.trim(), categoria: v.categoria.trim(), precio: Number(v.precio) },
        this.editandoProductoId() ?? undefined
      );
      this.formProductoAbierto.set(false);
    });
  }

  async toggleProducto(p: ProductoCandy) {
    await this.ejecutar(() => this.candy.cambiarActivoProducto(p.id, !p.activo));
  }

  // ---------- Combos ----------
  nuevoItem(productoId = '', cantidad = 1) {
    return this.fb.nonNullable.group({
      producto_id: [productoId, Validators.required],
      cantidad: [cantidad, [Validators.required, Validators.min(1), Validators.max(10)]]
    });
  }

  nuevoCombo() {
    this.editandoComboId.set(null);
    this.formCombo.reset({ nombre: '', precio_fijo: null, activo: true });
    this.itemsCombo.clear();
    this.itemsCombo.push(this.nuevoItem());
    this.formComboAbierto.set(true);
  }

  editarCombo(c: Combo) {
    this.editandoComboId.set(c.id);
    this.formCombo.reset({ nombre: c.nombre, precio_fijo: c.precio_fijo, activo: c.activo });
    this.itemsCombo.clear();
    c.items.forEach((i) => this.itemsCombo.push(this.nuevoItem(i.producto_id, i.cantidad)));
    this.formComboAbierto.set(true);
  }

  agregarItem() {
    this.itemsCombo.push(this.nuevoItem());
  }

  quitarItem(i: number) {
    this.itemsCombo.removeAt(i);
  }

  async guardarCombo() {
    if (this.formCombo.invalid) {
      this.formCombo.markAllAsTouched();
      return;
    }
    const v = this.formCombo.getRawValue();
    await this.ejecutar(async () => {
      await this.candy.guardarCombo(
        {
          nombre: v.nombre.trim(),
          precio_fijo: Number(v.precio_fijo),
          activo: v.activo,
          items: v.items.map((i: any) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) }))
        },
        this.editandoComboId() ?? undefined
      );
      this.formComboAbierto.set(false);
    });
  }

  async toggleCombo(c: Combo) {
    await this.ejecutar(() => this.candy.cambiarActivoCombo(c.id, !c.activo));
  }

  /** Lo que costarían los productos del combo por separado (sin la entrada). */
  precioSuelto(c: Combo): number {
    return c.items.reduce((suma, i) => {
      const p = this.productos().find((x) => x.id === i.producto_id);
      return suma + (p ? p.precio * i.cantidad : 0);
    }, 0);
  }

  private async ejecutar(accion: () => Promise<void>) {
    this.error.set('');
    try {
      await accion();
      await this.cargar();
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
}
