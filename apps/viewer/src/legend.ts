/**
 * Qué estados muestra la leyenda del plano.
 *
 * Antes se dibujaban los CINCO tokens de `UNIT_STATUSES` siempre, vinieran o
 * no en el proyecto: en Baleia el visitante leía "Reservado" y "No disponible"
 * sin que exista una sola unidad en esos estados, y en cambio "Próximamente"
 * —que sí es la mitad del plano— quedaba mezclado con estados fantasma. Una
 * leyenda que nombra colores que no están en el mapa enseña mal el mapa.
 *
 * Regla: la leyenda es el índice de lo que se ve, no el catálogo del sistema.
 * Es aritmética sobre `availability.json`, así que se prueba sin navegador.
 */
import { STATUS_TOKENS, isUnitStatus, type AvailabilityFile, type UnitStatus } from '@r360/core';

/**
 * Estados efectivamente presentes en la disponibilidad, en el orden canónico
 * de `STATUS_TOKENS` (disponible → reservado → … → próximamente), que es el
 * orden en que un comprador los lee: primero lo que puede comprar.
 *
 * Sin `availability.json` la lista queda vacía: los polígonos caen al estado
 * de fallback y la leyenda no tiene nada verdadero que decir todavía. Quien
 * la dibuja esconde el cartel en vez de mostrar cinco colores inventados.
 */
export function legendStatuses(availability: AvailabilityFile | null): UnitStatus[] {
  const present = new Set<UnitStatus>();
  for (const entry of Object.values(availability?.units ?? {})) {
    if (isUnitStatus(entry.s)) present.add(entry.s);
  }
  return [...present].sort((a, b) => STATUS_TOKENS[a].order - STATUS_TOKENS[b].order);
}
