import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReportesService } from '../../../core/services/reportes.service';
import { Ranking, VentaDiaria } from '../../../core/models/reporte.model';
import { exportarExcel, exportarPdf } from './exportar';

const MAX_DIAS = 92;

function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

const rangoValido: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const desde = g.get('desde')?.value;
  const hasta = g.get('hasta')?.value;
  if (!desde || !hasta) return null;
  if (hasta < desde) return { rangoInvertido: true };
  const dias = (fechaLocal(hasta).getTime() - fechaLocal(desde).getTime()) / 86_400_000;
  return dias > MAX_DIAS ? { rangoLargo: true } : null;
};

type Periodo = 'semana' | 'mes';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.css'
})
export class ReportesComponent implements OnInit {
  private readonly reportes = inject(ReportesService);

  readonly hoy = aIso(new Date());

  // ---------- Facturación por día ----------
  readonly form = inject(FormBuilder).nonNullable.group(
    {
      desde: [aIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), Validators.required],
      hasta: [this.hoy, Validators.required]
    },
    { validators: rangoValido }
  );

  readonly ventas = signal<VentaDiaria[]>([]);
  readonly rangoMostrado = signal({ desde: '', hasta: '' });
  readonly cargando = signal(false);
  readonly exportando = signal(false);
  readonly error = signal('');

  readonly totales = computed(() => {
    const v = this.ventas();
    const facturacion = v.reduce((s, d) => s + d.facturacion, 0);
    const compras = v.reduce((s, d) => s + d.compras, 0);
    return {
      facturacion,
      compras,
      entradas: v.reduce((s, d) => s + d.entradas, 0),
      promedio: compras ? facturacion / compras : 0
    };
  });

  // Altura de cada barra en % respecto del día que más facturó.
  readonly maxFacturacion = computed(() => Math.max(1, ...this.ventas().map((d) => d.facturacion)));

  // ---------- Rankings (semana / mes) ----------
  readonly periodo = signal<Periodo>('semana');
  readonly desplazamiento = signal(0); // 0 = actual, -1 = anterior…
  readonly peliculas = signal<Ranking[]>([]);
  readonly candy = signal<Ranking[]>([]);
  readonly cargandoRanking = signal(false);

  readonly rangoRanking = computed(() => {
    const hoy = new Date();
    if (this.periodo() === 'semana') {
      const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
      lunes.setDate(lunes.getDate() + this.desplazamiento() * 7);
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      return { desde: lunes, hasta: domingo };
    }
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() + this.desplazamiento(), 1);
    const ultimo = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
    return { desde: primero, hasta: ultimo };
  });

  readonly maxPeliculas = computed(() => Math.max(1, ...this.peliculas().map((r) => r.cantidad)));
  readonly maxCandy = computed(() => Math.max(1, ...this.candy().map((r) => r.cantidad)));

  async ngOnInit() {
    await Promise.all([this.cargarVentas(), this.cargarRanking()]);
  }

  async cargarVentas() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { desde, hasta } = this.form.getRawValue();
    this.cargando.set(true);
    this.error.set('');
    try {
      this.ventas.set(await this.reportes.ventas(desde, hasta));
      this.rangoMostrado.set({ desde, hasta });
    } catch (e: any) {
      this.error.set('No se pudo cargar el reporte: ' + e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  atajo(tipo: '7dias' | 'mes' | 'mesPasado') {
    const hoy = new Date();
    let desde: Date;
    let hasta = hoy;
    if (tipo === '7dias') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6);
    } else if (tipo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    } else {
      desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    }
    this.form.setValue({ desde: aIso(desde), hasta: aIso(hasta) });
    this.cargarVentas();
  }

  async cambiarPeriodo(p: Periodo) {
    this.periodo.set(p);
    this.desplazamiento.set(0);
    await this.cargarRanking();
  }

  async mover(paso: number) {
    this.desplazamiento.update((d) => Math.min(0, d + paso));
    await this.cargarRanking();
  }

  async cargarRanking() {
    const { desde, hasta } = this.rangoRanking();
    this.cargandoRanking.set(true);
    try {
      const [peliculas, candy] = await Promise.all([
        this.reportes.peliculasMasVistas(aIso(desde), aIso(hasta)),
        this.reportes.candyMasVendido(aIso(desde), aIso(hasta))
      ]);
      this.peliculas.set(peliculas);
      this.candy.set(candy);
    } catch (e: any) {
      this.error.set('No se pudieron cargar los gráficos: ' + e.message);
    } finally {
      this.cargandoRanking.set(false);
    }
  }

  fecha(iso: string): Date {
    return fechaLocal(iso);
  }

  async exportar(formato: 'pdf' | 'excel') {
    this.exportando.set(true);
    try {
      const datos = { ...this.rangoMostrado(), ventas: this.ventas(), totales: this.totales() };
      if (formato === 'pdf') await exportarPdf(datos);
      else await exportarExcel(datos);
    } catch (e: any) {
      this.error.set('No se pudo exportar: ' + e.message);
    } finally {
      this.exportando.set(false);
    }
  }
}
