import { Pipe, PipeTransform } from '@angular/core';

// Corta el texto sin partir palabras y agrega "…".
@Pipe({ name: 'textoCorto', standalone: true })
export class TextoCortoPipe implements PipeTransform {
  transform(texto: string | null | undefined, largoMaximo = 100): string {
    if (!texto) return '';
    if (texto.length <= largoMaximo) return texto;
    const cortado = texto.slice(0, largoMaximo);
    const ultimoEspacio = cortado.lastIndexOf(' ');
    return (ultimoEspacio > 0 ? cortado.slice(0, ultimoEspacio) : cortado) + '…';
  }
}
