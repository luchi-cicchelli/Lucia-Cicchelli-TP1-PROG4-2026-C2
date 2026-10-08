with nuevas (nombre, sinopsis, duracion_minutos, fecha_estreno, restriccion_edad, generos) as (
  values
  ('Interstellar', 'Un grupo de astronautas atraviesa un agujero de gusano en busca de un nuevo hogar para la humanidad.', 169, date '2014-11-06', 13::int, array['Ciencia ficción', 'Drama']),
  ('Toy Story', 'Los juguetes de Andy cobran vida cuando nadie los ve, y la llegada de un astronauta revoluciona el cuarto.', 81, date '1995-11-22', null, array['Animación', 'Comedia']),
  ('El Conjuro', 'Una pareja de investigadores de lo paranormal ayuda a una familia aterrorizada en su nueva casa.', 112, date '2013-07-19', 18, array['Terror', 'Suspenso']),
  ('Mamma Mia!', 'Antes de su boda, una joven invita a tres hombres a una isla griega para descubrir cuál es su padre.', 108, date '2008-07-03', null, array['Musical', 'Comedia', 'Romance']),
  ('Mad Max: Furia en el camino', 'En un desierto postapocalíptico, una guerrera y un vagabundo huyen de un tirano a toda velocidad.', 120, date '2015-05-14', 13, array['Acción', 'Ciencia ficción']),
  ('Orgullo y prejuicio', 'Elizabeth Bennet y el señor Darcy chocan una y otra vez hasta descubrir lo que sienten.', 129, date '2005-11-11', null, array['Romance', 'Drama']),
  ('Relatos salvajes', 'Seis historias de personas comunes que pierden el control ante situaciones límite.', 122, date '2014-08-21', 18, array['Comedia', 'Drama', 'Suspenso']),
  ('El secreto de sus ojos', 'Un empleado judicial retirado escribe una novela sobre un crimen que lo persigue hace 25 años.', 129, date '2009-08-13', 13, array['Drama', 'Suspenso']),
  ('Parásitos', 'Una familia pobre se infiltra, de a uno, en la casa de una familia millonaria.', 132, date '2019-05-30', 13, array['Suspenso', 'Drama', 'Comedia']),
  ('Intensamente 2', 'Nuevas emociones llegan a la mente de Riley justo cuando empieza la adolescencia.', 96, date '2024-06-13', null, array['Animación', 'Comedia']),
  ('¡Huye!', 'Un joven visita a la familia de su novia y descubre que la amabilidad esconde algo siniestro.', 104, date '2017-02-24', 13, array['Terror', 'Suspenso']),
  ('Volver al futuro', 'Un adolescente viaja accidentalmente a 1955 y pone en riesgo su propia existencia.', 116, (current_date + 20), null, array['Ciencia ficción', 'Comedia']),
  ('Jurassic Park', 'Un parque con dinosaurios clonados se sale de control durante una visita de prueba.', 127, (current_date + 35), 13, array['Acción', 'Ciencia ficción', 'Suspenso'])
),
insertadas as (
  insert into public.peliculas (nombre, sinopsis, duracion_minutos, fecha_estreno, restriccion_edad)
  select nombre, sinopsis, duracion_minutos, fecha_estreno, restriccion_edad from nuevas
  returning id, nombre
)
insert into public.pelicula_generos (pelicula_id, genero_id)
select i.id, g.id
from insertadas i
join nuevas n on n.nombre = i.nombre
cross join lateral unnest(n.generos) as gn(nombre)
join public.generos g on g.nombre = gn.nombre;
