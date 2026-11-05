/**
 * Carga y valida el conjunto de datos.
 * Si el JSON es inválido, la importación lanza y el build se detiene.
 */

import raw from './matches.json';
import { config } from '../config';
import { parseDataset, type Dataset } from './schema';

export const dataset: Dataset = parseDataset(raw, {
  teamName: config.teamName,
});
