import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
 plugins:[react()],resolve:{alias:{'@':resolve(import.meta.dirname,'src')}},
 server:{host:'127.0.0.1',port:3021,fs:{allow:[resolve(import.meta.dirname,'..')]}},
 preview:{host:'127.0.0.1',port:3021},build:{assetsDir:'static',chunkSizeWarningLimit:1500},
 define:{__APP_VERSION__:JSON.stringify('design-audit'),__APP_RELEASES__:'[]'}
});
