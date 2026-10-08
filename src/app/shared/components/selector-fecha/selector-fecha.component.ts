import { Component, computed, effect, input, output, signal } from '@angular/core';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface Partes {
  dia: number | null;
  mes: number | null;
  anio: number | null;
}

@Component({
  selector: 'app-selector-fecha',
  standalone: true,
  templateUrl: './selector-fecha.component.html',
  styleUrl: './selector-fecha.component.css'
})
export class SelectorFechaComponent {
  readonly valor = input<string>('');
  readonly anioDesde = input(new Date().getFullYear());
  readonly anioHasta = input(new Date().getFullYear() + 1);
  readonly etiqueta = input('Fecha');
  readonly cambio = output<string>();

  readonly meses = MESES;
  readonly partes = signal<Partes>({ dia: null, mes: null, anio: null });

  readonly anios = computed(() => {
    const desde = this.anioDesde();
    const hasta = this.anioHasta();
    const paso = desde <= hasta ? 1 : -1;
    const lista: number[] = [];
    for (let a = desde; paso > 0 ? a <= hasta : a >= hasta; a += paso) lista.push(a);
    return lista;
  });

  readonly dias = computed(() => {
    const { mes, anio } = this.partes();
    const cantidad = mes ? new Date(anio ?? 2000, mes, 0).getDate() : 31;
    return Array.from({ length: cantidad }, (_, i) => i + 1);
  });

  constructor() {
    effect(() => {
      const v = this.valor();
      if (v) {
        const [anio, mes, dia] = v.split('-').map(Number);
        this.partes.set({ dia, mes, anio });
      } else if (this.completa(this.partes())) {
        this.partes.set({ dia: null, mes: null, anio: null });
      }
    });
  }

  elegir(parte: keyof Partes, evento: Event) {
    const texto = (evento.target as HTMLSelectElement).value;
    const nuevas = { ...this.partes(), [parte]: texto ? Number(texto) : null };

    if (nuevas.dia && nuevas.mes) {
      const ultimo = new Date(nuevas.anio ?? 2000, nuevas.mes, 0).getDate();
      nuevas.dia = Math.min(nuevas.dia, ultimo);
    }

    this.partes.set(nuevas);
    this.cambio.emit(this.completa(nuevas) ? this.aTexto(nuevas) : '');
  }

  private completa(p: Partes): boolean {
    return p.dia !== null && p.mes !== null && p.anio !== null;
  }

  private aTexto(p: Partes): string {
    return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
  }
}
