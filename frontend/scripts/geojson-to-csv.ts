// Usage: npm run geojson-to-csv -- <file.geojson> [out.csv]
// Converts GeoJSON to a CSV with lat and lon columns, ready for `npm run import`.
import { convertGeojsonFile } from '../server/utils/geojson'

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--')
  if (args.length < 1 || args.length > 2) throw new Error('Usage: npm run geojson-to-csv -- <file.geojson> [out.csv]')
  const r = await convertGeojsonFile(args[0]!, args[1])
  console.log(`Wrote ${r.rows.toLocaleString('en-US')} rows (${r.skipped.toLocaleString('en-US')} features skipped) to ${r.outPath}`)
}

main().catch((e) => {
  console.error(`Conversion failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
