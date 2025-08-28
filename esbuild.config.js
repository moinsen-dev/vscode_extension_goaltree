const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').BuildOptions}
 */
const baseConfig = {
  bundle: true,
  entryPoints: ['src/extension.ts'],
  external: ['vscode'],
  format: 'cjs',
  minify: production,
  outdir: 'out',
  platform: 'node',
  sourcemap: !production,
  target: 'node16',
  treeShaking: true,
  metafile: true,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
  },
  resolveExtensions: ['.ts', '.js'],
  mainFields: ['module', 'main'],
  conditions: ['node'],
  keepNames: true,
  legalComments: 'none',
  loader: {
    '.json': 'json',
  },
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@/types': path.resolve(__dirname, 'src/types'),
    '@/services': path.resolve(__dirname, 'src/services'),
    '@/models': path.resolve(__dirname, 'src/models'),
    '@/providers': path.resolve(__dirname, 'src/providers'),
    '@/utils': path.resolve(__dirname, 'src/utils'),
  },
  banner: {
    js: '// Goal Tree VS Code Extension - Bundled with esbuild',
  },
  drop: production ? ['console', 'debugger'] : [],
  plugins: [
    {
      name: 'bundle-analyzer',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.metafile && production) {
            const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: true });
            console.log('\n📊 Bundle Analysis:\n', analysis);
          }
        });
      }
    }
  ]
};

/**
 * Test configuration for bundling tests
 */
const testConfig = {
  ...baseConfig,
  entryPoints: ['src/test/**/*.test.ts'],
  outdir: 'out/test',
  external: ['vscode', 'mocha'],
  minify: false,
  sourcemap: true,
};

async function main() {
  const configs = [baseConfig];
  
  // Only build tests in development
  if (!production) {
    configs.push(testConfig);
  }

  if (watch) {
    console.log('👀 Watching for changes...');
    for (const config of configs) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
  } else {
    console.log(`🚀 Building extension (${production ? 'production' : 'development'})...`);
    for (const config of configs) {
      await esbuild.build(config);
    }
    console.log('✅ Build complete!');
    
    if (production) {
      console.log('\n📦 Production build optimizations applied:');
      console.log('  • Tree shaking enabled');
      console.log('  • Minification enabled');
      console.log('  • Console statements removed');
      console.log('  • Source maps disabled');
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Build failed:', e);
    process.exit(1);
  });
}

module.exports = { baseConfig, testConfig };