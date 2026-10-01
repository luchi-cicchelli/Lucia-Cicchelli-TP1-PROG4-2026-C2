import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const SOLO_LETRAS = /^[\p{L}\s'-]+$/u;

/** Solo letras (con tildes y ñ), espacios, apóstrofes y guiones: sin números ni símbolos. */
export const soloLetras: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor: string = control.value ?? '';
  if (!valor.trim()) return null;
  return SOLO_LETRAS.test(valor.trim()) ? null : { soloLetras: true };
};
