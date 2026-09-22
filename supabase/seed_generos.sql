insert into generos (nombre) values
  ('Acción'), ('Comedia'), ('Drama'), ('Romance'), ('Terror'),
  ('Ciencia ficción'), ('Animación'), ('Suspenso'), ('Documental'), ('Musical')
on conflict (nombre) do nothing;
