import { Pipe, PipeTransform } from '@angular/core';

// Fecha relativa: "recién", "hace 5 min", "hace 3 h", "ayer", "hace 4 días".
// Si pasó más de una semana devuelve la fecha (dd/mm/aaaa).
@Pipe({ name: 'hace', standalone: true })
export class HacePipe implements PipeTransform {
  transform(fecha: string | Date | null | undefined): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    const minutos = Math.floor((Date.now() - d.getTime()) / 60_000);

    if (minutos < 1) return 'recién';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return d.toLocaleDateString('es-AR');
  }
}
