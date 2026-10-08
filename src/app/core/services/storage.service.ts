import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type CarpetaImagenes = 'peliculas' | 'candy';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly bucket = 'imagenes';

  constructor(private supabase: SupabaseService) {}

  async subirImagen(archivo: File, carpeta: CarpetaImagenes): Promise<string> {
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ruta = `${carpeta}/${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from(this.bucket)
      .upload(ruta, archivo, { contentType: archivo.type });
    if (error) throw error;

    return this.supabase.client.storage.from(this.bucket).getPublicUrl(ruta).data.publicUrl;
  }
}
