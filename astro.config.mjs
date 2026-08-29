// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/src/data/database*']
      }
    }
  },

  adapter: node({
    mode: 'standalone'
  })
});