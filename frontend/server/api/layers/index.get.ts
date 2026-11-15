import { getPool } from '../../utils/services'

export default defineEventHandler(async () => {
  const { rows } = await getPool().query('SELECT id, label, color, shape FROM layers ORDER BY created_at, id')
  return {
    layers: rows.map(r => ({
      id: r.id, label: r.label, color: r.color, shape: r.shape,
      description: `Imported from ${r.label}.csv`, source: `/api/layers/${r.id}`, imported: true,
    })),
  }
})
