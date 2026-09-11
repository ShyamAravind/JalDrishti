import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Custom plugin to load .geojson files as parsed JSON objects in Vite
const geojsonLoader = () => {
  return {
    name: 'geojson-loader',
    transform(code: string, id: string) {
      if (id.endsWith('.geojson')) {
        return {
          code: `export default ${code};`,
          map: null
        }
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), geojsonLoader()],
})
