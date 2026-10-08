import { Component, computed, input, output } from '@angular/core';
import { Butaca, ORDEN_FILAS } from '../../../core/models/sala.model';

interface FilaMapa {
  fila: string;
  grupos: Butaca[][];
}

@Component({
  selector: 'app-mapa-butacas',
  standalone: true,
  templateUrl: './mapa-butacas.component.html',
  styleUrl: './mapa-butacas.component.css'
})
export class MapaButacasComponent {
  readonly butacas = input.required<Butaca[]>();
  readonly ocupadas = input<ReadonlySet<string>>(new Set());
  readonly seleccionadas = input<ReadonlySet<string>>(new Set());
  readonly soloLectura = input(false);

  readonly elegir = output<Butaca>();

  readonly filas = computed<FilaMapa[]>(() => {
    const porFila = new Map<string, Butaca[]>();
    for (const b of this.butacas()) {
      if (!porFila.has(b.fila)) porFila.set(b.fila, []);
      porFila.get(b.fila)!.push(b);
    }

    return ORDEN_FILAS.filter((f) => porFila.has(f)).map((fila) => {
      const lista = porFila.get(fila)!.sort((a, b) => a.numero - b.numero);
      const [izq, centro] = fila === 'ACC' ? [2, 10] : [4, 20];
      return {
        fila,
        grupos: [lista.slice(0, izq), lista.slice(izq, izq + centro), lista.slice(izq + centro)]
      };
    });
  });

  estado(b: Butaca): 'ocupada' | 'seleccionada' | 'libre' {
    if (this.ocupadas().has(b.id)) return 'ocupada';
    if (this.seleccionadas().has(b.id)) return 'seleccionada';
    return 'libre';
  }

  etiqueta(b: Butaca): string {
    const tipo = b.tipo === 'vip' ? ' · VIP' : b.tipo === 'accesible' ? ' · Accesible' : '';
    const fila = b.fila === 'ACC' ? 'Accesible' : `Fila ${b.fila}`;
    return `${fila}, butaca ${b.numero}${tipo}`;
  }

  click(b: Butaca) {
    if (this.soloLectura() || this.ocupadas().has(b.id)) return;
    this.elegir.emit(b);
  }
}
